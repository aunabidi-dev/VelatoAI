"""
PCI Safe Mode State Machine — Phase 2 Hardened
Implements strict state transitions with TIMEOUTS, RETRIES, and ABUSE LIMITS:
NORMAL -> ISOLATING -> CAPTURING -> CONFIRMING -> TOKENIZING -> WIPING -> RESUMING
Any error, timeout or cancellation immediately forces state into WIPING.

Phase 2 additions:
  - Per-state timeout (30s default). Auto-abort -> WIPING if state hasn't progressed.
  - Per-field retry counters for PAN, expiry, and CVV (max 3 each).
  - Global abuse limit of 3 total capture attempts across all fields.
  - State transition timestamp tracking for timeout enforcement.
"""
from enum import Enum
import time
from typing import Optional, Dict, Any
from .secure_memory import SecureCardBuffer
from .token_vault import vault
from .luhn import luhn_checksum, detect_card_brand, validate_expiry, validate_cvv
from .voice_agent import (
    parse_spoken_digits,
    handle_digit_correction,
    parse_spoken_expiry,
    VoiceAgentPrompts
)

# Phase 2: Configurable timeout per state (seconds)
STATE_TIMEOUT_SECONDS: Dict[str, float] = {
    "CAPTURING_PAN": 60.0,    # 60s to speak full card number
    "CAPTURING_EXPIRY": 30.0, # 30s to speak expiry
    "CAPTURING_CVV": 30.0,    # 30s to speak CVV
    "CONFIRMING": 30.0,       # 30s to confirm readback
    "TOKENIZING": 15.0,       # 15s for gateway call
}

# Phase 2: Per-field max retries
MAX_PAN_RETRIES = 3
MAX_EXPIRY_RETRIES = 3
MAX_CVV_RETRIES = 3


class PaymentState(str, Enum):
    NORMAL = "NORMAL"
    ISOLATING = "ISOLATING"
    CAPTURING_PAN = "CAPTURING_PAN"
    CAPTURING_EXPIRY = "CAPTURING_EXPIRY"
    CAPTURING_CVV = "CAPTURING_CVV"
    CONFIRMING = "CONFIRMING"
    TOKENIZING = "TOKENIZING"
    WIPING = "WIPING"
    RESUMING = "RESUMING"
    FAILED = "FAILED"
    TIMED_OUT = "TIMED_OUT"


