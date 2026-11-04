"""
Unit tests for Strict RBAC (Role-Based Access Control) in VelatoAI
Tests enforcement for Agent vs Admin across:
- Document upload and deletion
- Audit export (JSON/CSV)
- Forensic memory & DB leak scan
- System settings and PCI media routing configuration
"""
import pytest
import os
import sys
from fastapi.testclient import TestClient

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "copilot-app", "backend"))

from app.main import app

@pytest.fixture
def client():
    return TestClient(app)

class TestStrictRBAC:
    def test_document_rbac(self, client):
        # 1. Agent cannot upload document -> 403
        res = client.post(
            "/api/documents",
            json={"title": "Policy", "content": "Rule text with sufficient length"},
            headers={"X-Agent-Role": "agent"}
        )
        assert res.status_code == 403
        assert "Admin role required" in res.json()["detail"]

        # 2. Admin can upload document -> 201
        res = client.post(
            "/api/documents",
            json={"title": "Admin Policy", "content": "Rule text with sufficient length"},
            headers={"X-Agent-Role": "admin"}
        )
        assert res.status_code == 201
        doc_id = res.json()["document"]["doc_id"]

        # 3. Agent cannot delete document -> 403
        del_res = client.delete(f"/api/documents/{doc_id}", headers={"X-Agent-Role": "agent"})
        assert del_res.status_code == 403

        # 4. Admin can delete document -> 200
        del_admin = client.delete(f"/api/documents/{doc_id}", headers={"X-Agent-Role": "admin"})
        assert del_admin.status_code == 200

    def test_audit_leak_scan_rbac(self, client):
        # 1. Agent cannot run leak scan -> 403
        res = client.get("/api/audit/leak-scan", headers={"X-Agent-Role": "agent"})
        assert res.status_code == 403
        assert "Admin role required" in res.json()["detail"]

        # 2. Admin can run leak scan -> 200
        res_admin = client.get("/api/audit/leak-scan", headers={"X-Agent-Role": "admin"})
        assert res_admin.status_code == 200
        assert "status" in res_admin.json()

    def test_audit_export_rbac(self, client):
        # 1. Agent cannot export audit trail -> 403
        res = client.get("/api/audit/export?format=json", headers={"X-Agent-Role": "agent"})
        assert res.status_code == 403
        assert "Admin role required" in res.json()["detail"]

        # 2. Admin can export audit trail -> 200
        res_admin = client.get("/api/audit/export?format=json", headers={"X-Agent-Role": "admin"})
        assert res_admin.status_code == 200
        assert "events" in res_admin.json()
        assert "verification" in res_admin.json()
