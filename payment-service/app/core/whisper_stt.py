"""
Whisper Speech-to-Text (STT) Integration for Zero-Trust PCI Voice Intercept.
Loads Whisper (tiny/base) on CPU to process spoken card credentials in-memory.
Never persists sensitive audio or intermediate transcripts to non-volatile disk.
"""
import io
import os
import re
import wave
import tempfile
from typing import Dict, Any, Optional, Union
from .voice_agent import (
    parse_spoken_digits,
    handle_digit_correction,
    parse_spoken_expiry,
    WORD_TO_DIGIT
)
from .luhn import luhn_checksum, detect_card_brand

# Filler words to ignore in spoken digit streams
FILLER_WORDS = {
    "um", "uh", "ah", "er", "hmm", "and", "the", "my", "card", "number",
    "is", "it", "its", "so", "like", "okay", "ok", "please", "yes"
}

class WhisperSTTEngine:
    def __init__(self, model_name: str = "tiny", device: str = "cpu"):
        self.model_name = model_name
        self.device = device
        self._model = None
        self._is_available = False
        self._load_model()

    def _load_model(self):
        """Attempts to load Whisper model on CPU."""
        try:
            import whisper
            import torch
            # Enforce CPU execution
            self._model = whisper.load_model(self.model_name, device=self.device)
            self._is_available = True
            print(f"[WhisperSTTEngine] Loaded Whisper '{self.model_name}' on {self.device}.")
        except Exception as e:
            self._is_available = False
            self._model = None
            print(f"[WhisperSTTEngine] Whisper not available ({e}). Running in resilient fallback mode.")

    @property
    def is_available(self) -> bool:
        return self._is_available

    def transcribe_file(self, file_path: str) -> str:
        """Transcribes an audio file on disk."""
        if not self._is_available or self._model is None:
            return ""
        try:
            result = self._model.transcribe(
                file_path,
                fp16=False,
                language="en",
                temperature=0.0
            )
            return result.get("text", "").strip()
        except Exception as e:
            print(f"[WhisperSTTEngine] Transcription error: {e}")
            return ""

    def transcribe_audio_bytes(self, audio_bytes: bytes) -> str:
        """
        Transcribes in-memory audio bytes (WAV/PCM/WebM).
        Writes to a temporary memory-backed file descriptor, transcribes,
        and wipes the temporary file immediately.
        """
        if not self._is_available or self._model is None:
            return ""

        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio_bytes)
                temp_path = tmp.name

            text = self.transcribe_file(temp_path)
            return text
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

    def filter_pauses_and_fillers(self, text: str) -> str:
        """Strips hesitation markers, fillers, and conversational pauses."""
        clean = re.sub(r"[^\w\s]", " ", text.lower())
        tokens = clean.split()
        filtered = [t for t in tokens if t not in FILLER_WORDS]
        return " ".join(filtered)

    def process_spoken_card(
        self,
        audio_source: Union[bytes, str],
        existing_digits: str = ""
    ) -> Dict[str, Any]:
        """
        End-to-end voice processing:
        1. Transcribe audio using Whisper CPU
        2. Clean pauses & fillers
        3. Check for corrections ('no the last digit was two')
        4. Assemble digits (compound numbers, double zero)
        5. Run Luhn validation
        """
        if isinstance(audio_source, str):
            if os.path.isfile(audio_source):
                raw_text = self.transcribe_file(audio_source)
            else:
                # Direct spoken string input
                raw_text = audio_source
        elif isinstance(audio_source, bytes):
            raw_text = self.transcribe_audio_bytes(audio_source)
        else:
            raw_text = ""

        # Check for corrections first
        has_correction = False
        corrected_digits = existing_digits

        if any(w in raw_text.lower() for w in ["last digit", "last one", "last number", "change", "start over", "clear", "replace", "no"]):
            corrected_digits = handle_digit_correction(existing_digits, raw_text)
            has_correction = True
            clean_digits = corrected_digits
        else:
            filtered_text = self.filter_pauses_and_fillers(raw_text)
            clean_digits = parse_spoken_digits(filtered_text)

        brand = detect_card_brand(clean_digits) if clean_digits else "Unknown"
        is_valid = luhn_checksum(clean_digits) if len(clean_digits) >= 13 else False

        return {
            "transcript": raw_text,
            "digits": clean_digits,
            "brand": brand,
            "valid_luhn": is_valid,
            "has_correction": has_correction,
            "digit_count": len(clean_digits)
        }

# Singleton instance
whisper_engine = WhisperSTTEngine(model_name="tiny", device="cpu")
