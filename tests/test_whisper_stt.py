import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "payment-service")))

from app.core.whisper_stt import WhisperSTTEngine, whisper_engine
from app.core.voice_agent import parse_spoken_digits, handle_digit_correction

def test_whisper_engine_initialization():
    engine = WhisperSTTEngine(model_name="tiny", device="cpu")
    # Engine must initialize without crashing whether whisper is pre-installed or fallback
    assert engine.device == "cpu"
    assert engine.model_name == "tiny"

def test_filler_word_filtering():
    engine = WhisperSTTEngine(model_name="tiny", device="cpu")
    phrase = "um uh okay my card number is four two four two and yes"
    filtered = engine.filter_pauses_and_fillers(phrase)
    digits = parse_spoken_digits(filtered)
    assert digits == "4242"

def test_double_zero_and_compounds():
    phrase = "four double zero five triple zero one"
    digits = parse_spoken_digits(phrase)
    assert digits == "40050001"

def test_correction_no_last_digit_was_two():
    existing = "4242424242424243"
    phrase = "no the last digit was two"
    corrected = handle_digit_correction(existing, phrase)
    assert corrected == "4242424242424242"

def test_correction_wait_last_number_was_five():
    existing = "4242424242424240"
    phrase = "wait the last number was five"
    corrected = handle_digit_correction(existing, phrase)
    assert corrected == "4242424242424245"

def test_process_spoken_card_pipeline():
    result = whisper_engine.process_spoken_card(
        "four two four two four two four two four two four two four two four two"
    )
    assert result["digits"] == "4242424242424242"
    assert result["brand"] == "Visa"
    assert result["valid_luhn"] is True
    assert result["digit_count"] == 16

def test_process_spoken_card_with_correction():
    # Simulate initial card with wrong last digit, followed by user correction
    result1 = whisper_engine.process_spoken_card(
        "four two four two four two four two four two four two four two four three"
    )
    assert result1["valid_luhn"] is False

    # User immediately corrects: "no the last digit was two"
    result2 = whisper_engine.process_spoken_card(
        "no the last digit was two",
        existing_digits=result1["digits"]
    )
    assert result2["digits"] == "4242424242424242"
    assert result2["valid_luhn"] is True
    assert result2["has_correction"] is True
