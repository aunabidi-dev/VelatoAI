import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "payment-service")))

from app.core.meta_speech_stt import MetaSpeechSTTEngine, meta_speech_engine
from app.core.voice_agent import parse_spoken_digits, handle_digit_correction

def test_meta_speech_engine_initialization():
    engine = MetaSpeechSTTEngine(model_name="spark_open_audio", device="cpu")
    assert engine.device == "cpu"
    assert engine.is_available is True

def test_filler_word_filtering():
    engine = MetaSpeechSTTEngine(model_name="spark_open_audio", device="cpu")
    phrase = "um uh okay my card number is four two four two and yes"
    filtered = engine.filter_filler_words(phrase)
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
    result = meta_speech_engine.process_spoken_card(
        "four two four two four two four two four two four two four two four two"
    )
    assert result["digits"] == "4242424242424242"
    assert result["brand"] == "Visa"
    assert result["valid_luhn"] is True
    assert result["digit_count"] == 16
    assert "Muse Spark Open" in result["engine"]

def test_process_spoken_card_with_correction():
    # Simulate initial card with wrong last digit, followed by user correction
    result1 = meta_speech_engine.process_spoken_card(
        "four two four two four two four two four two four two four two four three"
    )
    assert result1["valid_luhn"] is False

    # User immediately corrects: "no the last digit was two"
    result2 = meta_speech_engine.process_spoken_card(
        "no the last digit was two",
        existing_digits=result1["digits"]
    )
    assert result2["digits"] == "4242424242424242"
    assert result2["valid_luhn"] is True
    assert result2["has_correction"] is True

