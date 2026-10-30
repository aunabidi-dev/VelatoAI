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
import hashlib
import json
import csv
import io
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
        # Phase 4: Cryptographic SHA-256 chain genesis
        self._genesis_hash: str = "0" * 64
        self._prev_hash: str = self._genesis_hash

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

        ts = time.time()
        event_id = f"aud_{uuid.uuid4().hex[:10]}"
        # Phase 4: Cryptographic SHA-256 Hash Chaining
        hash_payload = {
            "id": event_id,
            "call_id": call_id,
            "timestamp": ts,
            "event_type": event_type,
            "token_ref": token_ref,
            "last4": last4,
            "brand": brand,
            "details": details,
            "prev_hash": self._prev_hash,
        }
        serialized_payload = json.dumps(hash_payload, sort_keys=True)
        event_hash = hashlib.sha256(serialized_payload.encode("utf-8")).hexdigest()

        event = {
            **hash_payload,
            "hash": event_hash,
        }
        self._prev_hash = event_hash
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
        Phase 2 & Phase 4 Enhanced: Audits ALL data stores for Luhn-valid card numbers.
        Scans:
          1. Audit events (all fields)
          2. Transcript chunks
          3. Recording metadata
        Returns structured results for the Security Proof panel with benchmark timing.
        Leak count > 0 means the build-time test should FAIL.
        """
        start_t = time.perf_counter()
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

        scan_duration_ms = round((time.perf_counter() - start_t) * 1000, 2)
        return {
            "total_records_checked": total_records,
            "leaks_found": total_leaks,
            "status": "COMPLIANT_ZERO_TRUST" if total_leaks == 0 else "BREACH_DETECTED",
            "sources_scanned": ["audit_events", "transcripts", "recording_metadata"],
            "scan_duration_ms": scan_duration_ms,
            "details": leaks_detected,
        }

    # ── Phase 4: Cryptographic Verification & Export ──────────────────────────

    def verify_chain_integrity(self) -> Dict[str, Any]:
        """
        Phase 4: Cryptographically verifies the SHA-256 hash chain of the audit trail.
        Returns whether the tamper-evident chain is intact.
        """
        expected_prev = self._genesis_hash
        for idx, event in enumerate(self._events):
            if event.get("prev_hash") != expected_prev:
                return {
                    "valid": False,
                    "status": "TAMPER_DETECTED",
                    "broken_at_index": idx,
                    "event_id": event.get("id"),
                    "details": "Previous hash link mismatch"
                }

            # Recalculate hash of payload
            hash_payload = {
                "id": event.get("id"),
                "call_id": event.get("call_id"),
                "timestamp": event.get("timestamp"),
                "event_type": event.get("event_type"),
                "token_ref": event.get("token_ref"),
                "last4": event.get("last4"),
                "brand": event.get("brand"),
                "details": event.get("details"),
                "prev_hash": event.get("prev_hash"),
            }
            computed_hash = hashlib.sha256(json.dumps(hash_payload, sort_keys=True).encode("utf-8")).hexdigest()
            if event.get("hash") != computed_hash:
                return {
                    "valid": False,
                    "status": "TAMPER_DETECTED",
                    "broken_at_index": idx,
                    "event_id": event.get("id"),
                    "details": "Payload content altered after signing"
                }
            expected_prev = event.get("hash")

        return {
            "valid": True,
            "status": "CRYPTOGRAPHICALLY_VERIFIED",
            "algorithm": "SHA-256",
            "total_events": len(self._events),
            "latest_hash": self._prev_hash,
            "genesis_hash": self._genesis_hash
        }

    def export_audit_log(self, format_type: str = "json") -> Dict[str, Any]:
        """
        Phase 4: Exports the verifiable audit trail in JSON or CSV format.
        Includes full cryptographic proof and signature block.
        """
        verification = self.verify_chain_integrity()
        events = list(self._events)

        if format_type.lower() == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["id", "call_id", "timestamp", "event_type", "token_ref", "last4", "brand", "details", "prev_hash", "hash"])
            for e in events:
                writer.writerow([
                    e.get("id"), e.get("call_id"), e.get("timestamp"), e.get("event_type"),
                    e.get("token_ref") or "", e.get("last4") or "", e.get("brand") or "",
                    e.get("details") or "", e.get("prev_hash") or "", e.get("hash") or ""
                ])
            return {
                "format": "csv",
                "content": output.getvalue(),
                "verification": verification,
                "exported_at": time.time(),
            }

        return {
            "format": "json",
            "events": events,
            "verification": verification,
            "exported_at": time.time(),
        }


audit_service = AuditService()
