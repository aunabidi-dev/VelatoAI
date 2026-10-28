"""
Zero-Trust PCI Log Redaction Filter
Intercepts ALL Python log output and masks any Luhn-valid 13-19 digit
sequences before they reach stdout, files, or any log sink.

This is a second line of defence: card data should never reach logging
in the first place, but this filter ensures that if it does, it is
masked before it leaves the process.

Installed at application startup on the root logger.
"""
import logging
import re
from typing import Optional


# Matches 13-19 digit sequences that may contain spaces or dashes
_PAN_PATTERN = re.compile(
    r'\b(?:\d[ \-]*?){13,19}\b'
)

# Matches a clean run of 13-19 digits (after stripping separators)
_DIGIT_RUN = re.compile(r'\d{13,19}')

_REDACTION_LABEL = "[PAN REDACTED]"


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


def redact_pan_from_text(text: str) -> str:
    """
    Scans *text* for any PAN-like digit sequence and replaces
    Luhn-valid matches with [PAN REDACTED].
    Returns the cleaned text.
    """
    if not text:
        return text

    def _replace(match: re.Match) -> str:
        raw = match.group(0)
        digits_only = re.sub(r'\D', '', raw)
        if _quick_luhn(digits_only):
            return _REDACTION_LABEL
        return raw

    return _PAN_PATTERN.sub(_replace, text)


class PCILogRedactionFilter(logging.Filter):
    """
    Python logging filter that scrubs Luhn-valid card numbers from
    every log record's message, args, and exc_text before emission.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        # Redact the formatted message
        if record.msg and isinstance(record.msg, str):
            record.msg = redact_pan_from_text(record.msg)

        # Redact positional args that are strings
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: redact_pan_from_text(v) if isinstance(v, str) else v
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    redact_pan_from_text(a) if isinstance(a, str) else a
                    for a in record.args
                )

        # Redact exception text if present
        if record.exc_text and isinstance(record.exc_text, str):
            record.exc_text = redact_pan_from_text(record.exc_text)

        return True  # Always emit the record (redacted)


def install_log_redaction(logger_name: Optional[str] = None) -> None:
    """
    Installs the PCI redaction filter on the specified logger
    (or the root logger when *logger_name* is None).
    Safe to call multiple times; adds the filter only once.
    """
    target = logging.getLogger(logger_name)
    # Avoid double-install
    for f in target.filters:
        if isinstance(f, PCILogRedactionFilter):
            return
    target.addFilter(PCILogRedactionFilter())

    # Also install on all handlers of the target logger
    for handler in target.handlers:
        already = any(isinstance(f, PCILogRedactionFilter) for f in handler.filters)
        if not already:
            handler.addFilter(PCILogRedactionFilter())

