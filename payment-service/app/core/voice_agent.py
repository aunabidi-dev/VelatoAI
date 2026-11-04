"""
Voice Capture & Digit Assembly Engine for Spoken Card Data
Parses spoken word numbers, handles speech corrections, and manages prompt turns.
"""
import re
from typing import Tuple, List, Optional
from .luhn import luhn_checksum, detect_card_brand

WORD_TO_DIGIT = {
    "zero": "0", "oh": "0", "o": "0", "nought": "0",
    "one": "1", "won": "1",
    "two": "2", "to": "2", "too": "2",
    "three": "3", "tree": "3",
    "four": "4", "for": "4", "fore": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8", "ate": "8",
    "nine": "9",
    "ten": "10",
    "eleven": "11",
    "twelve": "12",
    "thirteen": "13",
    "fourteen": "14",
    "fifteen": "15",
    "sixteen": "16",
    "seventeen": "17",
    "eighteen": "18",
    "nineteen": "19",
    "twenty": "20",
    "thirty": "30",
    "forty": "40",
    "fifty": "50",
    "sixty": "60",
    "seventy": "70",
    "eighty": "80",
    "ninety": "90"
}

TENS = {
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90
}

ONES = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "won": 1, "to": 2, "too": 2, "tree": 3, "for": 4, "fore": 4, "ate": 8
}

DOUBLE_TRIPLE = {
    "double": 2,
    "triple": 3
}

def parse_spoken_digits(text: str) -> str:
    """
    Translates spoken phrases into a clean string of numeric digits.
    Supports formats like:
      - 'four two four two' -> '4242'
      - 'twenty eight' -> '28'
      - 'forty two' -> '42'
      - 'double four' -> '44'
      - 'triple zero' -> '000'
      - '4242 4242 4242 4242' -> '4242424242424242'
    """
    clean_text = text.lower().replace("-", " ").replace(",", " ")
    tokens = clean_text.split()
    digits = []
    i = 0
    while i < len(tokens):
        token = tokens[i]
        
        # Check multiplier (double / triple)
        if token in DOUBLE_TRIPLE and (i + 1) < len(tokens):
            multiplier = DOUBLE_TRIPLE[token]
            next_token = tokens[i + 1]
            mapped = WORD_TO_DIGIT.get(next_token, "")
            if not mapped and next_token.isdigit():
                mapped = next_token
            if mapped:
                digits.append(mapped[0] * multiplier)
                i += 2
                continue

        # Check compound tens (twenty eight -> 28)
        if token in TENS:
            if (i + 1) < len(tokens) and tokens[i + 1] in ONES:
                compound = TENS[token] + ONES[tokens[i + 1]]
                digits.append(str(compound))
                i += 2
                continue
            else:
                digits.append(str(TENS[token]))
                i += 1
                continue
                
        # Direct word to digit
        if token in WORD_TO_DIGIT:
            digits.append(WORD_TO_DIGIT[token])
        elif token.isdigit():
            digits.append(token)
        else:
            # Check if there are embedded numbers in token
            sub_digits = re.findall(r"\d", token)
            if sub_digits:
                digits.extend(sub_digits)
        i += 1
        
    return "".join(digits)