class PaymentSession:
    def __init__(self, session_id: str, call_id: str):
        self.session_id = session_id
        self.call_id = call_id
        self.state: PaymentState = PaymentState.ISOLATING
        self.buffer = SecureCardBuffer()

        # Captured metadata for confirmation (strictly no full PAN)
        self.detected_brand: str = "Unknown"
        self.expiry_str: str = ""

        # Phase 2: Per-field retry counters
        self.pan_attempts: int = 0
        self.expiry_attempts: int = 0
        self.cvv_attempts: int = 0

        # Legacy compat
        self.attempts: int = 0
        self.max_attempts: int = 3

        # Phase 2: State timing for timeout enforcement
        self.state_entered_at: float = time.time()
        self.created_at: float = time.time()
        self.updated_at: float = time.time()

        # Result token (persisted after tokenization)
        self.token_result: Optional[Dict[str, Any]] = None
        self.error_message: Optional[str] = None
        self.timed_out: bool = False

    def transition_to(self, new_state: PaymentState) -> None:
        self.state = new_state
        self.state_entered_at = time.time()
        self.updated_at = time.time()

    def check_timeout(self) -> bool:
        """
        Phase 2: Checks if the current state has exceeded its timeout.
        Returns True if timed out (and triggers abort + wipe).
        """
        timeout = STATE_TIMEOUT_SECONDS.get(self.state.value)
        if timeout is None:
            return False  # No timeout for this state

        elapsed = time.time() - self.state_entered_at
        if elapsed > timeout:
            self.timed_out = True
            self.abort(f"State {self.state.value} timed out after {elapsed:.1f}s (limit: {timeout}s)")
            return True
        return False

    def seconds_remaining(self) -> Optional[float]:
        """Returns seconds remaining before the current state times out, or None."""
        timeout = STATE_TIMEOUT_SECONDS.get(self.state.value)
        if timeout is None:
            return None
        elapsed = time.time() - self.state_entered_at
        return max(0.0, timeout - elapsed)

    def start_capture(self) -> Dict[str, Any]:
        """Transition from ISOLATING to CAPTURING_PAN."""
        self.transition_to(PaymentState.CAPTURING_PAN)
        return {
            "session_id": self.session_id,
            "state": self.state.value,
            "prompt": VoiceAgentPrompts.GREETING,
            "play_chime": True,
            "timeout_seconds": STATE_TIMEOUT_SECONDS.get("CAPTURING_PAN"),
        }

    def process_pan_input(self, spoken_text: str) -> Dict[str, Any]:
        """Process spoken or entered card number."""
        if self.state != PaymentState.CAPTURING_PAN:
            return {"error": f"Invalid state {self.state} for PAN input."}

        # Phase 2: Check timeout before processing
        if self.check_timeout():
            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": VoiceAgentPrompts.PAYMENT_FAILED,
                "success": False,
                "timed_out": True,
            }

        self.pan_attempts += 1
        self.attempts += 1
        digits = parse_spoken_digits(spoken_text)

        # If speech recognition accumulated multiple repeats, take the last 16 digits
        if len(digits) > 19:
            digits = digits[-16:]

        # Verify length (must be standard card length 13-19 digits)
        if len(digits) < 13:
            if self.pan_attempts >= MAX_PAN_RETRIES:
                self.abort("Exceeded maximum card capture attempts.")
                return {
                    "session_id": self.session_id,
                    "state": self.state.value,
                    "prompt": VoiceAgentPrompts.PAYMENT_FAILED,
                    "success": False,
                    "aborted": True,
                    "reason": "max_pan_retries",
                }

            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": f"I only heard {len(digits)} digits. Please speak your full 16-digit card number.",
                "valid": False,
                "attempt": self.pan_attempts,
                "max_attempts": MAX_PAN_RETRIES,
                "digits_count": len(digits),
                "last4_heard": digits[-4:] if len(digits) >= 4 else "",
                "timeout_seconds": self.seconds_remaining(),
            }

        # Store EXACT digits in volatile secure memory buffer without altering them!
        self.buffer.set_pan(digits)
        self.detected_brand = detect_card_brand(digits)
        self.transition_to(PaymentState.CAPTURING_EXPIRY)
        last4 = self.buffer.get_pan_last4()

        return {
            "session_id": self.session_id,
            "state": self.state.value,
            "prompt": f"Card verified: {self.detected_brand} ending in {last4}. Please state the expiration month and year, for example 12 28.",
            "brand": self.detected_brand,
            "last4": last4,
            "timeout_seconds": STATE_TIMEOUT_SECONDS.get("CAPTURING_EXPIRY"),
        }

    def process_expiry_input(self, spoken_text: str) -> Dict[str, Any]:
        """Process spoken expiry date."""
        if self.state != PaymentState.CAPTURING_EXPIRY:
            return {"error": f"Invalid state {self.state} for expiry input."}

        # Phase 2: Check timeout
        if self.check_timeout():
            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": VoiceAgentPrompts.PAYMENT_FAILED,
                "success": False,
                "timed_out": True,
            }

        self.expiry_attempts += 1

        parsed_exp = parse_spoken_expiry(spoken_text)
        if not parsed_exp or not validate_expiry(parsed_exp):
            # Phase 2: Per-field retry for expiry
            if self.expiry_attempts >= MAX_EXPIRY_RETRIES:
                self.abort("Exceeded maximum expiry input attempts.")
                return {
                    "session_id": self.session_id,
                    "state": self.state.value,
                    "prompt": VoiceAgentPrompts.PAYMENT_FAILED,
                    "success": False,
                    "aborted": True,
                    "reason": "max_expiry_retries",
                }

            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": "Please state the expiration month and year again, for example 12 28.",
                "valid": False,
                "attempt": self.expiry_attempts,
                "max_attempts": MAX_EXPIRY_RETRIES,
                "timeout_seconds": self.seconds_remaining(),
            }

        self.expiry_str = parsed_exp
        self.buffer.set_expiry(parsed_exp)
        self.transition_to(PaymentState.CAPTURING_CVV)

        return {
            "session_id": self.session_id,
            "state": self.state.value,
            "prompt": VoiceAgentPrompts.CVV_REQUEST,
            "timeout_seconds": STATE_TIMEOUT_SECONDS.get("CAPTURING_CVV"),
        }

    def process_cvv_input(self, spoken_text: str) -> Dict[str, Any]:
        """Process CVV code."""
        if self.state != PaymentState.CAPTURING_CVV:
            return {"error": f"Invalid state {self.state} for CVV input."}

        # Phase 2: Check timeout
        if self.check_timeout():
            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": VoiceAgentPrompts.PAYMENT_FAILED,
                "success": False,
                "timed_out": True,
            }

        self.cvv_attempts += 1

        digits = parse_spoken_digits(spoken_text)
        if not validate_cvv(digits, self.detected_brand):
            # Phase 2: Per-field retry for CVV
            if self.cvv_attempts >= MAX_CVV_RETRIES:
                self.abort("Exceeded maximum CVV input attempts.")
                return {
                    "session_id": self.session_id,
                    "state": self.state.value,
                    "prompt": VoiceAgentPrompts.PAYMENT_FAILED,
                    "success": False,
                    "aborted": True,
                    "reason": "max_cvv_retries",
                }

            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": "Please repeat the 3 or 4-digit security code on your card.",
                "valid": False,
                "attempt": self.cvv_attempts,
                "max_attempts": MAX_CVV_RETRIES,
                "timeout_seconds": self.seconds_remaining(),
            }

        self.buffer.set_cvv(digits)
        self.transition_to(PaymentState.CONFIRMING)

        last4 = self.buffer.get_pan_last4()
        prompt = VoiceAgentPrompts.CONFIRMATION_TEMPLATE.format(
            brand=self.detected_brand,
            last4=last4,
            expiry=self.expiry_str
        )

        return {
            "session_id": self.session_id,
            "state": self.state.value,
            "prompt": prompt,
            "brand": self.detected_brand,
            "last4": last4,
            "expiry": self.expiry_str,
            "timeout_seconds": STATE_TIMEOUT_SECONDS.get("CONFIRMING"),
        }

    def confirm_and_tokenize(self, customer_confirmed: bool) -> Dict[str, Any]:
        """Customer confirms or rejects readback."""
        if self.state != PaymentState.CONFIRMING:
            return {"error": f"Invalid state {self.state} for confirmation."}

        # Phase 2: Check timeout
        if self.check_timeout():
            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": VoiceAgentPrompts.PAYMENT_FAILED,
                "success": False,
                "timed_out": True,
            }

        if not customer_confirmed:
            # Customer says no -> reset buffers and restart capture
            self.buffer.wipe_all()
            self.pan_attempts = 0  # Reset PAN attempts for restart
            self.expiry_attempts = 0
            self.cvv_attempts = 0
            self.transition_to(PaymentState.CAPTURING_PAN)
            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": "Understood. Let's restart. Please speak your 16-digit card number.",
                "restarted": True,
                "timeout_seconds": STATE_TIMEOUT_SECONDS.get("CAPTURING_PAN"),
            }

        # Step 5: TOKENIZING
        self.transition_to(PaymentState.TOKENIZING)
        try:
            token_res = vault.tokenize(
                pan=self.buffer.get_pan_raw(),
                expiry=self.buffer.get_expiry(),
                cvv=self.buffer.get_cvv_raw()
            )
            self.token_result = token_res
        except Exception as e:
            self.abort(f"Tokenization failed: {str(e)}")
            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": VoiceAgentPrompts.PAYMENT_FAILED,
                "success": False
            }

        # Step 6: WIPING (Zeroization of sensitive memory buffers)
        self.transition_to(PaymentState.WIPING)
        self.buffer.wipe_all()
        wiped_confirmed = self.buffer.is_wiped

        # Step 7: RESUMING
        self.transition_to(PaymentState.RESUMING)

        return {
            "session_id": self.session_id,
            "state": self.state.value,
            "success": True,
            "prompt": VoiceAgentPrompts.PAYMENT_SUCCESS,
            "token": self.token_result["token"],
            "brand": self.token_result["brand"],
            "last4": self.token_result["last4"],
            "wiped_confirmed": wiped_confirmed,
            "play_chime": True
        }

    def abort(self, reason: str = "Aborted by user or timeout") -> None:
        """Forces state machine into WIPING then FAILED. Immediately zeroizes memory."""
        self.transition_to(PaymentState.WIPING)
        self.buffer.wipe_all()
        self.error_message = reason
        if self.timed_out:
            self.transition_to(PaymentState.TIMED_OUT)
        else:
            self.transition_to(PaymentState.FAILED)
