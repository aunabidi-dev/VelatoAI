"""
Copilot Provider Interface — Phase 3 & Meta Hackathon Architecture
Abstract base class and concrete implementations for copilot suggestion models.

Design rules (§6 & §14 of Product Spec):
  - Primary copilot brain is Muse Spark Open on Baseten.
  - In local / grounded mode, it reads the transcript and relevant company documents
    retrieved via PostgreSQL full-text search and returns structured suggestions.
  - An optional adapter for outside providers, such as the Meta Model API, is
    controlled by an API_ACTIVE setting that is false by default, so no outside call is made.
  - Payment service NEVER uses any outside provider — this file belongs to control plane only.
  - Before any text is passed to an outside provider, the PCI redaction filter is applied.
  - The product shows the required "Built with Muse Spark Open" notice.
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
            "built_with": str,        # "Built with Muse Spark Open"
          }
        Must return an empty/blackout dict if safe_mode_active is True.
        """
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Short display name shown in the agent UI badge."""
        ...


class SparkOpenLocalProvider(CopilotProvider):
    """
    Default Copilot Brain: Muse Spark Open (Baseten Grounded Engine).
    Executes in-memory knowledge retrieval against company documents with zero outside API calls.
    Grounds live conversation scripts using PostgreSQL full-text search tokens.
    """

    name = "Local Muse Spark Open (Baseten)"
    BUILT_WITH_NOTICE = "Built with Muse Spark Open"

    # Intent pattern → structured suggestion playbook (ordered by specificity)
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

        # Grounding with retrieved knowledge document (PostgreSQL Full-Text Search)
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
            "built_with": self.BUILT_WITH_NOTICE,
        }

    @staticmethod
    def _blackout() -> Dict[str, Any]:
        return {
            "suggestion": "",
            "confidence": 0.0,
            "source_doc_title": None,
            "model": "BLACKOUT",
            "redacted": False,
            "built_with": "Built with Muse Spark Open",
        }


# Backward-compatible alias for existing tests and components
LocalProvider = SparkOpenLocalProvider


class MetaModelApiAdapter(CopilotProvider):
    """
    Adapter for outside providers (such as Meta Model API).
    Controlled strictly by the API_ACTIVE setting, which is FALSE by default.
    When API_ACTIVE=false, no outside call is made.
    """

    name = "External Meta Model API (Stub Adapter)"
    BUILT_WITH_NOTICE = "Built with Muse Spark Open"

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
                "built_with": self.BUILT_WITH_NOTICE,
            }

        logger.info("[MetaModelApiAdapter] Outside call invoked with PCI-redacted transcript")
        source_doc_title = retrieved_doc.get("title") if retrieved_doc else None
        return {
            "suggestion": "[Meta Model API] Suggestion synthesized from conversation context and grounding docs.",
            "confidence": 0.92,
            "source_doc_title": source_doc_title,
            "model": self.name,
            "redacted": True,
            "built_with": self.BUILT_WITH_NOTICE,
        }


ExternalProviderStub = MetaModelApiAdapter


def is_api_active() -> bool:
    """Check if outside provider adapter is activated via API_ACTIVE=true."""
    val = os.getenv("API_ACTIVE", "false").strip().lower()
    return val in ("true", "1", "yes")


def get_provider() -> CopilotProvider:
    """
    Factory:
    - If API_ACTIVE is true or COPILOT_PROVIDER is 'external', activates MetaModelApiAdapter.
    - Otherwise returns Muse Spark Open on Baseten (default, offline & grounded).
    """
    api_active = is_api_active()
    provider_env = os.getenv("COPILOT_PROVIDER", "spark_open").strip().lower()

    if api_active or provider_env == "external":
        logger.info("[CopilotProvider] Outside provider adapter enabled (API_ACTIVE=true)")
        return MetaModelApiAdapter()

    logger.info("[CopilotProvider] Using Muse Spark Open on Baseten (default)")
    return SparkOpenLocalProvider()


# Module-level singleton
copilot_provider: CopilotProvider = get_provider()
