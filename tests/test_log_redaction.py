"""
Phase 2 Tests: Log Redaction Filter
Verifies that Luhn-valid card numbers are masked in all log output
and that non-card digit sequences pass through unaltered.
"""
import pytest
import sys
import os
import logging
import io

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "payment-service"))

from app.core.log_redaction import (
    redact_pan_from_text,
    PCILogRedactionFilter,
    install_log_redaction,
    _quick_luhn,
)


class TestQuickLuhn:
    def test_valid_visa(self):
        assert _quick_luhn("4242424242424242") is True

    def test_valid_mastercard(self):
        assert _quick_luhn("5555555555554444") is True

    def test_valid_amex(self):
        assert _quick_luhn("378282246310005") is True

    def test_invalid_card(self):
        assert _quick_luhn("1234567890123456") is False

    def test_too_short(self):
        assert _quick_luhn("123456789012") is False

    def test_too_long(self):
        assert _quick_luhn("12345678901234567890") is False

    def test_empty(self):
        assert _quick_luhn("") is False

    def test_non_digit(self):
        assert _quick_luhn("abcdefghijklmnop") is False


class TestRedactPanFromText:
    def test_redacts_valid_visa_in_text(self):
        text = "Customer provided card 4242424242424242 for payment"
        result = redact_pan_from_text(text)
        assert "4242424242424242" not in result
        assert "[PAN REDACTED]" in result

    def test_redacts_visa_with_spaces(self):
        text = "Card number is 4242 4242 4242 4242"
        result = redact_pan_from_text(text)
        assert "[PAN REDACTED]" in result

    def test_redacts_visa_with_dashes(self):
        text = "Card: 4242-4242-4242-4242"
        result = redact_pan_from_text(text)
        assert "[PAN REDACTED]" in result

    def test_preserves_non_card_numbers(self):
        text = "Order #12345 for account 9876"
        result = redact_pan_from_text(text)
        assert result == text  # No change

    def test_preserves_non_luhn_long_numbers(self):
        text = "Reference number 1234567890123456"
        result = redact_pan_from_text(text)
        # 1234567890123456 does NOT pass Luhn, so should NOT be redacted
        assert "1234567890123456" in result

    def test_empty_string(self):
        assert redact_pan_from_text("") == ""

    def test_none_input(self):
        assert redact_pan_from_text(None) is None

    def test_multiple_pans_in_text(self):
        text = "Cards: 4242424242424242 and 5555555555554444"
        result = redact_pan_from_text(text)
        assert "4242424242424242" not in result
        assert "5555555555554444" not in result
        assert result.count("[PAN REDACTED]") == 2

    def test_token_ref_not_redacted(self):
        text = "Token: tok_pci_7c4a189f3b1e, last4: 4242"
        result = redact_pan_from_text(text)
        assert result == text  # Token refs should not be affected


class TestLogFilter:
    def test_filter_redacts_message(self):
        """Verifies the logging filter intercepts and redacts PAN from log messages."""
        filt = PCILogRedactionFilter()

        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="Processing card 4242424242424242",
            args=None, exc_info=None
        )
        filt.filter(record)
        assert "4242424242424242" not in record.msg
        assert "[PAN REDACTED]" in record.msg

    def test_filter_redacts_args(self):
        filt = PCILogRedactionFilter()

        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="Card: %s",
            args=("4242424242424242",), exc_info=None
        )
        filt.filter(record)
        assert "4242424242424242" not in record.args[0]

    def test_filter_passes_clean_messages(self):
        filt = PCILogRedactionFilter()

        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="Payment completed with token tok_pci_abc123",
            args=None, exc_info=None
        )
        filt.filter(record)
        assert "tok_pci_abc123" in record.msg

    def test_install_is_idempotent(self):
        """Installing the filter multiple times should not duplicate it."""
        test_logger = logging.getLogger("test_idempotent")
        initial_count = len([f for f in test_logger.filters if isinstance(f, PCILogRedactionFilter)])

        install_log_redaction("test_idempotent")
        install_log_redaction("test_idempotent")
        install_log_redaction("test_idempotent")

        count = len([f for f in test_logger.filters if isinstance(f, PCILogRedactionFilter)])
        assert count == initial_count + 1  # Only one added

    def test_end_to_end_log_output(self):
        """Full end-to-end: write a log with a PAN and verify it's redacted in output."""
        test_logger = logging.getLogger("test_e2e_redaction")
        test_logger.setLevel(logging.DEBUG)

        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.addFilter(PCILogRedactionFilter())
        test_logger.addHandler(handler)

        test_logger.info("Customer card is 4242424242424242")

        output = stream.getvalue()
        assert "4242424242424242" not in output
        assert "[PAN REDACTED]" in output

        # Cleanup
        test_logger.removeHandler(handler)

