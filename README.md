# ZytaSafe: Zero-Trust PCI Voice Intercept & Live Support Copilot

> **Meta Global AI Developer Hackathon · Startup Track · Theme: Build for Your World**

ZytaSafe is a zero-trust audio intercept and agent-assist platform that allows contact-center agents to sell and support customers over voice calls without ever hearing, seeing, or recording credit card numbers. 

When payment is required, the human agent presses **PCI Safe Mode**. The agent's audio line is immediately severed at the media server, the call recording pauses with an automated withheld marker, and an automated AI voice agent intercepts the customer line to collect card credentials, perform instant Luhn validation, tokenize via a payment gateway vault, zeroize volatile memory buffers, and reconnect the call.

---

## 🏛️ Architecture Overview

The system strictly divides operations into two distinct planes:

```
                                  ┌───────────────────────────────┐
                                  │      Client Audio Stream      │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
                        ┌──────────────────────────────────────────────────┐
                        │          ZytaSafe Media & Audio Router           │
                        └─────────┬───────────────────────────────┬────────┘
                                  │                               │
        [Normal Call Mode]        │                               │  [PCI Safe Mode Engaged]
        Both tracks active        │                               │  Agent severed / Recording marked
                                  ▼                               ▼
     ┌─────────────────────────────────────────┐    ┌─────────────────────────────────────────┐
     │         CONTROL PLANE (copilot-app)     │    │      DATA PLANE (payment-service)       │
     │  - Agent Desktop & CRM                  │    │  - Isolated VPC Container               │
     │  - Meta Muse Spark Live Copilot         │    │  - Spoken Digit & Speech Parser         │
     │  - Server-Enforced Call State           │    │  - Pure Code Luhn (Mod 10) Check        │
     │  - Append-Only Audit Trail (No Card Data│    │  - In-Memory Zeroized Buffer (Zero SAD) │
     │  - Recording Gap & Marker Timeline      │    │  - Gateway Mock Token Vault             │
     └─────────────────────────────────────────┘    └────────────────────┬────────────────────┘
                                                                         │
                                                                         ▼
                                                           Payment Gateway Tokenization
                                                        (Returns tok_pci_xxx, Last4, Brand)
```

---

## 🔒 10 Zero-Trust Compliance Decisions Built-In

1. **Card data is never stored:** Full PAN, expiry, and CVV are never written to disk, database, logs, analytics, or error reporters.
2. **Audio severance:** During Safe Mode, the agent's receive/transmit audio channels are cut at the server level, not merely muted in the browser.
3. **Copilot blackout:** Transcription and copilot suggestion pipelines are strictly shut down for the entire duration of the payment turn.
4. **Volatile zeroization:** Memory buffers storing card numbers are explicitly zeroed out (`0x00`) immediately following tokenization.
5. **Recording gap:** Live recording is withheld during payment; an automated marker (`PCI segment withheld, token ref tok_xxx`) and silence are inserted.
6. **Minimal readback confirmation:** The Voice Agent speaks back **ONLY** the card brand, last four digits, and expiry date.
7. **Append-only audit without data:** Logs token reference and lifecycle events; rejects raw card digits.
8. **Automated leak testing:** Integrated scanner actively checks database, memory, and logs for Luhn-valid 13-19 digit card numbers.
9. **Test cards only:** Pre-configured for standard Luhn test card sequences (`4242 4242 4242 4242`).
10. **Scope reduction:** Cuts client PCI DSS contact-center compliance scope to SAQ-A levels.

---

## 🚀 Quickstart & Walking Skeleton Demo

### 1. Run with Docker Compose
```bash
docker-compose up --build
```
- Frontend UI: `http://localhost:3000`
- Control Plane API: `http://localhost:8000`
- Isolated Payment Service: `http://localhost:8001`

### 2. Run Locally for Development

**Terminal 1 — Payment Service (Data Plane):**
```bash
cd payment-service
pip install -r requirements.txt
python run.py
# Running on http://localhost:8001
```

**Terminal 2 — Copilot Backend (Control Plane):**
```bash
cd copilot-app/backend
pip install -r requirements.txt
python run.py
# Running on http://localhost:8000
```

**Terminal 3 — Frontend (Agent Desktop & Customer Caller):**
```bash
cd copilot-app/frontend
npm install
npm run dev
# Running on http://localhost:3000
```

---

## 🧪 Automated Test Suite

Run the full walking skeleton and zero-trust verification test suite:

```bash
python -m pytest tests/ -v
```

**Tests include:**
- `tests/test_luhn.py`: Luhn Mod 10 checksum, BIN brand detection (Visa, Mastercard, Amex, Discover), CVV and expiry validation.
- `tests/test_memory_wipe.py`: Buffer zeroization and automatic memory wiping upon exit.
- `tests/test_token_vault.py`: Mock PCI Payment Gateway tokenization, strict isolation from PAN.
- `tests/test_voice_agent.py`: Spoken numbers parsing, natural speech correction ("no last digit was two"), compound words.
- `tests/test_walking_skeleton.py`: End-to-end integration test of the complete Phase 1 lifecycle.
