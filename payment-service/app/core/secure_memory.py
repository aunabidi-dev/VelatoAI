"""
Zero-Trust Secure Memory Management
Guarantees sensitive PAN, CVV, and card buffers are zeroized upon completion or failure.
"""
import ctypes
import sys
from typing import Optional

class SecureCardBuffer:
    """
    Manages in-memory byte arrays for card data.
    Provides explicit overwrite/zeroization to comply with zero-trust PCI requirements.
    """
    def __init__(self):
        self._pan_buffer: Optional[bytearray] = None
        self._cvv_buffer: Optional[bytearray] = None
        self._expiry_buffer: Optional[bytearray] = None
        self._is_wiped = False

    def set_pan(self, pan_digits: str) -> None:
        """Store PAN as mutable bytearray."""
        self.wipe_pan()
        self._pan_buffer = bytearray(pan_digits.encode('ascii'))
        self._is_wiped = False

    def get_pan_last4(self) -> str:
        """Safely extract only the last 4 digits without leaking the rest of the PAN."""
        if not self._pan_buffer or len(self._pan_buffer) < 4:
            return "XXXX"
        return self._pan_buffer[-4:].decode('ascii')

    def get_pan_raw(self) -> str:
        """
        Temporary access for tokenization call only.
        Caller must immediately wipe afterward.
        """
        if not self._pan_buffer:
            return ""
        return self._pan_buffer.decode('ascii')

    def set_cvv(self, cvv: str) -> None:
        self.wipe_cvv()
        self._cvv_buffer = bytearray(cvv.encode('ascii'))

    def get_cvv_raw(self) -> str:
        if not self._cvv_buffer:
            return ""
        return self._cvv_buffer.decode('ascii')

    def set_expiry(self, expiry: str) -> None:
        self.wipe_expiry()
        self._expiry_buffer = bytearray(expiry.encode('ascii'))

    def get_expiry(self) -> str:
        if not self._expiry_buffer:
            return ""
        return self._expiry_buffer.decode('ascii')

    def wipe_pan(self) -> None:
        """Overwrites PAN memory buffer with zeros."""
        if self._pan_buffer is not None:
            for i in range(len(self._pan_buffer)):
                self._pan_buffer[i] = 0
            self._pan_buffer = None

    def wipe_cvv(self) -> None:
        """Overwrites CVV memory buffer with zeros."""
        if self._cvv_buffer is not None:
            for i in range(len(self._cvv_buffer)):
                self._cvv_buffer[i] = 0
            self._cvv_buffer = None

    def wipe_expiry(self) -> None:
        """Overwrites expiry memory buffer with zeros."""
        if self._expiry_buffer is not None:
            for i in range(len(self._expiry_buffer)):
                self._expiry_buffer[i] = 0
            self._expiry_buffer = None

    def wipe_all(self) -> bool:
        """
        Zeroizes all cardholder buffers.
        Returns True confirming all buffers are cleared.
        """
        self.wipe_pan()
        self.wipe_cvv()
        self.wipe_expiry()
        self._is_wiped = True
        return True

    @property
    def is_wiped(self) -> bool:
        return self._is_wiped

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.wipe_all()
