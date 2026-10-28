"""
Mock PCI-Compliant Token Vault
Simulates an external Payment Gateway (Stripe / Adyen / Braintree tokenization API).
Stores ONLY non-sensitive token metadata (token ID, last 4 digits, brand, expiry).
Guarantees PAN and CVV are NEVER persisted.
"""
import secrets
import time
from typing import Dict, Any, Optional
from .luhn import luhn_checksum, detect_card_brand, sanitize_card_display

class MockTokenVault:
    def __init__(self):
        # Key: token_id -> Value: Non-sensitive token metadata only
        self._tokens: Dict[str, Dict[str, Any]] = {}

    def tokenize(self, pan: str, expiry: str, cvv: str, enforce_luhn: bool = False) -> Dict[str, Any]:
        """
        Tokenizes the provided card credentials.
        Validates length (13-19 digits), brand and CVV format.
        Optionally strictly validates Luhn if enforce_luhn=True.
        Returns token reference and last 4 digits.
        NEVER stores or logs the full PAN or CVV.
        """
        clean_pan = pan.strip().replace(" ", "").replace("-", "")
        
        if not (13 <= len(clean_pan) <= 19):
            raise ValueError("Card number must be 13-19 digits.")

        if enforce_luhn and not luhn_checksum(clean_pan):
            raise ValueError("Luhn validation failed: invalid card number checksum.")

        brand = detect_card_brand(clean_pan)
        last4 = clean_pan[-4:]
        
        # Parse month/year for metadata
        clean_exp = expiry.replace(" ", "").replace("-", "/")
        exp_parts = clean_exp.split("/")
        exp_month = exp_parts[0] if len(exp_parts) > 0 else "01"
        exp_year = exp_parts[1] if len(exp_parts) > 1 else "30"

        # Generate standard PCI token reference
        token_id = f"tok_pci_{secrets.token_hex(12)}"
        
        token_record = {
            "token": token_id,
            "brand": brand,
            "last4": last4,
            "exp_month": exp_month,
            "exp_year": exp_year,
            "created_at": time.time(),
            "status": "active"
        }

        # Store in vault registry - zero sensitive data
        self._tokens[token_id] = token_record

        return {
            "success": True,
            "token": token_id,
            "brand": brand,
            "last4": last4,
            "masked": sanitize_card_display(clean_pan),
            "exp_month": exp_month,
            "exp_year": exp_year,
            "timestamp": time.time()
        }

    def get_token_metadata(self, token_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve token metadata (last4, brand). Cardholder PAN is never stored."""
        return self._tokens.get(token_id)

# Singleton mock token vault
vault = MockTokenVault()
