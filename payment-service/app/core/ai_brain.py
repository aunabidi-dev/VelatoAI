"""
Intelligent Conversational Payment Agent Brain — Zero-Trust Data Plane.
Handles customer intent, questions, hesitations, in-flight corrections,
and conversational explanations, while maintaining strict PCI-DSS zero-storage compliance.
"""

import re
from typing import Dict, Any, Optional, Tuple
from .luhn import luhn_checksum, detect_card_brand, validate_expiry, validate_expiry_reason, validate_cvv
from .voice_agent import parse_spoken_digits, parse_spoken_expiry, handle_digit_correction

# Conversational hesitation & hold phrases (do NOT penalize customer attempts)
HOLD_PHRASES = [
    r"\b(hold on|one second|one sec|give me a second|give me a moment|wait a minute|wait a sec|let me grab|let me find|looking for|finding my|get my wallet|get my purse|just a second|just a moment|hang on)\b"
]

# Transfer request phrases
TRANSFER_PHRASES = [
    r"\b(transfer me|transfer to|put me back|talk to (the )?agent|speak to (the )?agent|talk to alice|speak to alice|talk to a human|talk to human|speak to human|real person|operator|can.t do this|cancel payment|give up)\b"
]

# Security reassurance questions
SECURITY_QUESTIONS = [
    r"\b(can (the )?agent hear|is (the )?agent listening|can alice hear|is alice listening|is this secure|is this safe|who are you|are you (an )?ai|where is alice|are you a robot|is my card safe)\b"
]

# Accepted card questions
CARD_TYPE_QUESTIONS = [
    r"\b(do you take amex|do you accept amex|can i use amex|american express|mastercard|discover|what cards|which cards)\b"
]

# Why did it fail questions
WHY_FAILED_QUESTIONS = [
    r"\b(why did it fail|why didn.t it work|what was wrong|what happened|what did you hear|why invalid)\b"
]

# In-flight correction indicators
CORRECTION_PATTERNS = [
    r"(?:wait|no|sorry|scratch that|i meant|correction|actually it.s|not that|correction is)\s*(.*)"
]


