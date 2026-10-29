"""
Copilot Document & Suggestion Service — Phase 3
Manages the knowledge base (admin-uploaded documents) and provides
structured, document-grounded suggestions to the live copilot.

Design rules:
  - Admin role required for write operations (enforced at API layer).
  - No PAN or card data ever enters this service.
  - Redaction filter is applied to every transcript before retrieval or suggestion.
  - External provider is off by default (see provider.py).
"""
import time
import uuid
import re
import logging
from typing import List, Dict, Any, Optional

from .redaction_filter import redact_transcript
from .provider import copilot_provider

logger = logging.getLogger("copilot-service")

STOPWORDS = {
    'can', 'u', 'you', 'me', 'i', 'a', 'the', 'and', 'to', 'is', 'it', 'for', 'of',
    'in', 'on', 'with', 'do', 'have', 'please', 'provide', 'any', 'my', 'we', 'are',
    'what', 'how', 'about', 'our', 'your', 'be', 'so', 'tell', 'show', 'give'
}


def clean_tokens(text: str) -> set:
    """Extract lowercase alphanumeric tokens excluding common stopwords."""
    words = re.findall(r"\w+", text.lower())
    return {w for w in words if len(w) > 1 and w not in STOPWORDS}


class Document:
    """Represents an admin-uploaded knowledge document."""

    def __init__(self, title: str, content: str, uploaded_by: str = "admin"):
        self.doc_id: str = f"doc_{uuid.uuid4().hex[:10]}"
        self.title: str = title.strip()
        self.content: str = content.strip()
        self.uploaded_by: str = uploaded_by
        self.created_at: float = time.time()
        # Pre-computed tokens
        self._title_tokens: set = clean_tokens(self.title)
        self._content_tokens: set = clean_tokens(self.content)
        self._tokens: set = self._title_tokens | self._content_tokens

    def relevance_score(self, query_tokens: set) -> float:
        """
        Weighted relevance score:
        - Title matches weighted 5.0x
        - Content matches weighted 1.0x
        """
        if not query_tokens or not self._tokens:
            return 0.0
        title_matches = len(query_tokens & self._title_tokens)
        content_matches = len(query_tokens & self._content_tokens)
        return (title_matches * 5.0) + content_matches

    def to_dict(self) -> Dict[str, Any]:
        return {
            "doc_id": self.doc_id,
            "title": self.title,
            "content": self.content,
            "uploaded_by": self.uploaded_by,
            "created_at": self.created_at,
            "word_count": len(self._tokens),
        }


