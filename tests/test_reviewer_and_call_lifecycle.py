"""
Unit & Integration Tests for Dedicated Meta Reviewer Endpoints and Browser-to-Browser Call Lifecycle.
"""
import sys
import os
import pytest
from fastapi.testclient import TestClient

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "copilot-app", "backend"))

from app.main import app
from app.services.call_manager import call_manager


@pytest.fixture
def client():
    return TestClient(app)


def test_meta_reviewer_summary_endpoint(client):
    """Test dedicated Meta Reviewer summary endpoint returns full checklist and attribution."""
    res = client.get("/api/meta-reviewer/summary")
    assert res.status_code == 200
    data = res.json()

    assert "hackathon_metadata" in data
    assert data["hackathon_metadata"]["primary_model"] == "meta-models/muse-spark-open-1026"
    assert data["hackathon_metadata"]["attribution"] == "Built with Muse Spark Open"
    assert data["hackathon_metadata"]["reasoning_effort"] == "low"

    assert "compliance_and_zero_trust_checklist" in data
    assert data["compliance_and_zero_trust_checklist"]["zero_pan_in_control_plane"] is True
    assert "telemetry_benchmarks" in data
    assert "quick_verification_links" in data


def test_meta_reviewer_logs_endpoint(client):
    """Test dedicated Meta Reviewer logs endpoint returns sanitized events."""
    res = client.get("/api/meta-reviewer/logs")
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "COMPLIANT"
    assert "reviewer_notice" in data
    assert "events" in data
    assert isinstance(data["events"], list)


def test_meta_reviewer_audit_endpoint(client):
    """Test dedicated Meta Reviewer audit endpoint returns cryptographic verification."""
    res = client.get("/api/meta-reviewer/audit")
    assert res.status_code == 200
    data = res.json()

    assert "chain_verification" in data
    assert "leak_scan" in data
    assert data["chain_verification"]["valid"] is True


def test_call_lifecycle_endpoints(client):
    """Test browser-to-browser calling lifecycle: initiate -> accept -> hangup."""
    call_id = "call_test_calling_01"

    # 1. Initiate call
    init_res = client.post(
        f"/api/calls/{call_id}/initiate",
        json={"customer_name": "Alice Smith", "phone": "+1-555-0100", "plan": "Tier 1"}
    )
    assert init_res.status_code == 200
    init_data = init_res.json()
    assert init_data["status"] == "RINGING"
    assert init_data["customer_name"] == "Alice Smith"

    # 2. Accept call
    accept_res = client.post(f"/api/calls/{call_id}/accept")
    assert accept_res.status_code == 200
    accept_data = accept_res.json()
    assert accept_data["status"] == "CONNECTED"

    # Verify status
    call_status_res = client.get(f"/api/calls/{call_id}")
    assert call_status_res.status_code == 200
    assert call_status_res.json()["is_active"] is True

    # 3. Hangup call
    hangup_res = client.post(f"/api/calls/{call_id}/hangup")
    assert hangup_res.status_code == 200
    hangup_data = hangup_res.json()
    assert hangup_data["status"] == "ENDED"


def test_call_decline_lifecycle(client):
    """Test call decline flow: initiate -> decline -> status DECLINED, no auto-redial."""
    call_id = "call_test_decline_02"

    # 1. Initiate call
    init_res = client.post(
        f"/api/calls/{call_id}/initiate",
        json={"customer_name": "Bob Vance", "phone": "+1-555-0200", "plan": "Tier 2"}
    )
    assert init_res.status_code == 200
    assert init_res.json()["status"] == "RINGING"

    # 2. Decline call
    decline_res = client.post(f"/api/calls/{call_id}/decline")
    assert decline_res.status_code == 200
    assert decline_res.json()["status"] == "DECLINED"

    # 3. Check call status
    call_status_res = client.get(f"/api/calls/{call_id}")
    assert call_status_res.status_code == 200
    data = call_status_res.json()
    assert data["status"] == "DECLINED"
    assert data["is_active"] is False

    # 4. Customer calls again -> status becomes RINGING
    re_init_res = client.post(
        f"/api/calls/{call_id}/initiate",
        json={"customer_name": "Bob Vance", "phone": "+1-555-0200", "plan": "Tier 2"}
    )
    assert re_init_res.status_code == 200
    assert re_init_res.json()["status"] == "RINGING"


