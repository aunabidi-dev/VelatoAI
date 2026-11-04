# VelatoAI: Autonomous Voice Payment Handover & PCI Isolation

> **Meta Global AI Developer Hackathon · Startup Track · Theme: Build for Your World · Vantiq Studio**  
> **Notice:** *Built with Muse Spark Open*

VelatoAI is a zero-trust audio intercept and agent-assist platform that allows contact-center agents to sell and support customers over voice calls without ever hearing, seeing, or recording credit card numbers. 

When payment is required, the human agent presses **PCI Safe Mode**. The agent's audio line is immediately severed at the media server, the call recording pauses with an automated withheld marker, and an automated AI voice agent intercepts the customer line to collect card credentials, perform instant Luhn validation, tokenize via a payment gateway vault, zeroize volatile memory buffers, and reconnect the call.

Alongside this, a **live copilot** powered by **Muse Spark Open on Baseten** listens to the non-payment conversation and suggests answers grounded in company documents retrieved via PostgreSQL full-text search.

---

## 🤖 Meta Models vs. Browser/OS Features Breakdown

In accordance with Section 6 & 16 of the product specification (*"Every model the product calls at runtime is a Meta model. Browser and operating system features, such as the built-in voice, are not model calls"*):

| Component / Pipeline | Type | Technology / Model | Role in VelatoAI |
| :--- | :--- | :--- | :--- |
| **Live Copilot Brain** | **Meta Model Call** | **Muse Spark Open on Baseten** | Reads conversation context and retrieved company documents to return structured agent suggestions. |
| **Speech-to-Text (Primary)** | **Meta Model Call** | **Muse Spark Open Audio Input** | Transcribes short customer speech clips into clean text streams. |
| **Speech-to-Text (Fallback)** | **Meta Model Call** | **Meta wav2vec 2.0** (`facebook/wav2vec2-base-960h`) | Self-hosted open-source backup STT inside client VPC for spoken digit recognition. |
| **Voice Agent Prompts (TTS)** | **Meta Model Call** | **Meta MMS Text-to-Speech** (`facebook/mms-tts-eng`) | Speaks automated payment instructions and the last-4/expiry confirmation read-back. |
| **Alternative Payment Brain** | **Meta Model Call** | **Muse Glimmer 30B on Modal** | Optional alternative model served via vLLM/SGLang for complex correction turns. |
| **Outside Provider Adapter** | **Meta Model Adapter** | **Meta Model API** | Optional outside adapter behind provider interface; controlled by `API_ACTIVE=false` (off by default). |
| **Voice Readback Fallback** | **Browser Feature** | **Web Speech API (`speechSynthesis`)** | Standard client browser audio capability used as local offline fallback; not an AI model call. |
| **PCI Recording Silence** | **Browser Feature** | **Web Audio API (`AudioContext`)** | Synthesizes verified zero-amplitude flatline silence during PCI Safe Mode gap verification. |
| **Checksum & Assembly** | **Deterministic Code** | **Luhn Mod-10 Algorithm** | Plain Python/JS algorithmic check validating digit sequences; zero AI involvement. |
| **Document Retrieval** | **Database Feature** | **PostgreSQL Full-Text Search (FTS)** | Built-in native token ranking and document search without vector database complexity. |

---

## 🏛️ Architecture Overview

The system strictly separates operations into two isolated planes:

