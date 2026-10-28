"""
Zero-Trust PCI Payment Service
Isolated Data Plane - Runs in customer VPC / protected container.
Never stores or transmits unmasked PAN or CVV to the control plane.
"""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional
import uuid
import json

from .core.state_machine import PaymentSession, PaymentState
from .core.token_vault import vault
from .core.whisper_stt import whisper_engine

app = FastAPI(
    title="Zero-Trust PCI Payment Microservice",
    description="PCI Safe Mode Voice Intercept & Tokenization Service",
    version="1.0.0"
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
        "pci_dss_scope": "isolated"
    }

@app.post("/api/payment/session")
def create_payment_session(req: InitSessionRequest):
    session_id = f"sess_{uuid.uuid4().hex[:12]}"
    session = PaymentSession(session_id=session_id, call_id=req.call_id)
    ACTIVE_SESSIONS[session_id] = session
    
    # Automatically begin capture flow
    res = session.start_capture()
    return res

@app.get("/api/payment/session/{session_id}/status")
def get_session_status(session_id: str):
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return {
        "session_id": session.session_id,
        "call_id": session.call_id,
        "state": session.state.value,
        "detected_brand": session.detected_brand,
        "expiry": session.expiry_str,
        "is_wiped": session.buffer.is_wiped,
        "token_result": session.token_result
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
        if session.state not in (PaymentState.RESUMING, PaymentState.FAILED):
            session.abort("Customer disconnected during payment")
