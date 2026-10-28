"""
Zero-Trust PCI Payment Service — Phase 2 Hardened
Isolated Data Plane - Runs in customer VPC / protected container.
Never stores or transmits unmasked PAN or CVV to the control plane.

Phase 2 additions:
  - Log redaction filter installed at startup
  - Timeout check endpoint for active sessions
  - Enhanced abort with timeout tracking
"""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional
import uuid
import json
import logging

from .core.state_machine import PaymentSession, PaymentState
from .core.token_vault import vault
from .core.whisper_stt import whisper_engine
from .core.log_redaction import install_log_redaction

# Phase 2: Install PCI log redaction filter on ALL loggers at startup
install_log_redaction()  # Root logger
install_log_redaction("uvicorn")
install_log_redaction("uvicorn.access")
install_log_redaction("uvicorn.error")
install_log_redaction("fastapi")

logger = logging.getLogger("payment-service")

app = FastAPI(
    title="Zero-Trust PCI Payment Microservice",
    description="PCI Safe Mode Voice Intercept & Tokenization Service (Phase 2 Hardened)",
    version="2.0.0"
)

# Enable CORS for local dev & control plane
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory active payment sessions (isolated)
ACTIVE_SESSIONS: Dict[str, PaymentSession] = {}

class InitSessionRequest(BaseModel):
    call_id: str

class InputRequest(BaseModel):
    spoken_text: str

class ConfirmRequest(BaseModel):
    confirmed: bool

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "payment-service (Zero-Trust Data Plane)",
        "memory_sanitization": "enforced",
        "pci_dss_scope": "isolated",
        "phase": "2-hardened",
        "log_redaction": "active",
        "state_timeouts": "enforced",
    }

@app.post("/api/payment/session")
def create_payment_session(req: InitSessionRequest):
    session_id = f"sess_{uuid.uuid4().hex[:12]}"
    session = PaymentSession(session_id=session_id, call_id=req.call_id)
    ACTIVE_SESSIONS[session_id] = session

    # Automatically begin capture flow
    res = session.start_capture()
    logger.info(f"Payment session {session_id} created for call {req.call_id}")
    return res

@app.get("/api/payment/session/{session_id}/status")
def get_session_status(session_id: str):
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Phase 2: Check timeout on status poll
    timed_out = session.check_timeout()

    return {
        "session_id": session.session_id,
        "call_id": session.call_id,
        "state": session.state.value,
        "detected_brand": session.detected_brand,
        "expiry": session.expiry_str,
        "is_wiped": session.buffer.is_wiped,
        "token_result": session.token_result,
        "timed_out": timed_out or session.timed_out,
        "seconds_remaining": session.seconds_remaining(),
        "pan_attempts": session.pan_attempts,
        "expiry_attempts": session.expiry_attempts,
        "cvv_attempts": session.cvv_attempts,
    }

def get_or_create_session(session_id: str) -> PaymentSession:
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        session = PaymentSession(session_id=session_id, call_id="auto_call")
        session.start_capture()
        ACTIVE_SESSIONS[session_id] = session
    return session

@app.post("/api/payment/session/{session_id}/pan")
def submit_pan(session_id: str, req: InputRequest):
    session = get_or_create_session(session_id)
    return session.process_pan_input(req.spoken_text)

@app.post("/api/payment/session/{session_id}/expiry")
def submit_expiry(session_id: str, req: InputRequest):
    session = get_or_create_session(session_id)
    return session.process_expiry_input(req.spoken_text)

@app.post("/api/payment/session/{session_id}/cvv")
def submit_cvv(session_id: str, req: InputRequest):
    session = get_or_create_session(session_id)
    return session.process_cvv_input(req.spoken_text)

