"""
Phase 2 Tests: Enhanced Multi-Source Leak Scanner
Verifies that:
  - The leak scanner checks audit events, transcript store, and recording metadata.
  - Non-card and non-Luhn sequences are ignored.
  - Any Luhn-valid card sequence is flagged.
  - Zero-trust compliance check fails if any leak is detected.
"""
import pytest
import sys
import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "copilot-app", "backend"))

from app.services.audit_service import (
    AuditService,
    scan_string_for_pan,
    _quick_luhn,
)


class TestStringScanner:
    def test_detects_luhn_valid_card(self):
        matches = scan_string_for_pan("customer card 4242424242424242 processed")
        assert len(matches) == 1
        assert matches[0] == "****4242"

    def test_ignores_non_luhn_number(self):
        matches = scan_string_for_pan("reference id 1234567890123456 created")
        assert len(matches) == 0

    def test_ignores_short_numbers(self):
        matches = scan_string_for_pan("order 123456789 amount $50.00")
        assert len(matches) == 0

    def test_detects_multiple_cards(self):
        text = "Cards: 4242-4242-4242-4242 and 5555 5555 5555 4444"
        matches = scan_string_for_pan(text)
        assert len(matches) == 2


class TestAuditServiceLeakScanner:
    def test_clean_state_returns_compliant(self):
        audit = AuditService()
        audit.record_event(
            call_id="call_clean_01",
            event_type="CALL_CONNECTED",
            details="Call connected with Alice"
        )
        audit.record_event(
            call_id="call_clean_01",
            event_type="SAFE_MODE_END",
            token_ref="tok_pci_7c4a189f3b1e",
            last4="4242",
            brand="Visa",
            details="Tokenized successfully"
        )
        audit.record_transcript_chunk(
            call_id="call_clean_01",
            chunk="I would like to pay for the tier 1 plan [CARD NUMBER REDACTED]",
            speaker="customer"
        )
        audit.record_recording_metadata(
            call_id="call_clean_01",
            metadata={"token_ref": "tok_pci_7c4a189f3b1e", "last4": "4242"}
        )

        report = audit.scan_for_card_leaks()
        assert report["status"] == "COMPLIANT_ZERO_TRUST"
        assert report["leaks_found"] == 0
        assert report["total_records_checked"] == 4

    def test_detects_leak_in_transcript_store(self):
        audit = AuditService()
        # Simulated unredacted leak slipping into transcript store
        audit.record_transcript_chunk(
            call_id="call_leaky_01",
            chunk="customer said 4242424242424242 out loud",
            speaker="customer"
        )

        report = audit.scan_for_card_leaks()
        assert report["status"] == "BREACH_DETECTED"
        assert report["leaks_found"] == 1
        assert report["details"][0]["source"] == "transcript"

    def test_detects_leak_in_recording_metadata(self):
        audit = AuditService()
        audit.record_recording_metadata(
            call_id="call_leaky_02",
            metadata={"raw_card": "5555555555554444", "status": "saved"}
        )

        report = audit.scan_for_card_leaks()
        assert report["status"] == "BREACH_DETECTED"
        assert report["leaks_found"] == 1
        assert report["details"][0]["source"] == "recording_metadata"

    def test_record_event_rejects_card_digits_upfront(self):
        """AuditService.record_event must actively reject raw PANs from being written."""
        audit = AuditService()
        with pytest.raises(ValueError, match="Security Violation"):
            audit.record_event(
                call_id="call_reject_01",
                event_type="UNAUTHORIZED_LOG",
                details="Accidental raw log with 4242424242424242"
            )

