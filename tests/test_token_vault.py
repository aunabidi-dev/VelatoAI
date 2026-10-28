import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "payment-service")))

from app.core.token_vault import MockTokenVault

def test_token_vault_successful_tokenization():
    vault = MockTokenVault()
    res = vault.tokenize(
        pan="4242424242424242",
        expiry="12/28",
        cvv="123"
    )

    assert res["success"] is True
    assert res["token"].startswith("tok_pci_")
    assert res["brand"] == "Visa"
    assert res["last4"] == "4242"
    assert "4242424242424242" not in res["token"]

    # Verify vault stored metadata only
    meta = vault.get_token_metadata(res["token"])
    assert meta is not None
    assert meta["last4"] == "4242"
    assert meta["brand"] == "Visa"
    # Ensure raw pan or cvv is NEVER in the vault dictionary
    assert "pan" not in meta
    assert "cvv" not in meta

def test_token_vault_rejects_invalid_luhn():
    vault = MockTokenVault()
    with pytest.raises(ValueError, match="Luhn validation failed"):
        vault.tokenize(
            pan="4242424242424243",
            expiry="12/28",
            cvv="123",
            enforce_luhn=True
        )
