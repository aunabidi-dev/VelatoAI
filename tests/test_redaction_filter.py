"""
Phase 2 Tests: Copilot Transcript Redaction Filter
Verifies that PAN-like sequences are masked before any transcript
reaches the copilot model or an outside AI provider.
"""
import pytest
import sys
import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "copilot-app", "backend"))

from app.services.redaction_filter import (  # type: ignore
    redact_transcript,
    is_transcript_clean,
)


class TestRedactTranscript:
    def test_redacts_valid_visa(self):
        text = "my card number is 4242424242424242 and I want to pay"
        redacted, count = redact_transcript(text)
        assert "4242424242424242" not in redacted
        assert "[CARD NUMBER REDACTED]" in redacted
        assert count == 1

    def test_redacts_visa_with_spaces(self):
        text = "it's 4242 4242 4242 4242"
        redacted, count = redact_transcript(text)
        assert "[CARD NUMBER REDACTED]" in redacted
        assert count == 1

    def test_preserves_normal_speech(self):
        text = "I would like to upgrade my plan to the premium tier"
        redacted, count = redact_transcript(text)
        assert redacted == text
        assert count == 0

    def test_preserves_short_numbers(self):
        text = "my order number is 12345 and I called 3 times"
        redacted, count = redact_transcript(text)
        assert redacted == text
        assert count == 0

    def test_preserves_non_luhn_long_numbers(self):
        text = "reference 1234567890123456 is not a card"
        redacted, count = redact_transcript(text)
        assert "1234567890123456" in redacted
        assert count == 0

    def test_empty_input(self):
        redacted, count = redact_transcript("")
        assert redacted == ""
        assert count == 0

    def test_none_input(self):
        redacted, count = redact_transcript(None)  # type: ignore
        assert redacted is None
        assert count == 0

    def test_multiple_pans(self):
        text = "cards 4242424242424242 and 5555555555554444"
        redacted, count = redact_transcript(text)
        assert "4242424242424242" not in redacted
        assert "5555555555554444" not in redacted
        assert count == 2

    def test_amex_redacted(self):
        text = "my amex is 378282246310005"
        redacted, count = redact_transcript(text)
        assert "378282246310005" not in redacted
        assert count == 1


class TestIsTranscriptClean:
    def test_clean_transcript(self):
        assert is_transcript_clean("I want to cancel my subscription") is True

    def test_dirty_transcript(self):
        assert is_transcript_clean("my card is 4242424242424242") is False

    def test_empty_is_clean(self):
        assert is_transcript_clean("") is True

