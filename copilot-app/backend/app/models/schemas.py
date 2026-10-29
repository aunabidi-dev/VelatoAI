"""
Pydantic schemas and database models for the Copilot Control Plane.
Strictly ensures no PAN or CVV fields exist in control plane models.

Phase 3 additions:
  - Document upload/list schemas
  - Structured copilot suggestion schema
  - Role header enum
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import time


class CallSessionCreate(BaseModel):
    customer_name: Optional[str] = "Jane Doe"
    agent_id: Optional[str] = "agent_01"


class SafeModeStartRequest(BaseModel):
    call_id: str
    amount: Optional[float] = 49.99
    currency: Optional[str] = "USD"


class SafeModeCompleteRequest(BaseModel):
    call_id: str
    token: str
    last4: str
    brand: str
    amount: Optional[float] = 49.99


class AuditEvent(BaseModel):
    id: str
    call_id: str
    timestamp: float = Field(default_factory=time.time)
    event_type: str  # e.g., CALL_START, SAFE_MODE_TRIGGERED, ISOLATION_ENFORCED, TOKEN_ACQUIRED, CALL_ENDED
    token_ref: Optional[str] = None
    last4: Optional[str] = None
    brand: Optional[str] = None
    details: Optional[str] = None


class CallStatusResponse(BaseModel):
    call_id: str
    status: str  # CONNECTED, SAFE_MODE_ACTIVE, RESUMED, TERMINATED
    agent_isolated: bool
    recording_active: bool
    recording_paused_pci: bool
    token_ref: Optional[str] = None
    last4: Optional[str] = None
    brand: Optional[str] = None


# ── Phase 3: Document Management ──────────────────────────────────────────────

class DocumentUploadRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Short document title")
    content: str = Field(..., min_length=10, description="Full document content / policy text")


class DocumentDeleteResponse(BaseModel):
    success: bool
    doc_id: str
    message: str


# ── Phase 3: Structured Copilot Suggestion ────────────────────────────────────

class CopilotSuggestionRequest(BaseModel):
    call_id: str
    utterance: str
    safe_mode_active: Optional[bool] = False


class CopilotSuggestionResponse(BaseModel):
    call_id: str
    suggestion: str
    confidence: float
    source_doc_title: Optional[str] = None
    model: str
    redacted: bool
    blackout: bool = False


# ── Phase 3: Live Transcript ──────────────────────────────────────────────────

class TranscriptChunk(BaseModel):
    call_id: str
    speaker: str       # "agent" | "customer"
    text: str
    timestamp: float = Field(default_factory=time.time)
