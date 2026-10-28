"""
Copilot App - Control Plane API — Phase 2 Hardened
Manages Agent Desktop, Customer signaling, Live Copilot, Audit Trail, and Safe Mode routing.

Phase 2 additions:
  - Log redaction filter installed at startup
  - Transcript redaction before copilot model
  - Recording timeline endpoint
  - Supervisor join prevention on WebSocket
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional
import uuid
import json
import logging

from .models.schemas import CallSessionCreate, SafeModeStartRequest, SafeModeCompleteRequest
from .services.call_manager import call_manager
from .services.audit_service import audit_service
from .services.recording_service import recording_service
from .services.redaction_filter import redact_transcript
from .services.log_redaction import install_log_redaction

# Phase 2: Install PCI log redaction filter on ALL loggers at startup
install_log_redaction()  # Root logger
install_log_redaction("uvicorn")
install_log_redaction("uvicorn.access")
install_log_redaction("uvicorn.error")
install_log_redaction("fastapi")

logger = logging.getLogger("copilot-app")

app = FastAPI(
    title="Zero-Trust PCI Voice Intercept - Control Plane",
    description="Control Plane managing Agent Desktop, Live Copilot, and PCI Isolation (Phase 2 Hardened)",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CopilotQuery(BaseModel):
    call_id: str
    utterance: str

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "plane": "control-plane (copilot-app)",
        "security_policy": "Zero cardholder data in control plane",
        "phase": "2-hardened",
        "log_redaction": "active",
        "transcript_redaction": "active",
        "supervisor_join_prevention": "active",
    }

@app.post("/api/calls")
def create_call(req: Optional[CallSessionCreate] = None):
    call_id = f"call_{uuid.uuid4().hex[:8]}"
    cust_name = req.customer_name if req else "Jane Doe"
    agent_id = req.agent_id if req else "agent_01"

    call = call_manager.create_call(call_id=call_id, customer_name=cust_name, agent_id=agent_id)
    return {
        "call_id": call.call_id,
        "customer_name": call.customer_name,
        "agent_id": call.agent_id,
        "created_at": call.created_at
    }

@app.get("/api/calls/{call_id}")
def get_call_status(call_id: str):
    call = call_manager.get_call(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    return {
        "call_id": call.call_id,
        "customer_name": call.customer_name,
        "agent_id": call.agent_id,
        "is_active": call.is_active,
        "safe_mode_active": call.safe_mode_active,
        "agent_isolated": call.agent_isolated,
        "recording_paused_pci": call.recording_paused_pci,
        "safe_mode_locked": call.safe_mode_locked,
        "token_ref": call.token_ref,
        "last4": call.last4,
        "brand": call.brand,
        "timeline_markers": call.pci_timeline_markers
    }

@app.post("/api/calls/{call_id}/safe-mode/start")
async def start_safe_mode(call_id: str):
    try:
        res = await call_manager.trigger_safe_mode(call_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/calls/{call_id}/safe-mode/complete")
async def complete_safe_mode(call_id: str, req: SafeModeCompleteRequest):
    try:
        res = await call_manager.complete_safe_mode(
            call_id=call_id,
            token=req.token,
            last4=req.last4,
            brand=req.brand
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/copilot/suggest")
def get_copilot_suggestion(query: CopilotQuery):
    call = call_manager.get_call(query.call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    # Enforce Copilot Blackout during Safe Mode
    if call.copilot_blackout:
        raise HTTPException(
            status_code=403,
            detail="COPILOT_BLACKOUT: Suggestions and transcription strictly disabled during PCI Safe Mode."
        )

    # Phase 2: Redact any PAN-like sequences from the transcript BEFORE
    # it reaches the copilot model or an outside provider
    redacted_utterance = call_manager.redact_transcript_text(query.utterance)

    # Phase 2: Store redacted transcript for leak scanning
    audit_service.record_transcript_chunk(
        call_id=query.call_id,
        chunk=redacted_utterance,
        speaker="customer"
    )

    # In Phase 0/1/2: Simulated Meta Muse Spark Copilot response
    utterance_lower = redacted_utterance.lower()
    suggestion = "Listen actively and verify customer's account."
    if "refund" in utterance_lower:
        suggestion = "Refund Policy: Standard refunds take 3-5 business days. Verify original payment method."
    elif "cancel" in utterance_lower:
        suggestion = "Retention Script: Offer 20% discount on renewal before processing cancellation."
    elif "upgrade" in utterance_lower or "pay" in utterance_lower or "card" in utterance_lower:
        suggestion = "Payment Intent Detected: Advise customer to wait for beep, then press [PCI SAFE MODE] button."

    return {
        "call_id": query.call_id,
        "status": "active",
        "suggestion": suggestion,
        "model": "Muse Spark 1.3 (Simulated / Meta Model API)",
        "transcript_redacted": redacted_utterance != query.utterance,
    }

@app.get("/api/audit")
def get_audit_trail(call_id: Optional[str] = None):
    return {
        "events": audit_service.get_events(call_id=call_id)
    }

@app.get("/api/audit/leak-scan")
def run_leak_scan():
    return audit_service.scan_for_card_leaks()

# Phase 2: Recording timeline endpoint
@app.get("/api/calls/{call_id}/recording/timeline")
def get_recording_timeline(call_id: str):
    """Returns the full recording timeline with PCI gap markers."""
    timeline = recording_service.get_timeline(call_id)
    if "error" in timeline:
        raise HTTPException(status_code=404, detail=timeline["error"])
    return timeline

@app.websocket("/ws/call/{call_id}/{role}")
async def call_websocket(websocket: WebSocket, call_id: str, role: str):
    """
    Role: 'agent' or 'customer'.
    Synchronizes call events, audio muting/isolation state, and WebRTC signaling.
    Phase 2: Enforces supervisor join prevention during Safe Mode.
    """
    if role not in ["agent", "customer"]:
        await websocket.close(code=1008)
        return

    # Phase 2: Supervisor join prevention
    if not call_manager.can_join_call(call_id, role):
        await websocket.close(code=1008, reason="SAFE_MODE_LOCKED: No new participants during PCI Safe Mode")
        logger.warning(f"Blocked {role} join attempt on call {call_id} during Safe Mode")
        return

    await websocket.accept()
    call = call_manager.get_call(call_id)
    if not call:
        call = call_manager.create_call(call_id=call_id)

    call.connections[role].add(websocket)

    # Send initial welcome state
    await websocket.send_json({
        "type": "INIT_STATE",
        "call_id": call_id,
        "role": role,
        "safe_mode_active": call.safe_mode_active,
        "agent_isolated": call.agent_isolated,
        "token_ref": call.token_ref,
        "last4": call.last4,
        "brand": call.brand
    })

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")

            if msg_type == "TRIGGER_SAFE_MODE" and role == "agent":
                await call_manager.trigger_safe_mode(call_id)
            elif msg_type == "SIGNAL" or msg_type == "AUDIO_RELAY":
                # Forward WebRTC signal or audio relay to the other party ONLY if not isolated
                other_role = "customer" if role == "agent" else "agent"
                if not call.agent_isolated:
                    dead = set()
                    for peer in call.connections[other_role]:
                        try:
                            await peer.send_json(msg)
                        except Exception:
                            dead.add(peer)
                    call.connections[other_role].difference_update(dead)
            elif msg_type == "TRANSCRIPT_CHUNK" and not call.copilot_blackout:
                # Phase 2: Redact transcript before forwarding to agent copilot
                transcript_text = msg.get("text", "")
                redacted_text = call_manager.redact_transcript_text(transcript_text)
                msg["text"] = redacted_text

                # Store redacted transcript for leak scanning
                audit_service.record_transcript_chunk(
                    call_id=call_id,
                    chunk=redacted_text,
                    speaker="customer"
                )

                dead = set()
                for peer in call.connections["agent"]:
                    try:
                        await peer.send_json(msg)
                    except Exception:
                        dead.add(peer)
                call.connections["agent"].difference_update(dead)

    except WebSocketDisconnect:
        call.connections[role].discard(websocket)
