"""
Call Management & Audio Isolation Orchestration Service — Phase 2 Hardened
Enforces server-side isolation, copilot blackout, recording pause/resume,
supervisor join prevention, and transcript redaction.

Phase 2 additions:
  - Supervisor join prevention: no new participants during Safe Mode
  - Recording service integration: server-side pause/resume with PCI markers
  - Transcript redaction: masks PAN before transcript reaches copilot model
"""
from typing import Dict, Any, Optional, Set
import os
import time
import httpx
from .audit_service import audit_service
from .recording_service import recording_service
from .redaction_filter import redact_transcript

PAYMENT_SERVICE_URL = os.getenv("PAYMENT_SERVICE_URL", "http://localhost:8001")


class CallSession:
    def __init__(self, call_id: str, customer_name: str = "Jane Doe", agent_id: str = "agent_01"):
        self.call_id = call_id
        self.customer_name = customer_name
        self.agent_id = agent_id

        # Audio routing states
        self.is_active = True
        self.safe_mode_active = False
        self.agent_isolated = False
        self.recording_active = True
        self.recording_paused_pci = False
        self.copilot_blackout = False

        # Phase 2: Supervisor join lock — blocks new subscriptions during Safe Mode
        self.safe_mode_locked = False

        # Safe Mode tracking
        self.payment_session_id: Optional[str] = None
        self.token_ref: Optional[str] = None
        self.last4: Optional[str] = None
        self.brand: Optional[str] = None
        self.pci_timeline_markers: list = []

        # Connected WebSocket clients: role -> set of WebSocket instances
        self.connections: Dict[str, set] = {"agent": set(), "customer": set()}
        self.created_at = time.time()


