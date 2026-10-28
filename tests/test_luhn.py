import pytest
import sys
import os

# Add payment-service to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "payment-service")))

from app.core.luhn import (
    luhn_checksum,
    detect_card_brand,
    validate_expiry,
    validate_cvv,
    sanitize_card_display
)

def test_luhn_valid_cards():
    # Standard test cards
    assert luhn_checksum("4242424242424242") is True
    assert luhn_checksum("4242 4242 4242 4242") is True
    assert luhn_checksum("5555555555554444") is True
    assert luhn_checksum("378282246310005") is True

def test_luhn_invalid_cards():
    # Last digit altered to fail mod 10
    assert luhn_checksum("4242424242424243") is False
    assert luhn_checksum("1234567812345671") is False
    assert luhn_checksum("123") is False

def test_brand_detection():
    assert detect_card_brand("4242424242424242") == "Visa"
    assert detect_card_brand("5555555555554444") == "Mastercard"
    assert detect_card_brand("378282246310005") == "American Express"
    assert detect_card_brand("6011000000000000") == "Discover"

def test_expiry_validation():
    assert validate_expiry("12/28") is True
    assert validate_expiry("05/30") is True
    assert validate_expiry("13/28") is False  # Invalid month
    assert validate_expiry("00/28") is False

def test_cvv_validation():
    assert validate_cvv("123", "Visa") is True
    assert validate_cvv("1234", "Visa") is False
    assert validate_cvv("1234", "American Express") is True

def test_sanitize_card():
    assert sanitize_card_display("4242424242424242") == "************4242"
