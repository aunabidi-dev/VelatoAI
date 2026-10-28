"""
Copilot App - Control Plane API
Manages Agent Desktop, Customer signaling, Live Copilot, Audit Trail, and Safe Mode routing.
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional
import uuid
import json

from .models.schemas import CallSessionCreate, SafeModeStartRequest, SafeModeCompleteRequest
from .services.call_manager import call_manager
from .services.audit_service import audit_service

app = FastAPI(
    title="Zero-Trust PCI Voice Intercept - Control Plane",
    description="Control Plane managing Agent Desktop, Live Copilot, and PCI Isolation",
    version="1.0.0"
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
        "security_policy": "Zero cardholder data in control plane"
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

    # In Phase 0/1: Simulated Meta Muse Spark Copilot response
    utterance_lower = query.utterance.lower()
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
        "model": "Muse Spark 1.3 (Simulated / Meta Model API)"
    }

@app.get("/api/audit")
def get_audit_trail(call_id: Optional[str] = None):
    return {
        "events": audit_service.get_events(call_id=call_id)
    }

@app.get("/api/audit/leak-scan")
def run_leak_scan():
    return audit_service.scan_for_card_leaks()

@app.websocket("/ws/call/{call_id}/{role}")
async def call_websocket(websocket: WebSocket, call_id: str, role: str):
    """
    Role: 'agent' or 'customer'.
    Synchronizes call events, audio muting/isolation state, and WebRTC signaling.
    """
    if role not in ["agent", "customer"]:
        await websocket.close(code=1008)
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
                # Forward live speech transcription to agent copilot
                dead = set()
                for peer in call.connections["agent"]:
                    try:
                        await peer.send_json(msg)
                    except Exception:
                        dead.add(peer)
                call.connections["agent"].difference_update(dead)

    except WebSocketDisconnect:
        call.connections[role].discard(websocket)
