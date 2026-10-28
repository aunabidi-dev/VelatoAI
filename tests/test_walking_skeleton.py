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

@pytest.mark.asyncio
async def test_full_walking_skeleton_flow():
    """
    Validates Phase 1 Walking Skeleton:
    1. Call is initialized (Agent + Customer).
    2. Agent triggers PCI Safe Mode -> Agent audio isolated, copilot blackout enforced, recording marked.
    3. Payment Service initiates session and greets customer.
    4. Customer provides test card by voice ('four two four two...').
    5. Luhn algorithm validates card.
    6. Expiry and CVV collected.
    7. Readback confirmation (Last 4 and expiry only).
    8. Tokenization occurs -> token received.
    9. Memory buffers zeroed out & verified wiped.
    10. Call hands back to agent with token ref & last 4 only.
    11. Audit log recorded without any card data.
    12. Leak scanner confirms 0 card number leaks in system.
    """
    call_mgr = CallManager()
    call_id = "test_call_101"
    
    # 1. Start Call
    call = call_mgr.create_call(call_id=call_id, customer_name="Alice Smith", agent_id="agent_42")
    assert call.is_active is True
    assert call.agent_isolated is False
    assert call.recording_paused_pci is False

    # 2. Agent triggers PCI Safe Mode
    safe_mode_res = await call_mgr.trigger_safe_mode(call_id)
    assert safe_mode_res["status"] == "SAFE_MODE_ACTIVE"
    assert call.agent_isolated is True
    assert call.copilot_blackout is True
    assert call.recording_paused_pci is True
    assert len(call.pci_timeline_markers) == 1
    assert call.pci_timeline_markers[0]["type"] == "PCI_GAP_START"

    # 3. Payment Service launches session
    pay_session = PaymentSession(session_id="test_sess_99", call_id=call_id)
    greeting = pay_session.start_capture()
    assert pay_session.state == PaymentState.CAPTURING_PAN
    assert "isolated" in greeting["prompt"].lower()

    # 4 & 5. Spoken Card Input & Luhn validation
    pan_resp = pay_session.process_pan_input("four two four two four two four two four two four two four two four two")
    assert pay_session.state == PaymentState.CAPTURING_EXPIRY
    assert pan_resp["brand"] == "Visa"

    # 6. Expiry & CVV input
    exp_resp = pay_session.process_expiry_input("twelve twenty eight")
    assert pay_session.state == PaymentState.CAPTURING_CVV
    
    cvv_resp = pay_session.process_cvv_input("one two three")
    assert pay_session.state == PaymentState.CONFIRMING
    assert cvv_resp["last4"] == "4242"
    assert cvv_resp["brand"] == "Visa"

    # 7 & 8 & 9. Customer confirms -> Tokenize -> Memory Wipe
    comp_resp = pay_session.confirm_and_tokenize(customer_confirmed=True)
    assert comp_resp["success"] is True
    assert comp_resp["token"].startswith("tok_pci_")
    assert comp_resp["last4"] == "4242"
    assert comp_resp["wiped_confirmed"] is True
    assert pay_session.buffer.is_wiped is True
    assert pay_session.buffer.get_pan_raw() == ""

    # 10. Hand back to Agent Desktop
    resumed = await call_mgr.complete_safe_mode(
        call_id=call_id,
        token=comp_resp["token"],
        last4=comp_resp["last4"],
        brand=comp_resp["brand"]
    )
    assert resumed["status"] == "RESUMED"
    assert call.agent_isolated is False
    assert call.copilot_blackout is False
    assert call.recording_paused_pci is False
    assert call.token_ref == comp_resp["token"]
    assert call.last4 == "4242"
    assert len(call.pci_timeline_markers) == 2
    assert call.pci_timeline_markers[1]["type"] == "PCI_GAP_END"

    # 11 & 12. Security Audit verification and Leak Scanning
    scan_results = audit_service.scan_for_card_leaks()
    assert scan_results["status"] == "COMPLIANT_ZERO_TRUST"
    assert scan_results["leaks_found"] == 0