class PaymentAIBrain:
    """
    Autonomous conversational payment agent.
    Perceives customer dialogue, analyzes conversational intent, and generates
    natural, helpful, bank-grade voice guidance.
    """

    def perceive_intent(self, text: str) -> str:
        """Classifies customer dialogue into high-level intent."""
        clean = text.lower().strip()
        if not clean:
            return "EMPTY"

        for p in TRANSFER_PHRASES:
            if re.search(p, clean):
                return "TRANSFER_REQUEST"

        for p in HOLD_PHRASES:
            if re.search(p, clean):
                return "HOLD_HESITATION"

        for p in SECURITY_QUESTIONS:
            if re.search(p, clean):
                return "SECURITY_QUESTION"

        for p in CARD_TYPE_QUESTIONS:
            if re.search(p, clean):
                return "CARD_TYPE_QUESTION"

        for p in WHY_FAILED_QUESTIONS:
            if re.search(p, clean):
                return "WHY_FAILED_QUESTION"

        return "PAYMENT_INPUT"

    def extract_corrected_digits(self, text: str) -> str:
        """
        Handles in-flight self-corrections like:
        '4242 4242 wait no scratch that 4000 1234 5678 0987'
        """
        clean = text.lower().strip()
        for p in CORRECTION_PATTERNS:
            match = re.search(p, clean)
            if match and match.group(1):
                corrected_part = match.group(1).strip()
                digits = parse_spoken_digits(corrected_part)
                if len(digits) >= 4:
                    return digits

        # Standard extraction
        return parse_spoken_digits(text)

    # -------------------------------------------------------------------------
    #  STATE 1: CAPTURING PAN (Card Number Brain)
    # -------------------------------------------------------------------------
    def process_pan_dialogue(
        self,
        spoken_text: str,
        current_attempts: int,
        max_attempts: int,
        existing_buffer: str = ""
    ) -> Dict[str, Any]:
        """
        Intelligently handles customer utterance when collecting card numbers.
        """
        intent = self.perceive_intent(spoken_text)

        # 1. Customer requested transfer to human agent
        if intent == "TRANSFER_REQUEST":
            return {
                "action": "TRANSFER_TO_AGENT",
                "valid": False,
                "aborted": True,
                "success": False,
                "prompt": "I understand. I am transferring you directly back to your support agent Alice now.",
                "reason": "customer_requested_transfer"
            }

        # 2. Customer needs a moment / is finding card
        if intent == "HOLD_HESITATION":
            return {
                "action": "HOLD",
                "valid": False,
                "held": True,
                "prompt": "Take your time. I am right here whenever you're ready—just read the 16 digits on your card once you have it.",
                "penalty": False
            }

        # 3. Security questions
        if intent == "SECURITY_QUESTION":
            return {
                "action": "SECURITY_ANSWER",
                "valid": False,
                "held": True,
                "prompt": "You are on VelatoAI's secure automated payment line. The human agent Alice has been isolated server-side and cannot hear or see your card details. Go ahead with your card number whenever you're ready.",
                "penalty": False
            }

        # 4. Accepted card types questions
        if intent == "CARD_TYPE_QUESTION":
            return {
                "action": "INFO_ANSWER",
                "valid": False,
                "held": True,
                "prompt": "We accept all major cards including Visa, Mastercard, American Express, and Discover. Please go ahead with your 16-digit card number after the tone.",
                "penalty": False
            }

        # 5. Customer asks why a previous check failed
        if intent == "WHY_FAILED_QUESTION":
            return {
                "action": "INFO_ANSWER",
                "valid": False,
                "held": True,
                "prompt": "The digits didn't match the bank's standard checksum algorithm. It is usually just one digit misheard over the audio. Let's try reading the 16 digits once more slowly in groups of four.",
                "penalty": False
            }

        # 6. Extract digits with correction support
        digits = self.extract_corrected_digits(spoken_text)

        # Check if customer is continuing a previously buffered partial number
        if existing_buffer and len(existing_buffer) < 16 and len(digits) < 13:
            combined = existing_buffer + digits
            if len(combined) <= 19:
                digits = combined

        # Case A: Too few digits (< 13)
        if len(digits) < 13:
            # Check if customer gave a useful partial chunk (e.g. 8–12 digits)
            if len(digits) >= 8:
                last_few = digits[-4:]
                return {
                    "action": "PARTIAL_PAN",
                    "valid": False,
                    "partial_digits": digits,
                    "digits_count": len(digits),
                    "prompt": f"I have the first {len(digits)} digits ending in {last_few}. Please speak the remaining {16 - len(digits)} digits after the tone.",
                    "penalty": False
                }
            else:
                return {
                    "action": "INCOMPLETE_PAN",
                    "valid": False,
                    "digits_count": len(digits),
                    "prompt": f"I only heard {len(digits)} digits. Card numbers are typically 16 digits. Please speak your 16-digit card number after the tone.",
                    "penalty": True
                }

        # Case B: 13–19 digits -> Run Luhn Check
        brand = detect_card_brand(digits)
        last4 = digits[-4:]

        if not luhn_checksum(digits):
            new_attempts = current_attempts + 1
            if new_attempts >= max_attempts:
                return {
                    "action": "TRANSFER_TO_AGENT",
                    "valid": False,
                    "aborted": True,
                    "success": False,
                    "brand": brand,
                    "last4": last4,
                    "prompt": "We've tried verifying this card three times and it is not clearing the bank checksum. I am transferring you directly back to Alice now so she can assist you.",
                    "reason": "max_pan_retries"
                }

            brand_label = f"your {brand}" if brand and brand != "Unknown" else "the"
            if new_attempts == 1:
                prompt = f"I checked {brand_label} card ending in {last4}, but the numbers didn't pass the checksum bank verification. Could you read the 16 digits once more for me after the tone?"
            else:
                prompt = f"That card ending in {last4} still didn't clear the bank checksum. Please speak the 16 digits slowly in groups of four, or you may provide a different card."

            return {
                "action": "LUHN_FAILED",
                "valid": False,
                "brand": brand,
                "last4": last4,
                "attempt": new_attempts,
                "max_attempts": max_attempts,
                "prompt": prompt,
                "penalty": True
            }

        # Case C: Valid Card Number!
        return {
            "action": "PAN_SUCCESS",
            "valid": True,
            "pan": digits,
            "brand": brand,
            "last4": last4,
            "prompt": f"Card verified: {brand} ending in {last4}. Please state your card's expiration month and two-digit year, for example December 2028."
        }

    # -------------------------------------------------------------------------
    #  STATE 2: CAPTURING EXPIRY (Expiration Date Brain)
    # -------------------------------------------------------------------------
    def process_expiry_dialogue(
        self,
        spoken_text: str,
        current_attempts: int,
        max_attempts: int
    ) -> Dict[str, Any]:
        """
        Intelligently parses customer expiry dates, explains impossible calendar months,
        and guards against expired cards.
        """
        intent = self.perceive_intent(spoken_text)
        if intent == "TRANSFER_REQUEST":
            return {
                "action": "TRANSFER_TO_AGENT",
                "valid": False,
                "aborted": True,
                "success": False,
                "prompt": "Understood. Reconnecting you with Alice right now.",
                "reason": "customer_requested_transfer"
            }

        if intent == "HOLD_HESITATION":
            return {
                "action": "HOLD",
                "valid": False,
                "held": True,
                "prompt": "Take your time. The expiration date is printed as month and year on the front of your card.",
                "penalty": False
            }

        # Check for invalid month > 12 (e.g. "18 35" or "18/35")
        digits_combined = "".join(re.findall(r"\d+", spoken_text))
        if len(digits_combined) == 4:
            m_candidate = int(digits_combined[:2])
            if m_candidate > 12 or m_candidate == 0:
                new_attempts = current_attempts + 1
                if new_attempts >= max_attempts:
                    return {
                        "action": "TRANSFER_TO_AGENT",
                        "valid": False,
                        "aborted": True,
                        "success": False,
                        "prompt": "We were unable to verify the expiration date after three attempts. Reconnecting you with Alice now.",
                        "reason": "max_expiry_retries"
                    }
                return {
                    "action": "INVALID_MONTH",
                    "valid": False,
                    "prompt": f"I heard {digits_combined[:2]} {digits_combined[2:]}, but calendar months only run from January to December (01 to 12). Which month and year are on your card?",
                    "penalty": True
                }

        parsed_expiry = parse_spoken_expiry(spoken_text)
        if not parsed_expiry:
            new_attempts = current_attempts + 1
            if new_attempts >= max_attempts:
                return {
                    "action": "TRANSFER_TO_AGENT",
                    "valid": False,
                    "aborted": True,
                    "success": False,
                    "prompt": "We were unable to verify the expiration date after three attempts. Reconnecting you with Alice now.",
                    "reason": "max_expiry_retries"
                }
            return {
                "action": "UNPARSEABLE_EXPIRY",
                "valid": False,
                "prompt": "I didn't quite catch that expiration date. Please say the two-digit month and year, for example 12 28 or December 2028.",
                "penalty": True
            }

        # Run strict calendar validation
        is_valid = validate_expiry(parsed_expiry)
        rejection_reason = validate_expiry_reason(parsed_expiry)

        if not is_valid:
            new_attempts = current_attempts + 1
            if new_attempts >= max_attempts:
                return {
                    "action": "TRANSFER_TO_AGENT",
                    "valid": False,
                    "aborted": True,
                    "success": False,
                    "prompt": "We were unable to verify the expiration date after three attempts. Reconnecting you with Alice now.",
                    "reason": "max_expiry_retries"
                }

            if "expired" in rejection_reason.lower():
                prompt = f"That card appears to have expired in {parsed_expiry}. For your security, we require an active card. Please provide an expiration date in the future."
            elif "month" in rejection_reason.lower():
                prompt = f"Calendar months only go from 1 to 12. Please say the two-digit month first, then the year, like 12 28."
            else:
                prompt = f"That expiration date ({parsed_expiry}) could not be verified. Please check the front of your card and repeat the date."

            return {
                "action": "EXPIRY_INVALID",
                "valid": False,
                "expiry": parsed_expiry,
                "prompt": prompt,
                "penalty": True
            }

        return {
            "action": "EXPIRY_SUCCESS",
            "valid": True,
            "expiry": parsed_expiry,
            "prompt": f"Expiration date {parsed_expiry} confirmed. Now, please say the security code printed on your card."
        }

    # -------------------------------------------------------------------------
    #  STATE 3: CAPTURING CVV (Security Code Brain)
    # -------------------------------------------------------------------------
    def process_cvv_dialogue(
        self,
        spoken_text: str,
        brand: str,
        current_attempts: int,
        max_attempts: int
    ) -> Dict[str, Any]:
        """
        Intelligently verifies CVV codes with brand-aware lengths (Amex 4 vs others 3).
        """
        intent = self.perceive_intent(spoken_text)
        if intent == "TRANSFER_REQUEST":
            return {
                "action": "TRANSFER_TO_AGENT",
                "valid": False,
                "aborted": True,
                "success": False,
                "prompt": "Transferring you directly back to your support agent Alice.",
                "reason": "customer_requested_transfer"
            }

        clean = spoken_text.lower()
        if "where" in clean or "find" in clean or "what is" in clean:
            if brand == "American Express":
                return {
                    "action": "INFO",
                    "valid": False,
                    "prompt": "For American Express, the security code is the 4-digit number printed on the front of the card, above the account number.",
                    "penalty": False
                }
            else:
                return {
                    "action": "INFO",
                    "valid": False,
                    "prompt": f"For your {brand or 'credit'} card, the security code is the 3-digit number printed on the signature strip on the back.",
                    "penalty": False
                }

        digits = parse_spoken_digits(spoken_text)
        cvv = digits.replace(" ", "")

        expected_len = 4 if brand == "American Express" else 3
        if len(cvv) != expected_len:
            new_attempts = current_attempts + 1
            if new_attempts >= max_attempts:
                return {
                    "action": "TRANSFER_TO_AGENT",
                    "valid": False,
                    "aborted": True,
                    "success": False,
                    "prompt": "We were unable to verify the security code after three attempts. Reconnecting you with Alice now.",
                    "reason": "max_cvv_retries"
                }
            brand_label = f"American Express" if brand == "American Express" else f"{brand or 'Visa/Mastercard'}"
            return {
                "action": "CVV_INVALID_LENGTH",
                "valid": False,
                "prompt": f"For {brand_label}, the security code is {expected_len} digits. I heard {len(cvv)} digits. Please speak the {expected_len}-digit code after the tone.",
                "penalty": True
            }

        return {
            "action": "CVV_SUCCESS",
            "valid": True,
            "cvv": cvv,
            "prompt": "Security code received."
        }

    # -------------------------------------------------------------------------
    #  STATE 4: CONFIRMATION (Minimal Zero-Trust Confirmation Brain)
    # -------------------------------------------------------------------------
    def process_confirmation_dialogue(
        self,
        spoken_text: str,
        brand: str,
        last4: str,
        expiry: str
    ) -> Dict[str, Any]:
        """
        Interprets customer confirmation. Reads back ONLY last4 and expiry.
        """
        clean = spoken_text.lower().strip()
        is_yes = bool(re.search(r"\b(yes|yeah|yep|confirm|confirmed|correct|sure|right|ok|okay|affirmative|sounds good|it is|proceed|charge it)\b", clean))
        is_no = bool(re.search(r"\b(no|nope|wrong|incorrect|cancel|restart|stop|wait|change|different)\b", clean))

        if is_no:
            return {
                "action": "RESTART_PAYMENT",
                "confirmed": False,
                "prompt": "Understood. Let's start fresh. Please speak your 16-digit card number after the tone."
            }

        if is_yes:
            return {
                "action": "EXECUTE_PAYMENT",
                "confirmed": True,
                "prompt": f"Authorizing payment on your {brand or 'card'} ending in {last4}. Generating your secure gateway token now."
            }

        # Customer asked a question or spoke something ambiguous
        return {
            "action": "CLARIFY_CONFIRMATION",
            "confirmed": None,
            "prompt": f"I have your {brand or 'card'} ending in {last4}, expiring {expiry}. Shall I proceed with payment authorization? Please say yes to confirm, or no to restart."
        }


# Singleton instance
payment_ai_brain = PaymentAIBrain()
