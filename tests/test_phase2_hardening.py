"""
Phase 2 End-to-End Zero-Trust Hardening Integration Test
Verifies all Phase 2 criteria:
  - Server-enforced isolation (agent audio severed)
  - Recording pause with withheld notice and timeline gap
  - Copilot blackout & input transcript redaction
  - Memory-only buffers with verified zeroization
  - Supervisor join prevention during Safe Mode
  - Log redaction filter active
  - Multi-store leak scanner confirming zero leaks
  - Recording resumed with token reference marker
"""
import pytest
import sys
import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "payment-service"))

from app.core.state_machine import PaymentSession, PaymentState

sys.path.pop(0)
sys.path.insert(0, os.path.join(base_dir, "copilot-app", "backend"))

import importlib
backend_call_mgr = importlib.import_module("app.services.call_manager")
CallManager = backend_call_mgr.CallManager
backend_audit = importlib.import_module("app.services.audit_service")
audit_service = backend_audit.audit_service
backend_rec = importlib.import_module("app.services.recording_service")
recording_service = backend_rec.recording_service
backend_redact = importlib.import_module("app.services.redaction_filter")
redact_transcript = backend_redact.redact_transcript


@pytest.mark.asyncio
async def test_phase2_zero_trust_hardening_lifecycle():
    call_mgr = CallManager()
    call_id = "call_phase2_test_404"

    # 1. Normal Call Starts: Both sides connected, recording active
    call = call_mgr.create_call(call_id=call_id, customer_name="Bob Ross", agent_id="agent_99")
    assert call.is_active is True
    assert call.safe_mode_active is False
    assert call.agent_isolated is False
    assert call.copilot_blackout is False
    assert call.safe_mode_locked is False

    # Verify initial recording state
    rec = recording_service.get_recording(call_id)
    assert rec is not None
    assert rec.state.value == "ACTIVE"
    assert rec.has_pci_gap() is False

    # 2. Early Slip Handling: Customer speaks a card number during normal conversation
    # The transcript redaction filter MUST mask this before it travels to any model
    early_slip = "Actually, my card number is 4242424242424242 can you charge it?"
    sanitized = call_mgr.redact_transcript_text(early_slip)
    assert "4242424242424242" not in sanitized
    assert "[CARD NUMBER REDACTED]" in sanitized

    # Store sanitized transcript in audit store
    audit_service.record_transcript_chunk(call_id=call_id, chunk=sanitized, speaker="customer")

    # 3. Agent triggers PCI Safe Mode
    safe_res = await call_mgr.trigger_safe_mode(call_id)
    assert safe_res["status"] == "SAFE_MODE_ACTIVE"
    assert call.agent_isolated is True
    assert call.copilot_blackout is True
    assert call.safe_mode_locked is True

    # 4. Supervisor Join Prevention Check
    # Supervisors, observers, or extra agents CANNOT join during Safe Mode
    assert call_mgr.can_join_call(call_id, role="supervisor") is False
    assert call_mgr.can_join_call(call_id, role="observer") is False

    # 5. Recording Gap Verified
    # Recording paused with withheld notice
    rec_timeline = recording_service.get_timeline(call_id)
    assert rec_timeline["pci_gaps"] == 1
    segments = rec_timeline["segments"]
    segment_types = [s["type"] for s in segments]
    assert "NOTICE" in segment_types
    assert "PCI_WITHHELD" in segment_types

    # 6. Payment Voice Agent Session Lifecycle
    pay_sess = PaymentSession(session_id="sess_p2_01", call_id=call_id)
    greeting = pay_sess.start_capture()
    assert pay_sess.state == PaymentState.CAPTURING_PAN
    assert greeting["timeout_seconds"] is not None

    # Step: Spoken card capture
    pan_res = pay_sess.process_pan_input("four two four two four two four two four two four two four two four two")
    assert pay_sess.state == PaymentState.CAPTURING_EXPIRY
    assert pan_res["brand"] == "Visa"
    assert pan_res["last4"] == "4242"

    # Step: Expiry & CVV capture
    exp_res = pay_sess.process_expiry_input("twelve twenty eight")
    assert pay_sess.state == PaymentState.CAPTURING_CVV

    cvv_res = pay_sess.process_cvv_input("789")
    assert pay_sess.state == PaymentState.CONFIRMING

    # Step: Readback confirmation -> Tokenization -> Immediate Memory Zeroization
    comp_res = pay_sess.confirm_and_tokenize(customer_confirmed=True)
    assert comp_res["success"] is True
    assert comp_res["token"].startswith("tok_pci_")
    assert comp_res["wiped_confirmed"] is True
    assert pay_sess.buffer.is_wiped is True
    assert pay_sess.buffer.get_pan_raw() == ""
    assert pay_sess.buffer.get_cvv_raw() == ""
    assert pay_sess.buffer.get_expiry() == ""

    # 7. Resuming normal call
    resumed = await call_mgr.complete_safe_mode(
        call_id=call_id,
        token=comp_res["token"],
        last4=comp_res["last4"],
        brand=comp_res["brand"]
    )
    assert resumed["status"] == "RESUMED"
    assert call.agent_isolated is False
    assert call.copilot_blackout is False
    assert call.safe_mode_locked is False

    # 8. Recording Resumed and Marker Verified
    final_timeline = recording_service.get_timeline(call_id)
    assert final_timeline["pci_gaps"] == 1
    pci_segment = [s for s in final_timeline["segments"] if s["type"] == "PCI_WITHHELD"][0]
    assert pci_segment["token_ref"] == comp_res["token"]
    assert f"PCI segment withheld, token ref {comp_res['token']}" in pci_segment["notice"]

    # 9. Automated Leak Scanner: Must scan all stores and find exactly 0 leaks
    scan_report = audit_service.scan_for_card_leaks()
    assert scan_report["status"] == "COMPLIANT_ZERO_TRUST"
    assert scan_report["leaks_found"] == 0

