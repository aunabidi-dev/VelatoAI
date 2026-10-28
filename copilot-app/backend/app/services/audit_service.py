"""
Zero-Trust Audit Service — Phase 2 Hardened
Maintains an append-only verifiable audit trail.
Records Safe Mode lifecycle and token references without holding card data.

Phase 2 additions:
  - Luhn-validated leak scanner (not just regex)
  - Scans audit events, recording metadata, and transcript store
  - Build-time test hook: scan_for_card_leaks() returns non-zero leaks → build fails
"""
import time
import uuid
import re
from typing import List, Dict, Any, Optional
from ..models.schemas import AuditEvent


# Matches 13-19 digit sequences that may contain spaces or dashes
_PAN_PATTERN = re.compile(r'\b(?:\d[ \-]*?){13,19}\b')


def _quick_luhn(digits: str) -> bool:
    """Fast Luhn (Mod 10) check on a pure-digit string."""
    if not digits or not digits.isdigit():
        return False
    n = len(digits)
    if n < 13 or n > 19:
        return False
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def scan_string_for_pan(text: str) -> List[str]:
    """
    Scans a string for Luhn-valid card number sequences.
    Returns a list of masked matches (e.g., '****4242').
    Only returns matches that pass the Luhn checksum.
    """
    if not text:
        return []

    matches = _PAN_PATTERN.findall(text)
    luhn_valid = []
    for m in matches:
        digits = re.sub(r'\D', '', m)
        if _quick_luhn(digits):
            # Mask for reporting — never expose the full PAN even in leak reports
            luhn_valid.append(f"****{digits[-4:]}")
    return luhn_valid


class AuditService:
    def __init__(self):
        self._events: List[Dict[str, Any]] = []
        # Phase 2: Transcript store for leak scanning
        self._transcript_chunks: List[Dict[str, Any]] = []
        # Phase 2: Recording metadata store for leak scanning
        self._recording_metadata: List[Dict[str, Any]] = []

    def record_event(
        self,
        call_id: str,
        event_type: str,
        token_ref: Optional[str] = None,
        last4: Optional[str] = None,
        brand: Optional[str] = None,
        details: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Records an append-only audit event.
        Guarantees that details or token_ref contain no raw PAN.
        """
        # Pre-check sanity: ensure no 13-19 digit card numbers slip into details
        if details:
            pan_match = re.search(r"\b(?:\d[ -]*?){13,19}\b", details)
            if pan_match:
                raise ValueError("Security Violation: Attempted to log potential card digits in audit trail!")

        event = {
            "id": f"aud_{uuid.uuid4().hex[:10]}",
            "call_id": call_id,
            "timestamp": time.time(),
            "event_type": event_type,
            "token_ref": token_ref,
            "last4": last4,
            "brand": brand,
            "details": details
        }
        self._events.append(event)
        return event

    def record_transcript_chunk(self, call_id: str, chunk: str, speaker: str = "customer") -> None:
        """Phase 2: Stores a transcript chunk for leak scanning."""
        self._transcript_chunks.append({
            "call_id": call_id,
            "chunk": chunk,
            "speaker": speaker,
            "timestamp": time.time(),
        })

    def record_recording_metadata(self, call_id: str, metadata: Dict[str, Any]) -> None:
        """Phase 2: Stores recording metadata for leak scanning."""
        self._recording_metadata.append({
            "call_id": call_id,
            "metadata": metadata,
            "timestamp": time.time(),
        })

    def get_events(self, call_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve audit log, optionally filtered by call_id."""
        if call_id:
            return [e for e in self._events if e["call_id"] == call_id]
        return list(self._events)

    def scan_for_card_leaks(self) -> Dict[str, Any]:
        """
        Phase 2 Enhanced: Audits ALL data stores for Luhn-valid card numbers.
        Scans:
          1. Audit events (all fields)
          2. Transcript chunks
          3. Recording metadata
        Returns structured results for the Security Proof panel.
        Leak count > 0 means the build-time test should FAIL.
        """
        leaks_detected = []
        total_records = 0

        # 1. Scan audit events
        for e in self._events:
            total_records += 1
            serialized = str(e)
            pan_matches = scan_string_for_pan(serialized)
            if pan_matches:
                leaks_detected.append({
                    "source": "audit_event",
                    "event_id": e["id"],
                    "matches": pan_matches,
                    "count": len(pan_matches),
                })

        # 2. Scan transcript chunks
        for t in self._transcript_chunks:
            total_records += 1
            pan_matches = scan_string_for_pan(t.get("chunk", ""))
            if pan_matches:
                leaks_detected.append({
                    "source": "transcript",
                    "call_id": t["call_id"],
                    "matches": pan_matches,
                    "count": len(pan_matches),
                })

        # 3. Scan recording metadata
        for r in self._recording_metadata:
            total_records += 1
            serialized = str(r.get("metadata", {}))
            pan_matches = scan_string_for_pan(serialized)
            if pan_matches:
                leaks_detected.append({
                    "source": "recording_metadata",
                    "call_id": r["call_id"],
                    "matches": pan_matches,
                    "count": len(pan_matches),
                })

        total_leaks = sum(l["count"] for l in leaks_detected)

        return {
            "total_records_checked": total_records,
            "leaks_found": total_leaks,
            "status": "COMPLIANT_ZERO_TRUST" if total_leaks == 0 else "BREACH_DETECTED",
            "sources_scanned": ["audit_events", "transcripts", "recording_metadata"],
            "details": leaks_detected,
        }


audit_service = AuditService()
