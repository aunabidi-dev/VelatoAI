"""
Compatibility Layer: Redirects to Meta Speech STT Engine.
Ensures existing tests and callers continue working seamlessly.
"""
from .meta_speech_stt import (
    MetaSpeechSTTEngine,
    meta_speech_engine,
    WhisperSTTEngine,
    whisper_engine,
    FILLER_WORDS,
)

__all__ = [
    "MetaSpeechSTTEngine",
    "meta_speech_engine",
    "WhisperSTTEngine",
    "whisper_engine",
    "FILLER_WORDS",
]