class CopilotService:
    """
    Manages the admin document knowledge base and produces
    structured copilot suggestions grounded in those documents.
    """

    def __init__(self):
        self._documents: Dict[str, Document] = {}
        self._seed_default_docs()

    # ------------------------------------------------------------------ #
    #  Document Management (admin only)                                    #
    # ------------------------------------------------------------------ #

    def add_document(self, title: str, content: str, uploaded_by: str = "admin") -> Dict[str, Any]:
        """Add a new knowledge document. Returns the saved document dict."""
        if not title or not content:
            raise ValueError("Both title and content are required.")
        doc = Document(title=title, content=content, uploaded_by=uploaded_by)
        self._documents[doc.doc_id] = doc
        logger.info(f"[CopilotService] Document added: '{title}' (id={doc.doc_id})")
        return doc.to_dict()

    def list_documents(self) -> List[Dict[str, Any]]:
        """Return all documents sorted by creation time (newest first)."""
        return [
            d.to_dict()
            for d in sorted(self._documents.values(), key=lambda x: x.created_at, reverse=True)
        ]

    def delete_document(self, doc_id: str) -> bool:
        """Delete a document by ID. Returns True if found and deleted."""
        if doc_id in self._documents:
            title = self._documents[doc_id].title
            del self._documents[doc_id]
            logger.info(f"[CopilotService] Document deleted: '{title}' (id={doc_id})")
            return True
        return False

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        doc = self._documents.get(doc_id)
        return doc.to_dict() if doc else None

    # ------------------------------------------------------------------ #
    #  Retrieval & Suggestion                                              #
    # ------------------------------------------------------------------ #

    def retrieve_best_doc(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Returns the single most relevant document for a given query string,
        or None if the knowledge base is empty or no document matches.
        """
        if not self._documents:
            return None

        query_tokens = clean_tokens(query)
        if not query_tokens:
            return None

        best_doc: Optional[Document] = None
        best_score = 0.0

        for doc in self._documents.values():
            score = doc.relevance_score(query_tokens)
            if score > best_score:
                best_score = score
                best_doc = doc

        if best_doc and best_score >= 1.0:
            return best_doc.to_dict()
        return None

    def get_suggestion(
        self,
        transcript: str,
        call_id: str = "",
        safe_mode_active: bool = False,
    ) -> Dict[str, Any]:
        """
        Main entry point for copilot suggestions.

        1. Applies PCI redaction to the transcript (defence-in-depth).
        2. Retrieves the best matching document.
        3. Delegates to the configured provider for the final suggestion.
        4. Returns structured JSON including source doc and model label.
        """
        if safe_mode_active:
            return {
                "call_id": call_id,
                "suggestion": "",
                "confidence": 0.0,
                "source_doc_title": None,
                "model": "BLACKOUT",
                "redacted": False,
                "blackout": True,
            }

        # Step 1: Redact PAN from transcript before any model or retrieval sees it
        clean_transcript, redaction_count = redact_transcript(transcript)
        was_redacted = redaction_count > 0
        if was_redacted:
            logger.warning(f"[CopilotService] PAN redacted from transcript for call {call_id} before suggestion.")

        # Check for meaningful query tokens
        meaningful = clean_tokens(clean_transcript)
        if not meaningful:
            return {
                "call_id": call_id,
                "suggestion": "Please speak or type a customer query (e.g. pricing, discounts, refunds, payment) to receive instant copilot guidance.",
                "confidence": 0.3,
                "source_doc_title": None,
                "model": copilot_provider.name,
                "redacted": was_redacted,
                "blackout": False,
            }

        # Step 2: Retrieve best document
        retrieved_doc = self.retrieve_best_doc(clean_transcript)

        # Step 3: Get suggestion from provider
        result = copilot_provider.get_suggestion(
            transcript=clean_transcript,
            retrieved_doc=retrieved_doc,
            safe_mode_active=False,
        )
        result["call_id"] = call_id
        result["redacted"] = was_redacted or result.get("redacted", False)
        result["blackout"] = False

        return result

    # ------------------------------------------------------------------ #
    #  Seeding                                                             #
    # ------------------------------------------------------------------ #

    def _seed_default_docs(self):
        """Load a few sample policy documents so the demo starts with content."""
        defaults = [
            (
                "PCI Payment Policy 4.2",
                "Agents must never capture, repeat, or store card numbers verbally or in writing. "
                "When a customer is ready to pay, the agent must inform them they will be transferred "
                "to the secure automated payment system and should wait for the beep. The agent then "
                "presses PCI Safe Mode. The agent's audio is isolated server-side. The recording gap "
                "is marked with a token reference. Agents see only the last four digits and token.",
            ),
            (
                "Refund & Returns Policy",
                "Customers may request a full refund within 30 days of purchase. Refunds for annual "
                "subscriptions are pro-rated after 30 days. Processing time is 3–5 business days to "
                "the original payment method. Agents should verify the order number before initiating. "
                "Refunds above $500 require manager approval. No refunds on one-time professional "
                "services unless a service defect is confirmed.",
            ),
            (
                "Subscription & Cancellation Policy",
                "Customers can cancel any time. Cancellation takes effect at the end of the current "
                "billing cycle. Before processing a cancellation, agents should offer a retention "
                "discount of up to 20% for the next billing period. Agents may escalate to the "
                "retention team for annual subscribers. Document the reason for cancellation in the CRM.",
            ),
            (
                "Technical Support Escalation Guide",
                "P1 (service down): Escalate immediately to on-call engineer. SLA: 1 hour response. "
                "P2 (feature broken): Open ticket, assign to Tier-2. SLA: 4 hours. "
                "P3 (minor issue): Standard ticket queue. SLA: 2 business days. "
                "Always collect: error message, timestamp, browser/OS version, and steps to reproduce. "
                "Provide the ticket number to the customer and set the expectation on SLA.",
            ),
            (
                "Pricing & Discount Guide",
                "Starter: $19/month (up to 5 users). Professional: $49/month (up to 25 users). "
                "Enterprise: Custom pricing (unlimited users + SLA + SSO). "
                "Annual plans get a 20% discount versus monthly. "
                "Agents may apply a goodwill discount of up to 10% with manager approval. "
                "Promotional codes cannot be combined with existing discounts.",
            ),
        ]
        for title, content in defaults:
            self.add_document(title=title, content=content, uploaded_by="system")


# Module-level singleton
copilot_service = CopilotService()