```
                                  ┌───────────────────────────────┐
                                  │      Client Audio Stream      │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
                        ┌──────────────────────────────────────────────────┐
                        │          VelatoAI Media & Audio Router           │
                        └─────────┬───────────────────────────────┬────────┘
                                  │                               │
        [Normal Call Mode]        │                               │  [PCI Safe Mode Engaged]
        Both tracks active        │                               │  Agent severed / Recording marked
                                  ▼                               ▼
     ┌─────────────────────────────────────────┐    ┌─────────────────────────────────────────┐
     │         CONTROL PLANE (copilot-app)     │    │      DATA PLANE (payment-service)       │
     │  - Agent Desktop & CRM                  │    │  - Isolated VPC Container (No Outbound) │
     │  - Muse Spark Open Live Copilot         │    │  - Muse Spark Open Audio / wav2vec 2.0  │
     │  - Server-Enforced Call State           │    │  - Meta MMS Text-to-Speech Prompts      │
     │  - Append-Only Audit Trail (No Card Data│    │  - Pure Code Luhn (Mod 10) Check        │
     │  - Recording Gap & Marker Timeline      │    │  - In-Memory Zeroized Buffer (Zero SAD) │
     │  - PostgreSQL Full-Text Search (FTS)    │    │  - Gateway Mock Token Vault             │
     └─────────────────────────────────────────┘    └────────────────────┬────────────────────┘
                                                                         │
                                                                         ▼
                                                           Payment Gateway Tokenization
                                                        (Returns tok_pci_xxx, Last4, Brand)
```

---

## 🔒 10 Zero-Trust Compliance Decisions Built-In

1. **Card data is never stored:** Full PAN, expiry, and CVV are never written to disk, database, logs, transcripts, analytics, or error reporters.
2. **Audio severance:** During Safe Mode, the agent's receive/transmit audio channels are cut at the server level, not merely muted in the browser.
3. **Copilot blackout:** Transcription and copilot suggestion pipelines are strictly shut down for the entire duration of the payment turn.
4. **Volatile zeroization:** Memory buffers storing card numbers are explicitly zeroed out (`0x00`) immediately following tokenization.
5. **Recording gap:** Live recording is withheld during payment; an automated notice (`Payment details withheld`) and silence are inserted with a timeline marker (`PCI segment withheld, token ref tok_xxx`).
6. **Minimal readback confirmation:** The Voice Agent speaks back **ONLY** the card brand, last four digits, and expiry date.
7. **Append-only audit without data:** Logs token reference and lifecycle events with SHA-256 tamper-evident hash chaining; rejects raw card digits upfront.
8. **Automated leak testing:** Integrated scanner actively checks database, memory, and logs for Luhn-valid 13-19 digit card numbers on every build.
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

## 🧪 Automated Test Suite (147 Tests — 100% Green)

Run the full walking skeleton and zero-trust verification test suite:

```bash
python -m pytest tests/ -v
```

**Test Coverage Highlights:**
- `tests/test_meta_speech_stt.py`: Muse Spark Open audio input, Meta wav2vec 2.0 fallback, filler filtering, and spoken corrections.
- `tests/test_copilot_service.py`: Document CRUD, full-text token search, structured copilot suggestions, and blackout.
- `tests/test_provider_interface.py`: Muse Spark Open provider, Meta Model API adapter, and `API_ACTIVE=false` enforcement.
- `tests/test_live_copilot.py`: Admin document role gating (403 for agents) and real-time suggestion ingestion.
- `tests/test_phase4_proof.py`: Tamper-evident SHA-256 hash chaining, latency telemetry (<100ms cut), and recording export.
- `tests/test_recording_service.py`: Server-side recording state, PCI withheld silence gap, and timeline markers.
- `tests/test_leak_scanner.py`: Multi-store scanner (audit events, transcript chunks, recording metadata) confirming 0 leaks.
- `tests/test_state_timeouts.py`: Inactivity timeouts (30-60s) per capture state, per-field retry counters, auto-wipe.
- `tests/test_token_vault.py`: Mock PCI Payment Gateway tokenization, strict isolation from PAN.
- `tests/test_memory_wipe.py`: Buffer zeroization and automatic memory wiping upon exit.
- `tests/test_log_redaction.py`: Log redaction filter verifying Luhn-valid PAN masking across loggers.
- `tests/test_redaction_filter.py`: Copilot transcript redaction preventing early slips from reaching AI models.
- `tests/test_walking_skeleton.py`: End-to-end integration test of the complete Phase 1 walking skeleton.
