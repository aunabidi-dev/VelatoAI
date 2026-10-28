import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "payment-service")))

from app.core.voice_agent import (
    parse_spoken_digits,
    handle_digit_correction,
    parse_spoken_expiry
)

def test_parse_spoken_words():
    assert parse_spoken_digits("four two four two") == "4242"
    assert parse_spoken_digits("four two four two four two four two") == "42424242"
    assert parse_spoken_digits("double four two") == "442"
    assert parse_spoken_digits("triple zero") == "000"

def test_handle_digit_correction():
    original = "4242424242424243"
    # User says: "no last digit was two"
    corrected = handle_digit_correction(original, "no last digit was two")
    assert corrected == "4242424242424242"

    # User says: "clear and start over"
    reset = handle_digit_correction(original, "clear and start over")
    assert reset == ""

def test_parse_spoken_expiry():
    assert parse_spoken_expiry("twelve twenty eight") == "12/28"
    assert parse_spoken_expiry("12 28") == "12/28"
    assert parse_spoken_expiry("december 2028") == "12/28"
    assert parse_spoken_expiry("09/28") == "09/28"
    assert parse_spoken_expiry("09 28") == "09/28"
    assert parse_spoken_expiry("9 28") == "09/28"
    assert parse_spoken_expiry("0928") == "09/28"
    assert parse_spoken_expiry("september 2028") == "09/28"