def handle_digit_correction(existing_digits: str, correction_phrase: str) -> str:
    """
    Handles speech corrections such as:
    - 'no the third digit was five'
    - 'replace last digit with two'
    - 'clear and start over'
    """
    phrase = correction_phrase.lower()
    
    if "start over" in phrase or "clear" in phrase or "reset" in phrase:
        return ""
        
    # 'last digit was X' or 'last one is X' or 'last number should be X' or 'no the last digit was X'
    last_match = re.search(r"(?:last|final)\s+(?:digit|one|number)\s+(?:was|is|should be|to|with)?\s*([a-z0-9]+)", phrase)
    if last_match and existing_digits:
        new_val = parse_spoken_digits(last_match.group(1))
        if new_val:
            return existing_digits[:-1] + new_val[-1]

    # 'the Nth digit was X'
    ordinal_map = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6}
    for ord_word, index in ordinal_map.items():
        if f"{ord_word} digit was" in phrase or f"{ord_word} digit is" in phrase:
            match = re.search(rf"{ord_word} digit (?:was|is) ([a-z0-9]+)", phrase)
            if match:
                new_digit = parse_spoken_digits(match.group(1))
                if new_digit and len(existing_digits) >= index:
                    idx = index - 1
                    return existing_digits[:idx] + new_digit[0] + existing_digits[idx+1:]
                    
    # If not a recognized correction format, parse any new digits and append
    new_digits = parse_spoken_digits(correction_phrase)
    if len(new_digits) >= 13:
        # Full replacement spoken
        return new_digits
        
    return existing_digits + new_digits

def parse_spoken_expiry(text: str) -> Optional[str]:
    """
    Parses spoken expiry, e.g.:
    - '09/28' -> '09/28'
    - '9/28' -> '09/28'
    - '09 28' -> '09/28'
    - '9 28' -> '09/28'
    - '0928' -> '09/28'
    - '928' -> '09/28'
    - 'september 2028' -> '09/28'
    - 'twelve twenty eight' -> '12/28'
    - 'may twenty seven' -> '05/27'
    """
    if not text:
        return None

    clean = text.strip().lower()

    # Direct match for MM/YY, M/YY, MM/YYYY
    slash_match = re.search(r"\b(0?[1-9]|1[0-2])\s*[\/\-\s]\s*(?:20)?(\d{2})\b", clean)
    if slash_match:
        m = slash_match.group(1).zfill(2)
        y = slash_match.group(2)
        return f"{m}/{y}"

    month_names = {
        "january": "01", "february": "02", "march": "03", "april": "04",
        "may": "05", "june": "06", "july": "07", "august": "08",
        "september": "09", "october": "10", "november": "11", "december": "12",
        "jan": "01", "feb": "02", "mar": "03", "apr": "04",
        "jun": "06", "jul": "07", "aug": "08", "sep": "09",
        "oct": "10", "nov": "11", "dec": "12"
    }

    for m_name, m_num in month_names.items():
        if m_name in clean:
            digits = parse_spoken_digits(clean.replace(m_name, ""))
            if len(digits) >= 2:
                year = digits[-2:]
                return f"{m_num}/{year}"
            return f"{m_num}/28"

    digits = parse_spoken_digits(clean)
    if len(digits) == 4:
        m = digits[:2]
        y = digits[2:]
        m_int = int(m)
        if 1 <= m_int <= 12:
            return f"{m}/{y}"
        return None  # Month > 12 is strictly invalid (e.g. 18/35)
    elif len(digits) == 3:
        # e.g. 928 -> 09/28
        m = f"0{digits[0]}"
        y = digits[1:]
        m_int = int(m)
        if 1 <= m_int <= 12:
            return f"{m}/{y}"
        return None  # Invalid
    elif len(digits) == 6:
        # e.g. 122028 -> 12/28
        m = digits[:2]
        y = digits[4:]
        if 1 <= int(m) <= 12:
            return f"{m}/{y}"

    return None

class VoiceAgentPrompts:
    GREETING = (
        "Welcome to the secure payment line. For your security, the agent has been "
        "isolated and cannot hear this conversation. Please speak your 16-digit card number after the tone."
    )
    RETRY_INVALID_PAN = (
        "The card number provided did not pass the checksum verification. "
        "Please speak your 16-digit card number again clearly."
    )
    EXPIRY_REQUEST = (
        "Thank you. Please say the expiration month and year, for example December 2028."
    )
    CVV_REQUEST = (
        "Please say the 3-digit security code on the back of your card."
    )
    CONFIRMATION_TEMPLATE = (
        "I have recorded a {brand} card ending in {last4}, expiring in {expiry}. "
        "Is this correct? Say yes to confirm or no to correct."
    )
    PAYMENT_SUCCESS = (
        "Your payment details have been tokenized and verified. "
        "Returning you to the agent now."
    )
    PAYMENT_FAILED = (
        "Unable to complete payment verification. Reconnecting you with your agent."
    )


