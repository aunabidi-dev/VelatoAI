"""
PCI Safe Mode State Machine
Implements strict state transitions:
NORMAL -> ISOLATING -> CAPTURING -> CONFIRMING -> TOKENIZING -> WIPING -> RESUMING
Any error, timeout or cancellation immediately forces state into WIPING.
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

class PaymentSession:
    def __init__(self, session_id: str, call_id: str):
        self.session_id = session_id
        self.call_id = call_id
        self.state: PaymentState = PaymentState.ISOLATING
        self.buffer = SecureCardBuffer()
        
        # Captured metadata for confirmation (strictly no full PAN)
        self.detected_brand: str = "Unknown"
        self.expiry_str: str = ""
        self.attempts: int = 0
        self.max_attempts: int = 3
        
        # Result token (persisted after tokenization)
        self.token_result: Optional[Dict[str, Any]] = None
        self.error_message: Optional[str] = None
        self.created_at: float = time.time()
        self.updated_at: float = time.time()

    def transition_to(self, new_state: PaymentState) -> None:
        self.state = new_state
        self.updated_at = time.time()

    def start_capture(self) -> Dict[str, Any]:
        """Transition from ISOLATING to CAPTURING_PAN."""
        self.transition_to(PaymentState.CAPTURING_PAN)
        return {
            "session_id": self.session_id,
            "state": self.state.value,
            "prompt": VoiceAgentPrompts.GREETING,
            "play_chime": True
        }

    def process_pan_input(self, spoken_text: str) -> Dict[str, Any]:
        """Process spoken or entered card number."""
        if self.state != PaymentState.CAPTURING_PAN:
            return {"error": f"Invalid state {self.state} for PAN input."}

        self.attempts += 1
        digits = parse_spoken_digits(spoken_text)

        # If speech recognition accumulated multiple repeats, take the last 16 digits
        if len(digits) > 19:
            digits = digits[-16:]
        
        # Verify length (must be standard card length 13-19 digits)
        if len(digits) < 13:
            if self.attempts >= self.max_attempts:
                self.abort("Exceeded maximum card capture attempts.")
                return {
                    "session_id": self.session_id,
                    "state": self.state.value,
                    "prompt": VoiceAgentPrompts.PAYMENT_FAILED,
                    "success": False,
                    "aborted": True
                }

            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": f"I only heard {len(digits)} digits. Please speak your full 16-digit card number.",
                "valid": False,
                "attempt": self.attempts,
                "digits_count": len(digits),
                "last4_heard": digits[-4:] if len(digits) >= 4 else ""
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
            "last4": last4
        }

    def process_expiry_input(self, spoken_text: str) -> Dict[str, Any]:
        """Process spoken expiry date."""
        if self.state != PaymentState.CAPTURING_EXPIRY:
            return {"error": f"Invalid state {self.state} for expiry input."}

        parsed_exp = parse_spoken_expiry(spoken_text)
        if not parsed_exp or not validate_expiry(parsed_exp):
            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": "Please state the expiration month and year again, for example 12 28.",
                "valid": False
            }

        self.expiry_str = parsed_exp
        self.buffer.set_expiry(parsed_exp)
        self.transition_to(PaymentState.CAPTURING_CVV)

        return {
            "session_id": self.session_id,
            "state": self.state.value,
            "prompt": VoiceAgentPrompts.CVV_REQUEST
        }

    def process_cvv_input(self, spoken_text: str) -> Dict[str, Any]:
        """Process CVV code."""
        if self.state != PaymentState.CAPTURING_CVV:
            return {"error": f"Invalid state {self.state} for CVV input."}

        digits = parse_spoken_digits(spoken_text)
        if not validate_cvv(digits, self.detected_brand):
            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": "Please repeat the 3 or 4-digit security code on your card.",
                "valid": False
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
            "expiry": self.expiry_str
        }

    def confirm_and_tokenize(self, customer_confirmed: bool) -> Dict[str, Any]:
        """Customer confirms or rejects readback."""
        if self.state != PaymentState.CONFIRMING:
            return {"error": f"Invalid state {self.state} for confirmation."}

        if not customer_confirmed:
            # Customer says no -> reset buffers and restart capture
            self.buffer.wipe_all()
            self.transition_to(PaymentState.CAPTURING_PAN)
            return {
                "session_id": self.session_id,
                "state": self.state.value,
                "prompt": "Understood. Let's restart. Please speak your 16-digit card number.",
                "restarted": True
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
        self.transition_to(PaymentState.FAILED)
