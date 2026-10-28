"""
Phase 2 Tests: Recording Service
Verifies the server-side recording model with PCI-compliant gaps:
  - Recording starts when call connects
  - Pauses with withheld notice during Safe Mode
  - Resumes with token marker after Safe Mode
  - Timeline correctly shows audio/gap/audio segments
"""
import pytest
import sys
import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "copilot-app", "backend"))

from app.services.recording_service import (
    CallRecording,
    RecordingService,
    RecordingState,
)


class TestCallRecording:
    def test_initial_state_is_active(self):
        rec = CallRecording(call_id="call_rec_01")
        assert rec.state == RecordingState.ACTIVE
        assert rec.pci_gap_count == 0

    def test_pause_for_pci(self):
        rec = CallRecording(call_id="call_rec_02")
        result = rec.pause_for_pci(session_id="sess_01")

        assert result["state"] == "PAUSED_PCI"
        assert result["action"] == "PAUSED_FOR_PCI"
        assert rec.state == RecordingState.PAUSED_PCI
        assert rec.pci_gap_count == 1

    def test_resume_after_pci(self):
        rec = CallRecording(call_id="call_rec_03")
        rec.pause_for_pci(session_id="sess_01")
        result = rec.resume_after_pci(token_ref="tok_pci_abc123")

        assert result["state"] == "RESUMED"
        assert result["action"] == "RESUMED_AFTER_PCI"
        assert result["token_ref"] == "tok_pci_abc123"
        assert "PCI segment withheld" in result["pci_marker"]
        assert rec.state == RecordingState.RESUMED

    def test_cannot_pause_when_already_paused(self):
        rec = CallRecording(call_id="call_rec_04")
        rec.pause_for_pci()
        result = rec.pause_for_pci()
        assert "error" in result

    def test_cannot_resume_when_not_paused(self):
        rec = CallRecording(call_id="call_rec_05")
        result = rec.resume_after_pci(token_ref="tok_test")
        assert "error" in result

    def test_timeline_shows_correct_segments(self):
        """Full lifecycle: audio -> PCI gap -> resumed audio"""
        rec = CallRecording(call_id="call_rec_06")

        # Phase 1: Normal audio recording
        assert rec.state == RecordingState.ACTIVE

        # Phase 2: PCI pause
        rec.pause_for_pci(session_id="sess_timeline")

        # Phase 3: Resume
        rec.resume_after_pci(token_ref="tok_pci_timeline_test")

        timeline = rec.get_timeline()
        assert timeline["pci_gaps"] == 1

        segments = timeline["segments"]
        # Should have: AUDIO, NOTICE, PCI_WITHHELD, AUDIO (current)
        types = [s["type"] for s in segments]
        assert "AUDIO" in types
        assert "NOTICE" in types
        assert "PCI_WITHHELD" in types

        # The PCI_WITHHELD segment should have the token ref
        pci_seg = [s for s in segments if s["type"] == "PCI_WITHHELD"][0]
        assert pci_seg["token_ref"] == "tok_pci_timeline_test"
        assert "PCI segment withheld" in pci_seg["notice"]

    def test_has_pci_gap(self):
        rec = CallRecording(call_id="call_rec_07")
        assert rec.has_pci_gap() is False

        rec.pause_for_pci()
        assert rec.has_pci_gap() is True

    def test_stop_recording(self):
        rec = CallRecording(call_id="call_rec_08")
        result = rec.stop()
        assert result["state"] == "STOPPED"
        assert rec.state == RecordingState.STOPPED

    def test_multiple_pci_gaps(self):
        """Verify multiple Safe Mode sessions create multiple gaps."""
        rec = CallRecording(call_id="call_rec_09")

        rec.pause_for_pci(session_id="sess_1")
        rec.resume_after_pci(token_ref="tok_1")

        rec.pause_for_pci(session_id="sess_2")
        rec.resume_after_pci(token_ref="tok_2")

        assert rec.pci_gap_count == 2
        timeline = rec.get_timeline()
        pci_segments = [s for s in timeline["segments"] if s["type"] == "PCI_WITHHELD"]
        assert len(pci_segments) == 2


class TestRecordingService:
    def test_start_and_get_recording(self):
        svc = RecordingService()
        rec = svc.start_recording("call_svc_01")
        assert rec is not None
        assert rec.state == RecordingState.ACTIVE

        retrieved = svc.get_recording("call_svc_01")
        assert retrieved is rec

    def test_get_or_create(self):
        svc = RecordingService()
        rec1 = svc.get_or_create("call_svc_02")
        rec2 = svc.get_or_create("call_svc_02")
        assert rec1 is rec2  # Same instance

    def test_pause_and_resume_via_service(self):
        svc = RecordingService()
        svc.start_recording("call_svc_03")

        pause_result = svc.pause_for_pci("call_svc_03", session_id="sess_svc")
        assert pause_result["state"] == "PAUSED_PCI"

        resume_result = svc.resume_after_pci("call_svc_03", token_ref="tok_svc_test")
        assert resume_result["state"] == "RESUMED"

    def test_timeline_via_service(self):
        svc = RecordingService()
        svc.start_recording("call_svc_04")
        svc.pause_for_pci("call_svc_04")
        svc.resume_after_pci("call_svc_04", token_ref="tok_svc_timeline")

        timeline = svc.get_timeline("call_svc_04")
        assert timeline["pci_gaps"] == 1
        assert len(timeline["segments"]) >= 3

    def test_nonexistent_call_returns_error(self):
        svc = RecordingService()
        result = svc.get_timeline("nonexistent_call")
        assert "error" in result

