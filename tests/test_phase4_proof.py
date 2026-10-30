"""
Phase 4 Tests: Proof and Polish
Verifies:
  - Cryptographic SHA-256 hash chaining of audit trail and tamper detection.
  - Audit trail export in JSON and CSV formats.
  - Recording timeline enriched segment offsets and PCI withheld duration.
  - Real-time latency telemetry endpoints and copilot performance metrics.
  - API endpoints for audit verification and timeline retrieval.
"""
import pytest
import sys
import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "copilot-app", "backend"))

from fastapi.testclient import TestClient
from app.main import app
from app.services.audit_service import AuditService
from app.services.recording_service import CallRecording, RecordingState


client = TestClient(app)


class TestCryptographicAuditTrail:
    def test_audit_chain_integrity_valid(self):
        audit = AuditService()
        audit.record_event(call_id="call_p4_01", event_type="CALL_CONNECTED", details="Initial call connected")
        audit.record_event(call_id="call_p4_01", event_type="SAFE_MODE_START", details="Safe mode started")
        audit.record_event(
            call_id="call_p4_01",
            event_type="SAFE_MODE_END",
            token_ref="tok_pci_test_123",
            last4="4242",
            brand="Visa",
            details="Tokenized"
        )

        verification = audit.verify_chain_integrity()
        assert verification["valid"] is True
        assert verification["status"] == "CRYPTOGRAPHICALLY_VERIFIED"
        assert verification["total_events"] == 3
        assert verification["algorithm"] == "SHA-256"
        assert len(verification["latest_hash"]) == 64

    def test_audit_chain_tamper_detection(self):
        audit = AuditService()
        audit.record_event(call_id="call_p4_02", event_type="CALL_CONNECTED", details="Clean event 1")
        e2 = audit.record_event(call_id="call_p4_02", event_type="SAFE_MODE_START", details="Clean event 2")
        audit.record_event(call_id="call_p4_02", event_type="SAFE_MODE_END", token_ref="tok_pci_456", details="Clean event 3")

        # Verify it starts valid
        assert audit.verify_chain_integrity()["valid"] is True

        # Malicious actor tampers with details in event 2 in memory
        e2["details"] = "Tampered details injected by adversary"

        tamper_result = audit.verify_chain_integrity()
        assert tamper_result["valid"] is False
        assert tamper_result["status"] == "TAMPER_DETECTED"
        assert tamper_result["broken_at_index"] == 1
        assert tamper_result["event_id"] == e2["id"]

    def test_audit_export_json_and_csv(self):
        audit = AuditService()
        audit.record_event(call_id="call_p4_03", event_type="CALL_CONNECTED", details="Call started")
        audit.record_event(
            call_id="call_p4_03",
            event_type="SAFE_MODE_END",
            token_ref="tok_pci_exp",
            last4="1111",
            brand="Visa"
        )

        # JSON Export
        json_exp = audit.export_audit_log(format_type="json")
        assert json_exp["format"] == "json"
        assert len(json_exp["events"]) == 2
        assert json_exp["verification"]["valid"] is True

        # CSV Export
        csv_exp = audit.export_audit_log(format_type="csv")
        assert csv_exp["format"] == "csv"
        assert "id,call_id,timestamp,event_type,token_ref,last4,brand,details,prev_hash,hash" in csv_exp["content"]
        assert "tok_pci_exp" in csv_exp["content"]
        assert csv_exp["verification"]["valid"] is True


class TestRecordingTimelineEnrichment:
    def test_recording_timeline_offsets_and_gaps(self):
        rec = CallRecording(call_id="call_p4_rec_01")
        rec.pause_for_pci(session_id="sess_p4")
        rec.resume_after_pci(token_ref="tok_pci_p4_gap", last4="5555", brand="Mastercard")

        tl = rec.get_timeline()
        assert tl["call_id"] == "call_p4_rec_01"
        assert tl["has_pci_gap"] is True
        assert tl["pci_gaps"] == 1
        assert tl["compliance_status"] == "PCI_GAP_ENFORCED"
        assert tl["withheld_duration_s"] >= 0.0

        # Check relative offsets exist on all segments
        segments = tl["segments"]
        for s in segments:
            assert "start_offset_s" in s
            assert "end_offset_s" in s
            assert s["duration_s"] >= 0.0

        pci_seg = [s for s in segments if s["type"] == "PCI_WITHHELD"][0]
        assert pci_seg["token_ref"] == "tok_pci_p4_gap"


class TestPhase4ApiEndpoints:
    def test_audit_verify_api_endpoint(self):
        res = client.get("/api/audit/verify")
        assert res.status_code == 200
        data = res.json()
        assert "valid" in data
        assert data["valid"] is True

    def test_audit_export_api_endpoint(self):
        res = client.get("/api/audit/export?format=json")
        assert res.status_code == 200
        data = res.json()
        assert data["format"] == "json"
        assert "verification" in data
        assert "events" in data

    def test_telemetry_latency_endpoint(self):
        res = client.get("/api/telemetry/latency")
        assert res.status_code == 200
        data = res.json()
        assert "copilot_suggestion" in data
        assert "audio_isolation" in data
        assert "tokenization_and_luhn" in data
        assert "leak_scanner" in data
        assert data["audio_isolation"]["p95_ms"] <= 100.0
        assert data["tokenization_and_luhn"]["p95_ms"] <= 500.0

    def test_recording_timeline_api_always_returns_object(self):
        res = client.get("/api/calls/call_new_unrecorded/recording/timeline")
        assert res.status_code == 200
        data = res.json()
        assert data["call_id"] == "call_new_unrecorded"
        assert "segments" in data
        assert len(data["segments"]) >= 1

