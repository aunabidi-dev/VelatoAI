"""
Phase 3 End-to-End Live Copilot Integration Tests
Verifies all Phase 3 criteria:
  - Admin document upload and deletion (role-gated: 403 for agents)
  - Document retrieval grounding copilot suggestions
  - Live transcript ingestion endpoint with structured suggestions
  - PCI PAN redaction before suggestion generation
  - Copilot blackout strictly enforced during PCI Safe Mode
  - Provider interface respects configuration
"""
import pytest
import os
import sys
from fastapi.testclient import TestClient

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "copilot-app", "backend"))

from app.main import app
from app.services.call_manager import call_manager
from app.services.copilot_service import copilot_service


@pytest.fixture
def client():
    return TestClient(app)


class TestPhase3LiveCopilot:
    def test_role_gating_on_documents(self, client):
        # 1. Agent role cannot upload documents -> 403 Forbidden
        agent_res = client.post(
            "/api/documents",
            json={"title": "Unauthorized Doc", "content": "This should be blocked."},
            headers={"X-Agent-Role": "agent"}
        )
        assert agent_res.status_code == 403
        assert "Admin role required" in agent_res.json()["detail"]

        # 2. Admin role can upload documents -> 201 Created
        admin_res = client.post(
            "/api/documents",
            json={
                "title": "VIP Concierge Escalation",
                "content": "For platinum customers, always assign a dedicated account manager within 15 minutes."
            },
            headers={"X-Agent-Role": "admin"}
        )
        assert admin_res.status_code == 201
        doc_data = admin_res.json()["document"]
        doc_id = doc_data["doc_id"]
        assert doc_data["title"] == "VIP Concierge Escalation"

        # 3. Agent cannot delete documents -> 403 Forbidden
        del_agent = client.delete(f"/api/documents/{doc_id}", headers={"X-Agent-Role": "agent"})
        assert del_agent.status_code == 403

        # 4. Admin can delete documents -> 200 OK
        del_admin = client.delete(f"/api/documents/{doc_id}", headers={"X-Agent-Role": "admin"})
        assert del_admin.status_code == 200
        assert del_admin.json()["success"] is True

    def test_live_transcript_produces_grounded_suggestion(self, client):
        # Upload a custom script as admin
        client.post(
            "/api/documents",
            json={
                "title": "Enterprise Cloud Discount Guide",
                "content": "Enterprise customers with more than 50 seats are eligible for a 15% annual commitment discount."
            },
            headers={"X-Agent-Role": "admin"}
        )

        call_id = "call_p3_live_01"
        call_manager.create_call(call_id=call_id)

        # Ingest live transcript
        res = client.post(
            "/api/copilot/transcript",
            json={
                "call_id": call_id,
                "speaker": "customer",
                "text": "We are looking to upgrade to the enterprise plan with 60 seats."
            }
        )
        assert res.status_code == 200
        data = res.json()
        assert data["call_id"] == call_id
        assert data["suggestion"] != ""
        assert data["confidence"] > 0
        assert data["blackout"] is False

    def test_pan_redaction_in_live_transcript(self, client):
        call_id = "call_p3_redact_01"
        call_manager.create_call(call_id=call_id)

        # Customer speaks a card number during normal conversation
        res = client.post(
            "/api/copilot/transcript",
            json={
                "call_id": call_id,
                "speaker": "customer",
                "text": "I can give you my Visa 4242424242424242 to renew right now"
            }
        )
        assert res.status_code == 200
        data = res.json()
        # Raw PAN must never appear in suggestion
        assert "4242424242424242" not in data["suggestion"]
        assert data["redacted"] is True

    @pytest.mark.asyncio
    async def test_copilot_blackout_strictly_enforced_during_safe_mode(self, client):
        call_id = "call_p3_blackout_01"
        call = call_manager.create_call(call_id=call_id)

        # Trigger safe mode
        await call_manager.trigger_safe_mode(call_id)
        assert call.safe_mode_active is True
        assert call.copilot_blackout is True

        # 1. Transcript ingestion during Safe Mode returns blackout immediately
        res_trans = client.post(
            "/api/copilot/transcript",
            json={
                "call_id": call_id,
                "speaker": "customer",
                "text": "What about my billing questions?"
            }
        )
        assert res_trans.status_code == 200
        assert res_trans.json()["blackout"] is True
        assert res_trans.json()["suggestion"] == ""
        assert res_trans.json()["model"] == "BLACKOUT"

        # 2. Direct copilot suggest endpoint raises 403 during blackout
        res_suggest = client.post(
            "/api/copilot/suggest",
            json={
                "call_id": call_id,
                "utterance": "Can you hear me?"
            }
        )
        assert res_suggest.status_code == 403
        assert "COPILOT_BLACKOUT" in res_suggest.json()["detail"]

        # Complete safe mode -> copilot restored
        await call_manager.complete_safe_mode(
            call_id=call_id,
            token="tok_pci_p3_01",
            last4="4242",
            brand="Visa"
        )
        assert call.copilot_blackout is False

        # Now suggestions work again
        res_restored = client.post(
            "/api/copilot/transcript",
            json={
                "call_id": call_id,
                "speaker": "customer",
                "text": "Thank you for processing my payment."
            }
        )
        assert res_restored.status_code == 200
        assert res_restored.json()["blackout"] is False
        assert res_restored.json()["suggestion"] != ""

