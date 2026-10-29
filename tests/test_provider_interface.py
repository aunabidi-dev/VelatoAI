"""
Phase 3: Provider Interface Tests
Tests the provider abstraction, LocalProvider, ExternalProviderStub,
and the get_provider() factory with environment variable switching.
"""
import sys
import os
import pytest

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(base_dir, "copilot-app", "backend"))

from app.services.provider import LocalProvider, ExternalProviderStub, get_provider


class TestLocalProvider:
    def setup_method(self):
        self.provider = LocalProvider()

    def test_name(self):
        assert "Local" in self.provider.name

    def test_payment_intent_triggers_safe_mode_suggestion(self):
        result = self.provider.get_suggestion("customer wants to pay with a card")
        assert "PCI Safe Mode" in result["suggestion"] or "payment" in result["suggestion"].lower()
        assert result["confidence"] > 0

    def test_refund_intent_triggers_refund_suggestion(self):
        result = self.provider.get_suggestion("I need a refund for my order")
        assert "refund" in result["suggestion"].lower() or "Refund" in result["suggestion"]

    def test_cancellation_intent(self):
        result = self.provider.get_suggestion("I want to cancel my subscription")
        assert "cancel" in result["suggestion"].lower() or "retention" in result["suggestion"].lower()

    def test_upgrade_intent(self):
        result = self.provider.get_suggestion("I want to upgrade to the premium plan")
        assert "upgrade" in result["suggestion"].lower() or "Enterprise" in result["suggestion"]

    def test_safe_mode_returns_blackout(self):
        result = self.provider.get_suggestion("anything here", safe_mode_active=True)
        assert result["suggestion"] == ""
        assert result["model"] == "BLACKOUT"
        assert result["confidence"] == 0.0

    def test_retrieved_doc_appended_to_suggestion(self):
        doc = {
            "title": "Custom Policy",
            "content": "Always verify ID before processing large orders over 500 dollars.",
        }
        result = self.provider.get_suggestion(
            transcript="customer wants to make a large purchase",
            retrieved_doc=doc,
        )
        assert "Custom Policy" in result["suggestion"] or "verify" in result["suggestion"].lower()
        assert result["source_doc_title"] == "Custom Policy"

    def test_result_has_required_fields(self):
        result = self.provider.get_suggestion("hello there")
        assert "suggestion" in result
        assert "confidence" in result
        assert "model" in result
        assert "redacted" in result
        assert isinstance(result["confidence"], float)

    def test_confidence_between_0_and_1(self):
        result = self.provider.get_suggestion("customer has a billing question")
        assert 0.0 <= result["confidence"] <= 1.0


class TestExternalProviderStub:
    def setup_method(self):
        self.provider = ExternalProviderStub()

    def test_name(self):
        assert "External" in self.provider.name or "Stub" in self.provider.name

    def test_returns_suggestion(self):
        result = self.provider.get_suggestion("customer inquiry about pricing")
        assert result["suggestion"] != ""
        assert result["confidence"] > 0

    def test_always_marks_redacted_true(self):
        """External provider must always mark redacted=True (PAN always stripped before sending)."""
        result = self.provider.get_suggestion("some transcript text")
        assert result["redacted"] is True

    def test_safe_mode_returns_blackout(self):
        result = self.provider.get_suggestion("anything", safe_mode_active=True)
        assert result["suggestion"] == ""
        assert result["model"] == "BLACKOUT"

    def test_includes_source_doc_when_provided(self):
        doc = {"title": "Price Sheet", "content": "Starter 19 per month"}
        result = self.provider.get_suggestion("price query", retrieved_doc=doc)
        assert result["source_doc_title"] == "Price Sheet"


class TestProviderFactory:
    def test_default_returns_local_provider(self, monkeypatch):
        monkeypatch.delenv("COPILOT_PROVIDER", raising=False)
        provider = get_provider()
        assert isinstance(provider, LocalProvider)

    def test_local_env_returns_local_provider(self, monkeypatch):
        monkeypatch.setenv("COPILOT_PROVIDER", "local")
        provider = get_provider()
        assert isinstance(provider, LocalProvider)

    def test_external_env_returns_external_provider(self, monkeypatch):
        monkeypatch.setenv("COPILOT_PROVIDER", "external")
        provider = get_provider()
        assert isinstance(provider, ExternalProviderStub)

    def test_unknown_env_falls_back_to_local(self, monkeypatch):
        monkeypatch.setenv("COPILOT_PROVIDER", "unknown_provider_xyz")
        provider = get_provider()
        assert isinstance(provider, LocalProvider)

    def test_payment_service_has_no_external_provider_import(self):
        """
        Security: payment service MUST NOT import the provider module.
        This would violate the design rule that the card path calls no external AI service.
        """
        payment_main_path = os.path.join(
            base_dir, "payment-service", "app", "main.py"
        )
        with open(payment_main_path, "r") as f:
            content = f.read()
        assert "from app.services.provider" not in content
        assert "copilot_provider" not in content
        assert "ExternalProvider" not in content

