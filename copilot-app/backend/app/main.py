"""
Copilot App - Control Plane API — Phase 3: Live Copilot
Manages Agent Desktop, Customer signaling, Live Copilot, Audit Trail, and Safe Mode routing.

Phase 2 additions:
  - Log redaction filter installed at startup
  - Transcript redaction before copilot model
  - Recording timeline endpoint
  - Supervisor join prevention on WebSocket

Phase 3 additions:
  - Admin document upload / list / delete (role-gated)
  - Structured copilot suggestion endpoint backed by document retrieval
  - Provider interface (local by default, external off by default)
  - Live transcript ingestion endpoint
  - WebSocket broadcasts COPILOT_SUGGESTION messages to agent channel
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional
import uuid
import json
import logging

from .models.schemas import (
    CallSessionCreate,
    SafeModeStartRequest,
    SafeModeCompleteRequest,
    DocumentUploadRequest,
    DocumentDeleteResponse,
    CopilotSuggestionRequest,
    CopilotSuggestionResponse,
    TranscriptChunk,
)
from .services.call_manager import call_manager
from .services.audit_service import audit_service
from .services.recording_service import recording_service
from .services.redaction_filter import redact_transcript
from .services.log_redaction import install_log_redaction
from .services.copilot_service import copilot_service
from .services.provider import copilot_provider

# Phase 2: Install PCI log redaction filter on ALL loggers at startup
install_log_redaction()  # Root logger
install_log_redaction("uvicorn")
install_log_redaction("uvicorn.access")
install_log_redaction("uvicorn.error")
install_log_redaction("fastapi")

logger = logging.getLogger("copilot-app")

app = FastAPI(
    title="Zero-Trust PCI Voice Intercept - Control Plane",
    description="Control Plane managing Agent Desktop, Live Copilot, and PCI Isolation (Phase 3 Copilot)",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Role helper ────────────────────────────────────────────────────────────────

def _require_admin(x_agent_role: Optional[str]):
    """Raise 403 if the caller is not an admin."""
    if (x_agent_role or "agent").lower() != "admin":
        raise HTTPException(
            status_code=403,
            detail="FORBIDDEN: Admin role required for document management."
        )


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "plane": "control-plane (copilot-app)",
        "security_policy": "Zero cardholder data in control plane",
        "phase": "3-copilot",
        "log_redaction": "active",
        "transcript_redaction": "active",
        "supervisor_join_prevention": "active",
        "copilot_provider": copilot_provider.name,
        "document_count": len(copilot_service.list_documents()),
    }


# ── Call management ────────────────────────────────────────────────────────────

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


@app.post("/api/calls/{call_id}/safe-mode/cancel")
async def cancel_safe_mode_endpoint(call_id: str):
    res = await call_manager.cancel_safe_mode(call_id)
    return res


@app.post("/api/calls/{call_id}/reset")
async def reset_call_endpoint(call_id: str):
    call = call_manager.reset_call(call_id)
    await call_manager.broadcast_call_state(call_id, {
        "type": "SAFE_MODE_STATE",
        "safe_mode_active": False,
        "agent_isolated": False,
        "copilot_blackout": False,
        "recording_status": "NORMAL",
        "payment_session_id": None,
        "initial_data": None
    })
    return {"call_id": call_id, "status": "RESET", "safe_mode_active": False}


# ── Phase 3: Document Management (admin-only) ──────────────────────────────────

@app.post("/api/documents", status_code=201)
def upload_document(
    req: DocumentUploadRequest,
    x_agent_role: Optional[str] = Header(default="agent"),
):
    """Upload a new knowledge document. Requires admin role."""
    _require_admin(x_agent_role)
    try:
        doc = copilot_service.add_document(
            title=req.title,
            content=req.content,
            uploaded_by="admin",
        )
        return {"success": True, "document": doc}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/api/documents")
def list_documents():
    """List all knowledge documents. Available to all roles."""
    return {"documents": copilot_service.list_documents()}


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str):
    """Get a single document by ID."""
    doc = copilot_service.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@app.delete("/api/documents/{doc_id}")
def delete_document(
    doc_id: str,
    x_agent_role: Optional[str] = Header(default="agent"),
):
    """Delete a document. Requires admin role."""
    _require_admin(x_agent_role)
    deleted = copilot_service.delete_document(doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentDeleteResponse(
        success=True,
        doc_id=doc_id,
        message=f"Document {doc_id} deleted successfully."
    )


# ── Phase 3: Live Transcript Ingestion ────────────────────────────────────────

@app.post("/api/copilot/transcript")
async def ingest_transcript_chunk(req: TranscriptChunk):
    """
    Accepts a live transcript chunk from the frontend.
    Redacts it, stores it, generates a suggestion, and broadcasts
    the suggestion to all connected agent WebSocket clients.
    """
    call = call_manager.get_call(req.call_id)
    if not call:
        # Auto-create call session if it doesn't exist (demo mode)
        call = call_manager.create_call(call_id=req.call_id)

    # Enforce copilot blackout during Safe Mode
    if call.copilot_blackout:
        return {
            "call_id": req.call_id,
            "suggestion": "",
            "blackout": True,
            "model": "BLACKOUT",
        }

    # Redact PAN from transcript
    clean_text, redaction_count = redact_transcript(req.text)
    if redaction_count > 0:
        logger.warning(f"[Copilot] Redacted {redaction_count} PAN candidate(s) from transcript on call {req.call_id}")

    # Store for leak scanning
    audit_service.record_transcript_chunk(
        call_id=req.call_id,
        chunk=clean_text,
        speaker=req.speaker,
    )

    # Generate structured suggestion
    result = copilot_service.get_suggestion(
        transcript=clean_text,
        call_id=req.call_id,
        safe_mode_active=call.safe_mode_active,
    )
    if redaction_count > 0:
        result["redacted"] = True

    # Broadcast suggestion to all agent WebSocket connections for this call
    await call_manager.broadcast_to_role(req.call_id, "agent", {
        "type": "COPILOT_SUGGESTION",
        "call_id": req.call_id,
        "suggestion": result["suggestion"],
        "confidence": result["confidence"],
        "source_doc_title": result.get("source_doc_title"),
        "model": result["model"],
        "redacted": result.get("redacted", False),
    })

    return result


# ── Phase 3: Copilot Suggestion (direct query) ────────────────────────────────

@app.post("/api/copilot/suggest")
def get_copilot_suggestion(req: CopilotSuggestionRequest):
    """
    Direct copilot suggestion endpoint (no live-transcript broadcast).
    Kept for backward compatibility and manual queries.
    Enforces copilot blackout during Safe Mode.
    """
    call = call_manager.get_call(req.call_id)
    safe_mode = False

    if call:
        if call.copilot_blackout:
            raise HTTPException(
                status_code=403,
                detail="COPILOT_BLACKOUT: Suggestions and transcription strictly disabled during PCI Safe Mode."
            )
        safe_mode = call.safe_mode_active

    result = copilot_service.get_suggestion(
        transcript=req.utterance,
        call_id=req.call_id,
        safe_mode_active=safe_mode,
    )

    # Store redacted transcript
    clean_text, _ = redact_transcript(req.utterance)
    audit_service.record_transcript_chunk(
        call_id=req.call_id,
        chunk=clean_text,
        speaker="customer",
    )

    return result


# ── Audit ──────────────────────────────────────────────────────────────────────

@app.get("/api/audit")
def get_audit_trail(call_id: Optional[str] = None):
    return {
        "events": audit_service.get_events(call_id=call_id)
    }


@app.get("/api/audit/leak-scan")
def run_leak_scan():
    return audit_service.scan_for_card_leaks()


# ── Phase 2: Recording timeline ───────────────────────────────────────────────

@app.get("/api/calls/{call_id}/recording/timeline")
def get_recording_timeline(call_id: str):
    """Returns the full recording timeline with PCI gap markers."""
    timeline = recording_service.get_timeline(call_id)
    if "error" in timeline:
        raise HTTPException(status_code=404, detail=timeline["error"])
    return timeline


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/call/{call_id}/{role}")
async def call_websocket(websocket: WebSocket, call_id: str, role: str):
    """
    Role: 'agent' or 'customer'.
    Synchronizes call events, audio muting/isolation state, and WebRTC signaling.
    Phase 2: Enforces supervisor join prevention during Safe Mode.
    Phase 3: Forwards COPILOT_SUGGESTION messages to agent channel.
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
        "brand": call.brand,
        "copilot_provider": copilot_provider.name,
        "document_count": len(copilot_service.list_documents()),
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

            elif msg_type == "TRANSCRIPT_CHUNK":
                # Phase 2 + Phase 3: Redact transcript and generate suggestion
                if call.copilot_blackout:
                    # During Safe Mode — send blackout notice to agent only
                    await websocket.send_json({
                        "type": "COPILOT_SUGGESTION",
                        "call_id": call_id,
                        "suggestion": "",
                        "blackout": True,
                        "model": "BLACKOUT",
                    })
                    continue

                transcript_text = msg.get("text", "")
                speaker = msg.get("speaker", "customer")

                # Redact PAN before any processing
                redacted_text, redaction_count = redact_transcript(transcript_text)
                if redaction_count > 0:
                    logger.warning(f"[WS] Redacted PAN from transcript on call {call_id}")

                # Store redacted transcript for leak scanning
                audit_service.record_transcript_chunk(
                    call_id=call_id,
                    chunk=redacted_text,
                    speaker=speaker,
                )

                # Phase 3: Generate structured suggestion and broadcast to agent
                result = copilot_service.get_suggestion(
                    transcript=redacted_text,
                    call_id=call_id,
                    safe_mode_active=call.safe_mode_active,
                )
                if redaction_count > 0:
                    result["redacted"] = True

                await call_manager.broadcast_to_role(call_id, "agent", {
                    "type": "COPILOT_SUGGESTION",
                    "call_id": call_id,
                    "suggestion": result["suggestion"],
                    "confidence": result["confidence"],
                    "source_doc_title": result.get("source_doc_title"),
                    "model": result["model"],
                    "redacted": result.get("redacted", False),
                })

    except WebSocketDisconnect:
        call.connections[role].discard(websocket)
