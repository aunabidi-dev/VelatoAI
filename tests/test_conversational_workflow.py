"""
Unit and Integration Tests for Intelligent Conversational Payment Workflow
Tests:
  - Strict Luhn failure gating (stays in CAPTURING_PAN, does NOT advance to expiry)
  - Intelligent spoken failure prompts with brand and last4
  - Invalid expiry month gating (>12, stays in CAPTURING_EXPIRY)
  - Expired card gating (stays in CAPTURING_EXPIRY)
  - Invalid CVV gating (stays in CAPTURING_CVV)
"""
import pytest
import sys
import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "payment-service"))

from app.core.state_machine import PaymentSession, PaymentState  # type: ignore
from app.core.voice_agent import conversational_voice_agent  # type: ignore


def test_luhn_failure_blocks_advancement():
    session = PaymentSession(session_id="test_sess_01", call_id="test_call_01")
    session.start_capture()
    assert session.state == PaymentState.CAPTURING_PAN

    # Non-Luhn 16-digit number (e.g. 4000123456789010)
    invalid_pan = "4000 1234 5678 9010"
    res = session.process_pan_input(invalid_pan)

    # MUST NOT advance to CAPTURING_EXPIRY
    assert session.state == PaymentState.CAPTURING_PAN
    assert res["valid"] is False
    assert res["last4"] == "9010"
    assert res["brand"] == "Visa"
    assert "checksum" in res["prompt"].lower()
    assert "9010" in res["prompt"]


def test_luhn_success_advances_to_expiry():
    session = PaymentSession(session_id="test_sess_02", call_id="test_call_02")
    session.start_capture()
    assert session.state == PaymentState.CAPTURING_PAN

    # Valid Luhn Visa (4242424242424242)
    valid_pan = "4242 4242 4242 4242"
    res = session.process_pan_input(valid_pan)

    assert session.state == PaymentState.CAPTURING_EXPIRY
    assert res["valid"] is True
    assert res["last4"] == "4242"
    assert res["brand"] == "Visa"
    assert "expiration" in res["prompt"].lower()


def test_invalid_expiry_month_blocks_cvv():
    session = PaymentSession(session_id="test_sess_03", call_id="test_call_03")
    session.start_capture()
    session.process_pan_input("4242 4242 4242 4242")
    assert session.state == PaymentState.CAPTURING_EXPIRY

    # Month 18 (e.g. 18/35)
    res = session.process_expiry_input("18 35")
    assert session.state == PaymentState.CAPTURING_EXPIRY
    assert res["valid"] is False
    assert "18" in res["prompt"] or "month" in res["prompt"].lower()


def test_expired_card_blocks_cvv():
    session = PaymentSession(session_id="test_sess_04", call_id="test_call_04")
    session.start_capture()
    session.process_pan_input("4242 4242 4242 4242")
    assert session.state == PaymentState.CAPTURING_EXPIRY

    # Clearly expired card (05/2024)
    res = session.process_expiry_input("05 24")
    assert session.state == PaymentState.CAPTURING_EXPIRY
    assert res["valid"] is False
    assert "expired" in res["prompt"].lower()


def test_valid_expiry_advances_to_cvv():
    session = PaymentSession(session_id="test_sess_05", call_id="test_call_05")
    session.start_capture()
    session.process_pan_input("4242 4242 4242 4242")
    assert session.state == PaymentState.CAPTURING_EXPIRY

    # Valid future expiry (12/28)
    res = session.process_expiry_input("12 28")
    assert session.state == PaymentState.CAPTURING_CVV
    assert res["valid"] is True
    assert "security code" in res["prompt"].lower()


def test_hesitation_phrase_does_not_burn_attempts():
    session = PaymentSession(session_id="test_sess_06", call_id="test_call_06")
    session.start_capture()

    # Customer hesitates
    res = session.process_pan_input("hold on, let me grab my wallet")
    assert session.state == PaymentState.CAPTURING_PAN
    assert res["valid"] is False
    assert res["held"] is True
    assert session.pan_attempts == 0  # No attempt burned!
    assert "time" in res["prompt"].lower() or "ready" in res["prompt"].lower()


def test_security_question_reassurance():
    session = PaymentSession(session_id="test_sess_07", call_id="test_call_07")
    session.start_capture()

    # Customer asks about agent Alice hearing
    res = session.process_pan_input("can Alice hear me?")
    assert session.state == PaymentState.CAPTURING_PAN
    assert res["valid"] is False
    assert res["held"] is True
    assert session.pan_attempts == 0  # No attempt burned!
    assert "secure" in res["prompt"].lower() or "isolated" in res["prompt"].lower()


def test_in_flight_card_correction():
    session = PaymentSession(session_id="test_sess_08", call_id="test_call_08")
    session.start_capture()

    # Customer starts saying one thing, then corrects themselves mid-speech to a valid card (ending 0982)
    res = session.process_pan_input("4242 4242 wait no scratch that 4000 1234 5678 0982")
    assert session.state == PaymentState.CAPTURING_EXPIRY
    assert res["valid"] is True
    assert res["last4"] == "0982"
    assert res["brand"] == "Visa"


def test_partial_pan_chunking():
    session = PaymentSession(session_id="test_sess_09", call_id="test_call_09")
    session.start_capture()

    # Customer reads first 12 digits
    res1 = session.process_pan_input("4000 1234 5678")
    assert session.state == PaymentState.CAPTURING_PAN
    assert res1["action"] == "PARTIAL_PAN"
    assert res1["digits_count"] == 12
    assert "remaining" in res1["prompt"].lower()

    # Customer reads remaining 4 digits to complete the card (valid ending 0982)
    res2 = session.process_pan_input("0982")
    assert session.state == PaymentState.CAPTURING_EXPIRY
    assert res2["valid"] is True
    assert res2["last4"] == "0982"


def test_customer_transfer_request():
    session = PaymentSession(session_id="test_sess_10", call_id="test_call_10")
    session.start_capture()

    # Customer requests to speak to Alice
    res = session.process_pan_input("please transfer me back to Alice")
    assert res["action"] == "TRANSFER_TO_AGENT"
    assert res["aborted"] is True
    assert res["valid"] is False
    assert session.buffer.is_wiped is True
    assert "Alice" in res["prompt"]


def test_max_pan_retries_transfers_to_agent():
    session = PaymentSession(session_id="test_sess_11", call_id="test_call_11")
    session.start_capture()

    # 3 invalid attempts
    r1 = session.process_pan_input("4000 1234 5678 9010")
    assert r1.get("aborted") is not True
    assert session.state == PaymentState.CAPTURING_PAN

    r2 = session.process_pan_input("4000 1234 5678 9010")
    assert r2.get("aborted") is not True
    assert session.state == PaymentState.CAPTURING_PAN

    r3 = session.process_pan_input("4000 1234 5678 9010")
    assert r3.get("aborted") is True
    assert r3["valid"] is False
    assert r3["action"] == "TRANSFER_TO_AGENT"
    assert session.buffer.is_wiped is True
    assert "transferring" in r3["prompt"].lower() or "alice" in r3["prompt"].lower()

