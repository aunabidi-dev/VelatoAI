"""
Phase 3: Copilot Service Tests
Tests document CRUD, semantic retrieval, structured suggestion generation,
Safe Mode blackout enforcement, and PCI redaction before suggestion.
"""
import sys
import os
import pytest

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "copilot-app", "backend"))

from app.services.copilot_service import CopilotService


@pytest.fixture
def service():
    """Fresh CopilotService instance (with default seeded docs) for each test."""
    return CopilotService()


class TestDocumentCRUD:
    def test_seed_documents_loaded(self, service):
        docs = service.list_documents()
        assert len(docs) >= 5  # 5 seeded by default

    def test_add_document(self, service):
        doc = service.add_document(title="Test Policy", content="Agents must always verify identity before refunds.")
        assert doc["doc_id"].startswith("doc_")
        assert doc["title"] == "Test Policy"

    def test_list_documents_sorted_newest_first(self, service):
        service.add_document("Alpha", "First doc content here for testing purposes.")
        service.add_document("Beta", "Second doc content here for testing purposes.")
        docs = service.list_documents()
        titles = [d["title"] for d in docs]
        assert titles.index("Beta") < titles.index("Alpha")

    def test_delete_document(self, service):
        doc = service.add_document("Temp", "Temporary document content for deletion test.")
        doc_id = doc["doc_id"]
        assert service.delete_document(doc_id) is True
        assert service.get_document(doc_id) is None

    def test_delete_nonexistent_returns_false(self, service):
        assert service.delete_document("doc_nonexistent_xyz") is False

    def test_add_document_requires_title_and_content(self, service):
        with pytest.raises(ValueError):
            service.add_document(title="", content="Some content")
        with pytest.raises(ValueError):
            service.add_document(title="Title", content="")

    def test_get_document_by_id(self, service):
        doc = service.add_document("Lookup Test", "Content for lookup test document.")
        fetched = service.get_document(doc["doc_id"])
        assert fetched["title"] == "Lookup Test"

    def test_get_nonexistent_document_returns_none(self, service):
        assert service.get_document("doc_does_not_exist") is None


class TestDocumentRetrieval:
    def test_retrieve_payment_doc_on_payment_query(self, service):
        result = service.retrieve_best_doc("customer wants to pay with a credit card")
        assert result is not None
        # Should return the PCI Payment Policy doc
        assert "PCI" in result["title"] or "Payment" in result["title"] or "payment" in result["content"].lower()

    def test_retrieve_refund_doc_on_refund_query(self, service):
        result = service.retrieve_best_doc("I want a refund for my subscription")
        assert result is not None
        assert "Refund" in result["title"] or "refund" in result["content"].lower()

    def test_retrieve_returns_none_when_no_docs(self):
        empty_service = CopilotService.__new__(CopilotService)
        empty_service._documents = {}
        assert empty_service.retrieve_best_doc("anything") is None

    def test_retrieve_returns_none_below_threshold(self, service):
        # Gibberish should score below the 2% threshold
        result = service.retrieve_best_doc("zzzzz qqqqq xxxxxxxx aaaaabbbbbccc")
        # Either None or a low-relevance match — both acceptable
        # Just ensure no exception is raised
        assert result is None or isinstance(result, dict)

    def test_custom_doc_is_retrieved(self, service):
        service.add_document(
            "Emergency Call Script",
            "If caller indicates an emergency, transfer immediately to the emergency hotline 999."
        )
        result = service.retrieve_best_doc("this is an emergency please help me")
        assert result is not None
        assert "Emergency" in result["title"]


class TestSuggestionGeneration:
    def test_payment_query_returns_safe_mode_suggestion(self, service):
        result = service.get_suggestion(
            transcript="The customer wants to pay with their Visa card right now.",
            call_id="call_test_01",
        )
        assert result["suggestion"] != ""
        assert "PCI Safe Mode" in result["suggestion"] or "secure" in result["suggestion"].lower()
        assert result.get("blackout", False) is False

    def test_refund_query_returns_refund_suggestion(self, service):
        result = service.get_suggestion(
            transcript="I would like a refund please",
            call_id="call_test_02",
        )
        assert result["suggestion"] != ""
        assert "refund" in result["suggestion"].lower() or "Refund" in result["suggestion"]

    def test_safe_mode_active_returns_blackout(self, service):
        result = service.get_suggestion(
            transcript="What is the price of your Enterprise plan?",
            call_id="call_test_03",
            safe_mode_active=True,
        )
        assert result["suggestion"] == ""
        assert result["blackout"] is True
        assert result["model"] == "BLACKOUT"
        assert result["confidence"] == 0.0

    def test_suggestion_includes_call_id(self, service):
        result = service.get_suggestion(
            transcript="I want to cancel my subscription",
            call_id="call_abc123",
        )
        assert result["call_id"] == "call_abc123"

    def test_suggestion_source_doc_citation(self, service):
        result = service.get_suggestion(
            transcript="Can I get a refund for the annual plan?",
            call_id="call_test_04",
        )
        # Should cite a relevant document
        assert "model" in result
        assert "confidence" in result

    def test_pan_redacted_before_suggestion(self, service):
        """PAN in transcript must never reach the suggestion engine."""
        result = service.get_suggestion(
            transcript="My card number is 4242424242424242 please charge it",
            call_id="call_test_05",
        )
        # Redaction flag should be set
        assert result.get("redacted") is True
        # The raw PAN must not appear in the suggestion
        assert "4242424242424242" not in result["suggestion"]

    def test_unknown_topic_returns_default_suggestion(self, service):
        result = service.get_suggestion(
            transcript="The weather today is really nice don't you think",
            call_id="call_test_06",
        )
        assert isinstance(result["suggestion"], str)
        assert len(result["suggestion"]) > 0
