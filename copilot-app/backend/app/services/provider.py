"""
Copilot Provider Interface — Phase 3
Abstract base class and concrete implementations for copilot suggestion models.

Design rules:
  - LocalProvider is always-on; uses keyword matching + document retrieval.
  - ExternalProvider is off by default; enabled via env var COPILOT_PROVIDER=external.
  - Payment service NEVER uses any provider — this file belongs to control plane only.
  - Before any text is passed to an external provider, the PCI redaction filter is applied.
"""
import os
import re
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

logger = logging.getLogger("copilot-provider")


class CopilotProvider(ABC):
    """Abstract provider interface. All implementations must honour this contract."""

    @abstractmethod
    def get_suggestion(
        self,
        transcript: str,
        retrieved_doc: Optional[Dict[str, Any]] = None,
        safe_mode_active: bool = False,
    ) -> Dict[str, Any]:
        """
        Returns a structured suggestion dict:
          {
            "suggestion": str,        # human-readable action/script text
            "confidence": float,      # 0.0 – 1.0
            "source_doc_title": str | None,
            "model": str,             # provider label shown in UI
            "redacted": bool,         # True if PAN was found and masked
          }
        Must return an empty/blackout dict if safe_mode_active is True.
        """
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Short display name shown in the agent UI badge."""
        ...


class LocalProvider(CopilotProvider):
    """
    Keyword-rule copilot — no external network calls.
    Uses retrieved document context to compose suggestions.
    This is the default and is always available.
    """

    name = "Local Copilot (Rules)"

    # Keyword → suggestion template map (ordered: more specific first)
    _RULES = [
        (r"\b(pay|payment|paying|card|charge|billing|invoice)\b",
         "Payment Intent Detected: Inform the customer you are transferring them to the secure automated payment system, then press [PCI SAFE MODE]."),
        (r"\b(refund|refunds|return|returns|money back)\b",
         "Refund Policy: Standard refunds take 3–5 business days. Verify the original payment method on file and confirm the order number."),
        (r"\b(cancel|cancelling|cancellation|unsubscribe|end subscription)\b",
         "Retention Script: Before processing a cancellation, offer a 20% discount on the next billing cycle. Escalate to senior agent if the customer declines."),
        (r"\b(upgrade|upgrading|plan|plans|tier|premium|enterprise)\b",
         "Upsell Script: Highlight Enterprise Tier benefits — priority support, 5× API limits, and SSO. Offer a 14-day trial upgrade."),
        (r"\b(password|passwords|login|access|account locked|can.t log)\b",
         "Account Access: Verify identity using the registered email + last 4 digits of the phone number. Do NOT ask for passwords."),
        (r"\b(slow|issue|issues|bug|bugs|broken|not work|error|errors)\b",
         "Technical Support: Collect the error message text and timestamp. Open a P2 ticket in the support portal and provide the ticket number to the customer."),
        (r"\b(price|prices|pricing|cost|costs|how much|discount|discounts|promo|promotion|promotions|offer|offers|deal|deals|rate|rates)\b",
         "Pricing & Discount Policy: Starter is $19/mo (up to 5 seats), Professional is $49/mo (up to 25 seats), Enterprise has custom pricing. Annual plans receive a 20% discount. Agents can apply up to a 10% goodwill discount with manager approval."),
    ]

    def get_suggestion(
        self,
        transcript: str,
        retrieved_doc: Optional[Dict[str, Any]] = None,
        safe_mode_active: bool = False,
    ) -> Dict[str, Any]:
        if safe_mode_active:
            return self._blackout()

        transcript_lower = transcript.lower()
        suggestion = "Listen actively, verify customer identity if needed, and assist with their inquiry."
        matched = False

        for pattern, template in self._RULES:
            if re.search(pattern, transcript_lower):
                suggestion = template
                matched = True
                break

        # If a relevant document was retrieved, append a citation note
        source_doc_title = None
        if retrieved_doc:
            source_doc_title = retrieved_doc.get("title")
            doc_snippet = retrieved_doc.get("content", "")[:250].replace("\n", " ")
            if matched:
                suggestion += f"\n\n📄 Grounded Reference: {source_doc_title} — \"{doc_snippet}…\""
            else:
                suggestion = f"From Knowledge Base ({source_doc_title}): {doc_snippet}"
                matched = True

        return {
            "suggestion": suggestion,
            "confidence": 0.90 if (matched and retrieved_doc) else (0.80 if matched else 0.50),
            "source_doc_title": source_doc_title,
            "model": self.name,
            "redacted": False,
        }

    @staticmethod
    def _blackout() -> Dict[str, Any]:
        return {
            "suggestion": "",
            "confidence": 0.0,
            "source_doc_title": None,
            "model": "BLACKOUT",
            "redacted": False,
        }


class ExternalProviderStub(CopilotProvider):
    """
    Stub for an external provider (e.g., Meta Model API / Muse Spark Open).
    Off by default. Enabled only when COPILOT_PROVIDER=external in environment.

    Security constraints (same as product spec):
      - Only redacted copilot transcripts are ever sent to the external endpoint.
      - Payment service never uses this. The build test would fail if it did.
      - In production: check provider's regional rules and client's own policy.

    For the hackathon this stub simulates the round-trip without a real API call,
    so we can demonstrate the provider-switching architecture without live credentials.
    """

    name = "External Provider (Stub)"

    def get_suggestion(
        self,
        transcript: str,
        retrieved_doc: Optional[Dict[str, Any]] = None,
        safe_mode_active: bool = False,
    ) -> Dict[str, Any]:
        if safe_mode_active:
            return {
                "suggestion": "",
                "confidence": 0.0,
                "source_doc_title": None,
                "model": "BLACKOUT",
                "redacted": False,
            }

        logger.info("[ExternalProvider] Would call external API with redacted transcript (stub)")
        source_doc_title = retrieved_doc.get("title") if retrieved_doc else None
        return {
            "suggestion": f"[External Model Response] Based on the transcript context: consider empathetic acknowledgement, then offer the most relevant solution from your playbook.",
            "confidence": 0.91,
            "source_doc_title": source_doc_title,
            "model": self.name,
            "redacted": True,  # always True — we always redact before sending externally
        }


def get_provider() -> CopilotProvider:
    """
    Factory: reads COPILOT_PROVIDER env var.
    Returns LocalProvider by default (safe, no external calls).
    Returns ExternalProviderStub only when explicitly set to 'external'.
    """
    provider_env = os.getenv("COPILOT_PROVIDER", "local").strip().lower()
    if provider_env == "external":
        logger.info("[CopilotProvider] External provider enabled via COPILOT_PROVIDER=external")
        return ExternalProviderStub()
    logger.info("[CopilotProvider] Using local keyword copilot (default)")
    return LocalProvider()


# Module-level singleton — instantiated once at import time
copilot_provider: CopilotProvider = get_provider()