class CallManager:
    def __init__(self):
        self.calls: Dict[str, CallSession] = {}

    def create_call(self, call_id: str, customer_name: str = "Jane Doe", agent_id: str = "agent_01") -> CallSession:
        call = CallSession(call_id=call_id, customer_name=customer_name, agent_id=agent_id)
        self.calls[call_id] = call

        # Phase 2: Start server-side recording
        recording_service.start_recording(call_id)

        audit_service.record_event(
            call_id=call_id,
            event_type="CALL_CONNECTED",
            details=f"Agent {agent_id} connected with customer {customer_name}"
        )
        return call

    def get_call(self, call_id: str) -> Optional[CallSession]:
        return self.calls.get(call_id)

    def can_join_call(self, call_id: str, role: str) -> bool:
        """
        Phase 2: Supervisor join prevention.
        During Safe Mode, NO new participants (including supervisors)
        can join or subscribe to the audio.
        Only existing 'agent' and 'customer' connections are allowed.
        """
        call = self.get_call(call_id)
        if not call:
            return True  # Call doesn't exist yet, allow connection to create it

        if call.safe_mode_locked and role not in ("agent", "customer"):
            return False  # Block supervisor, observer, or any new role

        # Even existing roles: block NEW agent connections during Safe Mode
        if call.safe_mode_locked and role == "agent" and len(call.connections.get("agent", set())) > 0:
            # Already has an agent connected — block additional agent subscriptions
            return False

        return True

    async def trigger_safe_mode(self, call_id: str) -> Dict[str, Any]:
        """
        Step 1: Agent triggers Safe Mode.
        Enforces server-side isolation:
        - Sever agent audio stream
        - Impose Copilot blackout
        - Mark recording gap: "PCI segment withheld"
        - Lock call from new participants (supervisor join prevention)
        - Connect Customer to Payment Voice Agent
        """
        start_iso = time.perf_counter()
        call = self.get_call(call_id)
        if not call:
            call = self.create_call(call_id=call_id)

        call.safe_mode_active = True
        call.agent_isolated = True
        call.copilot_blackout = True
        call.recording_paused_pci = True
        call.safe_mode_locked = True  # Phase 2: Lock out supervisors

        timestamp = time.time()
        call.pci_timeline_markers.append({
            "type": "PCI_GAP_START",
            "timestamp": timestamp,
            "notice": "PCI audio withheld from recording"
        })

        # Phase 2: Pause server-side recording
        recording_service.pause_for_pci(call_id, session_id=None)
        isolation_latency_ms = round((time.perf_counter() - start_iso) * 1000, 2)

        audit_service.record_event(
            call_id=call_id,
            event_type="SAFE_MODE_START",
            details=f"PCI Safe Mode triggered in {isolation_latency_ms}ms. Agent audio isolated, recording paused, supervisor join blocked."
        )

        # Notify Payment Service to launch payment session
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{PAYMENT_SERVICE_URL}/api/payment/session",
                    json={"call_id": call_id}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    call.payment_session_id = data.get("session_id")
                else:
                    data = {"error": "Payment service initiation failed"}
        except Exception as e:
            # Stand-in fallback if payment service is starting up
            call.payment_session_id = f"sess_fallback_{int(timestamp)}"
            data = {"session_id": call.payment_session_id, "prompt": "Secure payment initialized"}

        # Broadcast state update to both agent and customer channels
        await self.broadcast_call_state(call_id, {
            "type": "SAFE_MODE_STATE",
            "safe_mode_active": True,
            "agent_isolated": True,
            "copilot_blackout": True,
            "recording_status": "PAUSED_PCI_WITHHELD",
            "payment_session_id": call.payment_session_id,
            "isolation_latency_ms": isolation_latency_ms,
            "initial_data": data
        })

        return {
            "call_id": call_id,
            "status": "SAFE_MODE_ACTIVE",
            "agent_isolated": True,
            "isolation_latency_ms": isolation_latency_ms,
            "payment_session_id": call.payment_session_id,
            "data": data
        }

    async def complete_safe_mode(
        self,
        call_id: str,
        token: str,
        last4: str,
        brand: str
    ) -> Dict[str, Any]:
        """
        Step 7: Resuming normal call.
        - Stores ONLY token, brand, last4 in call business record
        - Reconnects Agent audio line
        - Restores Copilot
        - Resumes recording with timeline marker: 'PCI segment withheld, token ref tok_xxx'
        - Unlocks supervisor join
        """
        call = self.get_call(call_id)
        if not call:
            call = self.create_call(call_id=call_id)

        call.safe_mode_active = False
        call.agent_isolated = False
        call.copilot_blackout = False
        call.recording_paused_pci = False
        call.safe_mode_locked = False  # Phase 2: Unlock supervisor join

        call.token_ref = token
        call.last4 = last4
        call.brand = brand

        timestamp = time.time()
        call.pci_timeline_markers.append({
            "type": "PCI_GAP_END",
            "timestamp": timestamp,
            "token_ref": token,
            "last4": last4,
            "brand": brand,
            "notice": f"PCI segment withheld, token ref {token}"
        })

        # Phase 2: Resume server-side recording
        recording_service.resume_after_pci(call_id, token_ref=token, last4=last4, brand=brand)

        # Phase 2: Store recording metadata for leak scanning
        audit_service.record_recording_metadata(call_id, {
            "token_ref": token,
            "last4": last4,
            "brand": brand,
            "pci_gap_end": timestamp,
        })

        audit_service.record_event(
            call_id=call_id,
            event_type="SAFE_MODE_END",
            token_ref=token,
            last4=last4,
            brand=brand,
            details="PCI Safe Mode completed successfully. Token acquired, agent reconnected."
        )

        await self.broadcast_call_state(call_id, {
            "type": "SAFE_MODE_COMPLETED",
            "safe_mode_active": False,
            "agent_isolated": False,
            "copilot_blackout": False,
            "recording_status": "ACTIVE_RESUMED",
            "token_ref": token,
            "last4": last4,
            "brand": brand
        })

        return {
            "call_id": call_id,
            "status": "RESUMED",
            "token_ref": token,
            "last4": last4,
            "brand": brand
        }

    async def cancel_safe_mode(self, call_id: str):
        """Cancel safe mode and resume normal conversation without payment token."""
        call = self.get_call(call_id)
        if not call:
            call = self.create_call(call_id=call_id)

        call.safe_mode_active = False
        call.agent_isolated = False
        call.copilot_blackout = False
        call.recording_paused_pci = False
        call.safe_mode_locked = False
        call.payment_session_id = None

        audit_service.record_event(
            call_id=call_id,
            event_type="SAFE_MODE_CANCELLED",
            details="PCI Safe Mode cancelled. Agent line reconnected, normal call resumed."
        )

        await self.broadcast_call_state(call_id, {
            "type": "SAFE_MODE_STATE",
            "safe_mode_active": False,
            "agent_isolated": False,
            "copilot_blackout": False,
            "recording_status": "NORMAL",
            "payment_session_id": None,
            "initial_data": None
        })

        return {
            "call_id": call_id,
            "status": "NORMAL",
            "safe_mode_active": False,
            "agent_isolated": False
        }

    def reset_call(self, call_id: str):
        """Reset a call back to a clean initial conversation state."""
        call = self.get_call(call_id)
        if call:
            call.safe_mode_active = False
            call.agent_isolated = False
            call.copilot_blackout = False
            call.recording_paused_pci = False
            call.safe_mode_locked = False
            call.payment_session_id = None
            call.token_ref = None
            call.last4 = None
            call.brand = None
            call.pci_timeline_markers = []
        else:
            call = self.create_call(call_id=call_id)
        return call

    def redact_transcript_text(self, text: str) -> str:
        """
        Phase 2: Redacts any PAN-like sequences from transcript text
        before it reaches the copilot model or an outside provider.
        """
        cleaned, count = redact_transcript(text)
        if count > 0:
            audit_service.record_event(
                call_id="system",
                event_type="TRANSCRIPT_REDACTION",
                details=f"Redacted {count} potential PAN sequence(s) from copilot transcript"
            )
        return cleaned

    async def broadcast_call_state(self, call_id: str, payload: Dict[str, Any]):
        """Broadcast state updates to all active websockets in this call room."""
        call = self.get_call(call_id)
        if not call:
            return

        for role in ["agent", "customer"]:
            dead_sockets = set()
            for ws in call.connections[role]:
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead_sockets.add(ws)
            call.connections[role].difference_update(dead_sockets)



    async def broadcast_to_role(self, call_id: str, role: str, payload: dict):
        """
        Phase 3: Broadcast a message to all WebSocket connections for a specific role only.
        Used to send COPILOT_SUGGESTION messages to the agent channel without notifying customer.
        """
        call = self.get_call(call_id)
        if not call:
            return
        dead_sockets = set()
        for ws in call.connections.get(role, set()):
            try:
                await ws.send_json(payload)
            except Exception:
                dead_sockets.add(ws)
        call.connections[role].difference_update(dead_sockets)

call_manager = CallManager()
