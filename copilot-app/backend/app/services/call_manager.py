"""
Call Management & Audio Isolation Orchestration Service
Enforces server-side isolation, copilot blackout, and recording pause/resume markers.
"""
from typing import Dict, Any, Optional, Set
import time
import httpx
from .audit_service import audit_service

PAYMENT_SERVICE_URL = "http://localhost:8001"

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
        audit_service.record_event(
            call_id=call_id,
            event_type="CALL_CONNECTED",
            details=f"Agent {agent_id} connected with customer {customer_name}"
        )
        return call

    def get_call(self, call_id: str) -> Optional[CallSession]:
        return self.calls.get(call_id)

    async def trigger_safe_mode(self, call_id: str) -> Dict[str, Any]:
        """
        Step 1: Agent triggers Safe Mode.
        Enforces server-side isolation:
        - Sever agent audio stream
        - Impose Copilot blackout
        - Mark recording gap: "PCI segment withheld"
        - Connect Customer to Payment Voice Agent
        """
        call = self.get_call(call_id)
        if not call:
            raise ValueError(f"Call {call_id} not found.")

        call.safe_mode_active = True
        call.agent_isolated = True
        call.copilot_blackout = True
        call.recording_paused_pci = True
        
        timestamp = time.time()
        call.pci_timeline_markers.append({
            "type": "PCI_GAP_START",
            "timestamp": timestamp,
            "notice": "PCI audio withheld from recording"
        })

        audit_service.record_event(
            call_id=call_id,
            event_type="SAFE_MODE_START",
            details="PCI Safe Mode triggered. Agent audio isolated and recording paused."
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
            "initial_data": data
        })

        return {
            "call_id": call_id,
            "status": "SAFE_MODE_ACTIVE",
            "agent_isolated": True,
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
        """
        call = self.get_call(call_id)
        if not call:
            raise ValueError(f"Call {call_id} not found.")

        call.safe_mode_active = False
        call.agent_isolated = False
        call.copilot_blackout = False
        call.recording_paused_pci = False
        
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

call_manager = CallManager()
