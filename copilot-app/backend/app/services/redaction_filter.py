"""
Copilot Transcript Redaction Filter
Masks anything that looks like a card number (Luhn-valid, 13-19 digits)
BEFORE any transcript reaches a model or an outside AI provider.

This is the guard that prevents an early slip from a customer saying
digits before Safe Mode is triggered from ever travelling to a model.

Security Rule (from §11.3 of the product doc):
  "Before any transcript reaches a model, a filter masks anything
   that looks like a card number (Luhn-valid, 13 to 19 digits),
   so an early slip never travels to an outside provider."
"""
import re
from typing import Tuple


_PAN_PATTERN = re.compile(
    r'\b(?:\d[ \-]*?){13,19}\b'
)

_REDACTION_LABEL = "[CARD NUMBER REDACTED]"


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


def redact_transcript(text: str) -> Tuple[str, int]:
    """
    Scans a transcript for PAN-like digit sequences and replaces
    any Luhn-valid match with [CARD NUMBER REDACTED].

    Returns:
        (redacted_text, count_of_redactions)
    """
    if not text:
        return text, 0

    count = 0

    def _replace(match: re.Match) -> str:
        nonlocal count
        raw = match.group(0)
        digits_only = re.sub(r'\D', '', raw)
        if _quick_luhn(digits_only):
            count += 1
            return _REDACTION_LABEL
        return raw

    cleaned = _PAN_PATTERN.sub(_replace, text)
    return cleaned, count


def is_transcript_clean(text: str) -> bool:
    """
    Returns True if the transcript contains no Luhn-valid card numbers.
    Use as a quick gate before forwarding to a model.
    """
    _, redactions = redact_transcript(text)
    return redactions == 0