@app.post("/api/payment/session/{session_id}/audio")
async def submit_audio(session_id: str, file: UploadFile = File(...)):
    """
    Receives raw spoken audio from customer, runs Whisper CPU STT,
    and advances payment session state machine.
    """
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Phase 2: Check timeout before processing audio
    if session.check_timeout():
        return {
            "error": "Session timed out",
            "state": session.state.value,
            "timed_out": True,
        }

    audio_bytes = await file.read()
    stt_res = whisper_engine.process_spoken_card(
        audio_bytes,
        existing_digits=session.buffer.get_pan_raw()
    )
    transcript = stt_res.get("transcript", "") or stt_res.get("digits", "")

    if session.state == PaymentState.CAPTURING_PAN:
        state_res = session.process_pan_input(transcript)
    elif session.state == PaymentState.CAPTURING_EXPIRY:
        state_res = session.process_expiry_input(transcript)
    elif session.state == PaymentState.CAPTURING_CVV:
        state_res = session.process_cvv_input(transcript)
    elif session.state == PaymentState.CONFIRMING:
        confirmed = "yes" in transcript.lower() or "confirm" in transcript.lower()
        state_res = session.confirm_and_tokenize(confirmed)
    else:
        state_res = {"error": f"Invalid state {session.state}"}

    return {
        "stt": stt_res,
        "session_state": state_res
    }

@app.post("/api/payment/session/{session_id}/confirm")
def confirm_payment(session_id: str, req: ConfirmRequest):
    session = get_or_create_session(session_id)
    res = session.confirm_and_tokenize(req.confirmed)
    return res

@app.post("/api/payment/session/{session_id}/abort")
def abort_payment(session_id: str):
    session = get_or_create_session(session_id)
    session.abort("Aborted by client request")
    return {"session_id": session_id, "state": session.state.value, "wiped": session.buffer.is_wiped}

# Phase 2: Endpoint to check and enforce timeouts on all active sessions
@app.post("/api/payment/check-timeouts")
def check_all_timeouts():
    """
    Phase 2: Scans all active sessions for timeouts.
    Any session that has exceeded its state timeout is automatically
    aborted and wiped. Called periodically by the control plane.
    """
    timed_out_sessions = []
    for session_id, session in list(ACTIVE_SESSIONS.items()):
        if session.state in (PaymentState.RESUMING, PaymentState.FAILED, PaymentState.TIMED_OUT):
            continue
        if session.check_timeout():
            timed_out_sessions.append({
                "session_id": session_id,
                "call_id": session.call_id,
                "state": session.state.value,
                "wiped": session.buffer.is_wiped,
            })
            logger.info(f"Session {session_id} timed out and wiped")

    return {
        "checked": len(ACTIVE_SESSIONS),
        "timed_out": len(timed_out_sessions),
        "details": timed_out_sessions,
    }

@app.websocket("/ws/payment/{session_id}")
async def websocket_payment_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket channel for interactive voice/audio agent session.
    Allows real-time back and forth speech interaction directly with customer.
    """
    await websocket.accept()
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    # Send initial greeting prompt
    init_res = session.start_capture()
    await websocket.send_json({
        "type": "state_update",
        "data": init_res
    })

    try:
        while True:
            raw_data = await websocket.receive_text()
            msg = json.loads(raw_data)
            msg_type = msg.get("type")

            # Phase 2: Check timeout before processing any message
            if session.check_timeout():
                await websocket.send_json({
                    "type": "timeout",
                    "data": {
                        "state": session.state.value,
                        "wiped": session.buffer.is_wiped,
                        "message": "Session timed out. Memory wiped.",
                    }
                })
                break

            if msg_type == "spoken_pan":
                res = session.process_pan_input(msg.get("text", ""))
                await websocket.send_json({"type": "pan_result", "data": res})
            elif msg_type == "spoken_expiry":
                res = session.process_expiry_input(msg.get("text", ""))
                await websocket.send_json({"type": "expiry_result", "data": res})
            elif msg_type == "spoken_cvv":
                res = session.process_cvv_input(msg.get("text", ""))
                await websocket.send_json({"type": "cvv_result", "data": res})
            elif msg_type == "customer_confirm":
                res = session.confirm_and_tokenize(msg.get("confirmed", True))
                await websocket.send_json({"type": "completion", "data": res})
            elif msg_type == "abort":
                session.abort("Aborted via websocket")
                await websocket.send_json({"type": "aborted", "data": {"state": session.state.value, "wiped": True}})
                break
    except WebSocketDisconnect:
        # Hang-up or disconnect during payment: automatically wipe memory immediately!
        if session.state not in (PaymentState.RESUMING, PaymentState.FAILED, PaymentState.TIMED_OUT):
            session.abort("Customer disconnected during payment")
            logger.info(f"Session {session_id}: hang-up wipe triggered")
