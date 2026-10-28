"""
Phase 2 Tests: State Machine Timeouts & Retry Limits
Verifies that:
  - Each capture state times out and auto-wipes after the configured duration
  - Per-field retry limits are enforced (PAN, expiry, CVV)
  - Timeout forces immediate memory zeroization
"""
import pytest
import sys
import os
import time

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "payment-service"))

from app.core.state_machine import (
    PaymentSession,
    PaymentState,
    STATE_TIMEOUT_SECONDS,
    MAX_PAN_RETRIES,
    MAX_EXPIRY_RETRIES,
    MAX_CVV_RETRIES,
)


class TestStateTimeouts:
    def test_timeout_config_exists(self):
        """Verify timeout configuration exists for all capture states."""
        assert "CAPTURING_PAN" in STATE_TIMEOUT_SECONDS
        assert "CAPTURING_EXPIRY" in STATE_TIMEOUT_SECONDS
        assert "CAPTURING_CVV" in STATE_TIMEOUT_SECONDS
        assert "CONFIRMING" in STATE_TIMEOUT_SECONDS
        assert "TOKENIZING" in STATE_TIMEOUT_SECONDS

    def test_no_timeout_when_within_limit(self):
        """Session should not time out when within the limit."""
        session = PaymentSession(session_id="test_timeout_1", call_id="call_t1")
        session.start_capture()
        assert session.check_timeout() is False
        assert session.state == PaymentState.CAPTURING_PAN

    def test_timeout_forces_wipe(self):
        """When a state times out, memory must be immediately wiped."""
        session = PaymentSession(session_id="test_timeout_2", call_id="call_t2")
        session.start_capture()

        # Simulate PAN input then force timeout on expiry
        session.process_pan_input("4242424242424242")
        assert session.state == PaymentState.CAPTURING_EXPIRY

        # Force the state_entered_at to be in the past
        session.state_entered_at = time.time() - 999

        assert session.check_timeout() is True
        assert session.buffer.is_wiped is True
        assert session.timed_out is True

    def test_timeout_during_pan_capture(self):
        """PAN capture timeout forces abort and wipe."""
        session = PaymentSession(session_id="test_timeout_3", call_id="call_t3")
        session.start_capture()

        # Force timeout
        session.state_entered_at = time.time() - 999

        result = session.process_pan_input("four two four two")
        assert result.get("timed_out") is True
        assert session.buffer.is_wiped is True

    def test_timeout_during_cvv_capture(self):
        """CVV capture timeout forces abort and wipe."""
        session = PaymentSession(session_id="test_timeout_4", call_id="call_t4")
        session.start_capture()
        session.process_pan_input("4242424242424242")
        session.process_expiry_input("12/28")
        assert session.state == PaymentState.CAPTURING_CVV

        # Force timeout
        session.state_entered_at = time.time() - 999

        result = session.process_cvv_input("123")
        assert result.get("timed_out") is True
        assert session.buffer.is_wiped is True

    def test_timeout_during_confirmation(self):
        """Confirmation timeout forces abort and wipe."""
        session = PaymentSession(session_id="test_timeout_5", call_id="call_t5")
        session.start_capture()
        session.process_pan_input("4242424242424242")
        session.process_expiry_input("12/28")
        session.process_cvv_input("123")
        assert session.state == PaymentState.CONFIRMING

        # Force timeout
        session.state_entered_at = time.time() - 999

        result = session.confirm_and_tokenize(True)
        assert result.get("timed_out") is True
        assert session.buffer.is_wiped is True

    def test_seconds_remaining(self):
        """seconds_remaining() returns correct value."""
        session = PaymentSession(session_id="test_timeout_6", call_id="call_t6")
        session.start_capture()
        remaining = session.seconds_remaining()
        assert remaining is not None
        assert remaining > 0
        assert remaining <= STATE_TIMEOUT_SECONDS["CAPTURING_PAN"]


class TestRetryLimits:
    def test_pan_retry_limit(self):
        """PAN capture allows exactly MAX_PAN_RETRIES attempts before abort."""
        session = PaymentSession(session_id="test_retry_pan", call_id="call_r1")
        session.start_capture()

        for i in range(MAX_PAN_RETRIES - 1):
            result = session.process_pan_input("1234")  # Too short
            assert result.get("aborted") is not True
            assert session.state == PaymentState.CAPTURING_PAN

        # Final attempt should abort
        result = session.process_pan_input("1234")
        assert result.get("aborted") is True
        assert session.buffer.is_wiped is True

    def test_expiry_retry_limit(self):
        """Expiry input allows exactly MAX_EXPIRY_RETRIES attempts before abort."""
        session = PaymentSession(session_id="test_retry_exp", call_id="call_r2")
        session.start_capture()
        session.process_pan_input("4242424242424242")
        assert session.state == PaymentState.CAPTURING_EXPIRY

        for i in range(MAX_EXPIRY_RETRIES - 1):
            result = session.process_expiry_input("invalid")
            assert result.get("aborted") is not True
            assert session.state == PaymentState.CAPTURING_EXPIRY

        # Final attempt should abort
        result = session.process_expiry_input("invalid")
        assert result.get("aborted") is True
        assert session.buffer.is_wiped is True

    def test_cvv_retry_limit(self):
        """CVV input allows exactly MAX_CVV_RETRIES attempts before abort."""
        session = PaymentSession(session_id="test_retry_cvv", call_id="call_r3")
        session.start_capture()
        session.process_pan_input("4242424242424242")
        session.process_expiry_input("12/28")
        assert session.state == PaymentState.CAPTURING_CVV

        for i in range(MAX_CVV_RETRIES - 1):
            result = session.process_cvv_input("x")  # Invalid
            assert result.get("aborted") is not True
            assert session.state == PaymentState.CAPTURING_CVV

        # Final attempt should abort
        result = session.process_cvv_input("x")
        assert result.get("aborted") is True
        assert session.buffer.is_wiped is True

    def test_confirmation_rejection_resets_retries(self):
        """When customer rejects confirmation, retry counters reset for the restart."""
        session = PaymentSession(session_id="test_retry_reset", call_id="call_r4")
        session.start_capture()
        session.process_pan_input("4242424242424242")
        session.process_expiry_input("12/28")
        session.process_cvv_input("123")
        assert session.state == PaymentState.CONFIRMING

        # Customer says no
        result = session.confirm_and_tokenize(False)
        assert result.get("restarted") is True
        assert session.pan_attempts == 0
        assert session.expiry_attempts == 0
        assert session.cvv_attempts == 0