class ConversationalVoiceAgent:
    """
    Intelligent Conversational Dialogue Manager for PCI Safe Mode.
    Handles validation failures, customer queries, and in-flight corrections
    with natural, spoken voice prompts rather than static robotic phrases.
    """

    @staticmethod
    def generate_luhn_failure_prompt(brand: str, last4: str, attempt: int = 1) -> str:
        brand_label = brand if brand and brand != "Unknown" else "card"
        if attempt == 1:
            return (
                f"I received a {brand_label} number ending in {last4}, but the card checksum didn't match. "
                "Could you please double-check your card and say the 16 digits again clearly?"
            )
        elif attempt == 2:
            return (
                f"The card checksum for {brand_label} ending in {last4} still didn't verify. "
                "Please speak the 16 digits slowly in groups of four after the tone."
            )
        else:
            return (
                f"That card number still didn't pass verification. "
                "Please try speaking the full card number once more, or you may provide a different card."
            )

    @staticmethod
    def generate_incomplete_pan_prompt(digit_count: int, last4: str = "") -> str:
        suffix = f" ending in {last4}" if last4 else ""
        return (
            f"I only caught {digit_count} digits{suffix}. "
            "Card numbers are typically 16 digits. Please speak your full card number in groups of four after the tone."
        )

    @staticmethod
    def generate_expiry_failure_prompt(reason: str, raw_text: str = "") -> str:
        if not reason:
            return "Please state the expiration month and year again, for example December 2028."
        
        reason_lower = reason.lower()
        if "expired" in reason_lower:
            return (
                f"{reason} For your protection, we require an active card that has not expired. "
                "Please provide a valid card's expiration date."
            )
        elif "month" in reason_lower:
            return (
                f"{reason} Calendar months only go from 1 to 12. "
                "Please state your card's expiration month first, then the two-digit year, like 12 28."
            )
        elif "year" in reason_lower:
            return f"{reason} Please check your card and repeat the expiration date."
        else:
            return f"{reason} Please say the expiration month and year after the tone."

    @staticmethod
    def generate_cvv_failure_prompt(brand: str, digit_count: int = 0) -> str:
        if brand == "American Express":
            return (
                "For American Express, the security code is 4 digits on the front of the card. "
                "Please say those 4 digits after the tone."
            )
        else:
            brand_label = f"your {brand}" if brand and brand != "Unknown" else "your"
            return (
                f"For {brand_label} card, the security code is the 3-digit number printed on the signature strip on the back. "
                "Please say those 3 digits clearly."
            )

    @staticmethod
    def generate_pan_success_prompt(brand: str, last4: str) -> str:
        brand_label = brand if brand and brand != "Unknown" else "Card"
        return (
            f"Card verified: {brand_label} ending in {last4}. "
            "Please state your card's expiration month and year, for example 12 28."
        )

    @staticmethod
    def generate_confirmation_prompt(brand: str, last4: str, expiry: str) -> str:
        brand_label = brand if brand and brand != "Unknown" else "card"
        return (
            f"I have recorded a {brand_label} ending in {last4}, expiring in {expiry}. "
            "Is this correct? Say yes to confirm, or no to correct."
        )

    @staticmethod
    def generate_confusion_prompt() -> str:
        return (
            "This is VelatoAI's automated secure payment line. Your agent has been isolated "
            "and cannot hear this conversation. Please speak your 16-digit card number after the tone to proceed."
        )


conversational_voice_agent = ConversationalVoiceAgent()
