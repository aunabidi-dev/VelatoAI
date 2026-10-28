import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "payment-service")))

from app.core.secure_memory import SecureCardBuffer

def test_secure_buffer_zeroization():
    buf = SecureCardBuffer()
    buf.set_pan("4242424242424242")
    buf.set_cvv("123")
    buf.set_expiry("12/28")

    assert buf.get_pan_last4() == "4242"
    assert buf.get_pan_raw() == "4242424242424242"
    assert buf.get_cvv_raw() == "123"

    # Execute zeroization wipe
    confirmed = buf.wipe_all()
    assert confirmed is True
    assert buf.is_wiped is True
    assert buf.get_pan_raw() == ""
    assert buf.get_cvv_raw() == ""
    assert buf.get_expiry() == ""
    assert buf.get_pan_last4() == "XXXX"

def test_context_manager_auto_wipe():
    with SecureCardBuffer() as buf:
        buf.set_pan("5555555555554444")
        buf.set_cvv("999")
        assert buf.get_pan_last4() == "4444"
    
    # Must be zeroized on exit
    assert buf.is_wiped is True
    assert buf.get_pan_raw() == ""
