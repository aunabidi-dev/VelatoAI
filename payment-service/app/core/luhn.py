"""
Luhn Algorithm and Card Validation Engine
Zero-Trust PCI Voice Intercept & Live Support Copilot
"""
import re
from typing import Dict, Any, Optional

def luhn_checksum(card_number: str) -> bool:
    """
    Validates a card number string using the Luhn Algorithm (Mod 10).
    Works on raw numeric string of 13-19 digits.
    """
    clean_digits = re.sub(r"\D", "", card_number)
    if not (13 <= len(clean_digits) <= 19):
        return False

    digits = [int(d) for d in clean_digits]
    checksum = 0
    # Process from right to left, doubling every second digit starting from the second-to-last
    reverse_digits = digits[::-1]
    for i, d in enumerate(reverse_digits):
        if i % 2 == 1:
            doubled = d * 2
            checksum += (doubled - 9) if doubled > 9 else doubled
        else:
            checksum += d

    return (checksum % 10) == 0

def detect_card_brand(card_number: str) -> str:
    """Detects card brand from Issuer Identification Number (IIN / BIN)."""
    digits = re.sub(r"\D", "", card_number)
    if digits.startswith("4"):
        return "Visa"
    elif re.match(r"^5[1-5]", digits) or re.match(r"^2(2[2-9][1-9]|[3-6]\d{2}|7[0-1]\d|720)", digits):
        return "Mastercard"
    elif re.match(r"^3[47]", digits):
        return "American Express"
    elif re.match(r"^6(011|5|4[4-9])", digits):
        return "Discover"
    return "Unknown"

def validate_expiry(expiry_str: str) -> bool:
    """
    Validates MM/YY or MM/YYYY format and checks reasonable range.
    """
    clean = expiry_str.strip().replace(" ", "")
    match = re.match(r"^(0[1-9]|1[0-2])[\/\-]?([2-9]\d)$", clean)
    if not match:
        return False
    month, year_suffix = int(match.group(1)), int(match.group(2))
    # Hackathon timeline is 2026 onwards
    year = 2000 + year_suffix
    if year < 2024 or year > 2045:
        return False
    return True

def validate_cvv(cvv_str: str, brand: str = "Unknown") -> bool:
    """Validates CVV (3 digits for most, 4 digits for Amex)."""
    clean = re.sub(r"\D", "", cvv_str)
    if brand == "American Express":
        return len(clean) in (3, 4)
    return len(clean) == 3

def sanitize_card_display(card_number: str) -> str:
    """Returns only masked card number with last 4 digits (e.g. ************4242)."""
    digits = re.sub(r"\D", "", card_number)
    if len(digits) < 4:
        return "****"
    return "*" * (len(digits) - 4) + digits[-4:]
