"""
Pydantic schemas and database models for the Copilot Control Plane.
Strictly ensures no PAN or CVV fields exist in control plane models.
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
