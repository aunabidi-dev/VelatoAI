# Zero-Trust PCI Voice Intercept & Live Support Copilot

*Meta Global AI Developer Hackathon · Startup track · Theme: Build for Your World · Vantiq Studio*

## 1. The idea in brief

Contact-center agents should be able to sell and support customers without ever hearing or seeing a card number. We are building a software module that sits on the call. When payment is needed, the agent presses one button, **PCI Safe Mode**. The human steps out of the audio path and an AI voice agent takes over. It collects the card details by voice, validates them, reads back only the last four digits and the expiry, exchanges the details with a payment gateway for a token, and hands the call back. The human agent, the QA reviewer and the recording never contain the card number.

Alongside this, a **live copilot** listens to the rest of the conversation and suggests answers from the company’s own documents and scripts, so new agents get productive faster.

## 2. The problem

- **Insider card fraud.** Even with strict floor rules (no phones, clean desks), agents can memorise card numbers they hear and misuse them later. This idea started from a conversation with a friend who worked at a large BPO and saw exactly this risk.
- **Keypad masking is clumsy.** The common fix is asking customers to type digits on the keypad (DTMF). It is brittle, can break on VoIP and WebRTC sessions, and makes the call experience worse.
- **The recording dilemma.** Calls are recorded for quality assurance and disputes, but card numbers must not be stored. If the recording contains the digits, the leak simply moves from the agent to whoever reviews the recording.
- **Slow agent training.** New agents spend a long time learning products, policies and scripts before they handle calls confidently.

## 3. Who it is for

- **Buyers:** BPOs and sales or support contact centers that take payments by phone. The decision usually sits with security and compliance, and with operations heads.
- **Users:** agents (take calls), admins (upload company documents and scripts), and customers (pay safely by voice).
- **Where we start:** small and mid-sized BPOs for pilots, moving to larger ones later.

## 4. How it works

1. The customer and the agent talk normally. The copilot shows suggestions, policy references and next best actions on the agent’s screen.
2. The customer is ready to pay. The agent tells them they are being passed to a secure automated system and should wait for the beep before saying any card details. The agent presses **PCI Safe Mode**.
3. The agent’s line is isolated. The copilot stops listening and the recording pauses. Then a beep plays. The agent’s screen shows only “Payment in progress”.
4. An AI voice agent introduces itself as an automated system, says briefly that this is for the customer’s safety and that the details are not saved and not heard by the agent, and then asks for the card details, handles corrections and repeats, and checks the number with the Luhn algorithm.
5. It reads back only the last four digits and the expiry for the customer to confirm.
6. The details go straight to the payment gateway, which returns a token. The card data is then wiped.
7. Control returns to the human agent, who sees only the token reference and the last four digits.
8. The call recording keeps running for QA, with the payment segment withheld and a marker such as “PCI segment withheld, token ref tok\_xxx”.

## 5. Privacy and compliance rules we have decided

1. **Card data is never stored.** Card number, expiry and security code are not saved in any database, log, transcript, recording, analytics event or error report. They live in memory only for the seconds needed and are wiped after tokenization.
2. **The human never hears or sees it.** During Safe Mode the agent’s audio path is isolated, not just muted, and the screen shows no card details.
3. **QA reviewers are treated as insiders too.** The recording continues for business records, but the payment segment is withheld and marked on the timeline.
4. **The copilot goes blind in Safe Mode.** Transcription and suggestions stop for the whole payment segment.
5. **The card path calls no external AI service.** It runs on open models and self-hosted speech components. The only outbound call is to the payment gateway for the token. The payment service contains no code for any outside AI provider, and a test fails the build if one is added. The non-sensitive copilot runs on open-weight models by default and may use an outside provider only when a client switches it on.
6. **Minimal confirmation.** Only the last four digits and the expiry are ever spoken back or shown.
7. **Tokens, not keys.** In production the client uses their own payment gateway account and keys, and we never hold them.
8. **Audit without data.** Safe Mode events (start, end, success, failure, token reference) are logged, but never any card data.
9. **Test cards only** during the hackathon, never real card numbers.
10. **No false claims.** The design aims to reduce a client’s PCI scope. We do not claim certification. A formal assessment by a qualified assessor comes before any production use.

## 6. Models and how we use them

- **Whisper (open source) for copilot transcription:** live transcription of the non-payment conversation. Muse Spark Open’s audio input is tested as an alternative.
- **Optional outside provider for the copilot (Meta Model API or others):** an adapter behind a provider interface, off by default and switched on only by a setting. It lets a client with a stronger provider plug it in without changing the product. The payment service never uses it.
- **Muse Glimmer 30B (open-weight, Apache 2.0) on Modal:** runs the payment conversation, such as handling a correction like “no, the third digit was five”. Ordinary code assembles the digits and runs the Luhn check.
- **Muse Spark Open on Baseten:** the default copilot brain, which reads the transcript and relevant company documents and returns structured suggestions. It is also evaluated against Glimmer for card-capture accuracy and speed, and used there if it proves better. If used, the product shows the required “Built with Muse Spark Open” notice.
- **Open-source speech-to-text and text-to-speech in the card path:** we did not find a Meta text-to-speech model, so the voice output is third-party open source, and we say so openly.
- **Development tools:** an AI coding assistant during development, which is not part of the product.

The final model choice for the card path will be made after early accuracy and latency tests on spoken test-card numbers.

## 7. What is real and what is simulated in the hackathon

**Real:** model calls, voice capture of card details, the Luhn check, tokenization (through a mock token vault that mimics a payment gateway), the recording gap, and the live copilot.

**Simulated:** phone network (browser-based calls instead), the CRM (a small reference agent desktop with an admin role that uploads documents and scripts and an agent role that takes calls), and the client’s cloud (Modal and Baseten stand in for it).

## 8. How we will record the demo

The three-minute video follows one story:

- **Problem (about 20 seconds):** the insider risk and why keypad masking falls short.
- **Copilot (about 30 seconds):** a live call with real-time suggestions.
- **Safe Mode (about 70 seconds):** the agent screen goes dark, the AI collects a test card, reads back the last four, and the call returns with only a token.
- **Proof (about 40 seconds):** the recording timeline with its gap, a database and log search that finds no card data, and a view of what an attacker would capture.
- **Future (about 20 seconds):** the roadmap below.

We record with two browser windows (customer and agent), headphones to avoid echo, and test cards only. The repository starts clean on October 27, keeps readable commits, and the video states what was built during the hackathon. We record early, with time left for retakes.

## 9. Where this goes next

We are software vendors, not a CRM and not a payment processor. The product is a module that deploys inside the client’s own cloud (VPC), so card data stays within their environment. It plugs in at the call media layer of their contact-center platform, with thin adapters for CRM systems such as Salesforce that only ever receive a token and the last four digits. We begin with small BPO pilots, then pursue formal PCI assessment and larger clients. The copilot grows from company documents into a fuller agent-assist product, with payment handover as our main differentiator. The product runs fully on open-weight models by default, so it can deploy with no outside API. Clients that allow it can switch the copilot to a stronger outside provider, subject to that provider’s regional rules and the client’s own policy.

## 10. Architecture overview

Two parts, kept apart on purpose:

- **Control plane:** agent desktop, admin page, copilot, call state, and the API that talks to the CRM. The copilot reaches its model through a provider interface, with open-weight models by default. In production this can be vendor-hosted.
- **Data plane (payment service):** card audio, speech-to-text, the model, text-to-speech, the Luhn check and the gateway call. In production this runs inside the client’s VPC. It never shares card data with the control plane, which only receives a token, the last four digits and the card brand.

Every call moves through these states, in order:

1. **Normal:** both sides talk, the copilot is active, both audio tracks are recorded.
2. **Isolating:** the agent presses Safe Mode. The server pauses recording, stops the copilot stream and cuts the agent’s audio path. Only then does the next state begin.
3. **Capturing:** the AI voice agent joins as a separate participant and collects the card details.
4. **Confirming:** it reads back the last four digits and the expiry, and the customer confirms or corrects.
5. **Tokenizing:** the details go to the payment gateway and a token comes back.
6. **Wiping:** all card buffers are cleared, and the clearing is confirmed.
7. **Resuming:** recording and copilot restart, the agent rejoins and sees only the token reference and the last four digits.

Any failure, timeout or hang-up in states 2 to 6 jumps straight to Wiping.

**Recording design.** Both the customer and the agent are recorded in normal operation. A server-side recorder subscribes to both audio tracks and writes them into one continuous recording per call. When Safe Mode starts, the recorder stops writing the live audio and writes a short system-made notice, such as “Payment details withheld”, followed by silence, so the timing stays aligned. The card audio is never saved and then deleted; it is simply never written. When payment ends, the recorder returns to the live audio. The timeline also stores a marker such as “PCI segment withheld, token ref tok\_xxx”. Because the recorder is a server component, nothing in the agent’s browser can change it, and the AI’s own audio is never recorded.

## 11. Security features

1. **Server-enforced isolation.** The media server decides who can hear whom. In Safe Mode the agent’s subscription to the customer’s audio is removed on the server and the agent’s microphone is muted there, so the browser cannot override it.
2. **No listening in.** While Safe Mode is on, no other participant, such as a supervisor, can join or subscribe to the audio.
3. **Copilot blackout.** The transcription stream is closed and the suggestion API refuses requests for the whole payment segment. Before any transcript reaches a model, a filter masks anything that looks like a card number (Luhn-valid, 13 to 19 digits), so an early slip never travels to an outside provider.
4. **Memory-only card handling.** The payment service has no persistent volume, no swap use for card data, a read-only filesystem, and core dumps disabled. Buffers are overwritten after use. Payloads are never logged, and a redaction filter on all logs is a second line of defence.
5. **Encryption everywhere.** WebRTC media is encrypted by default. All service traffic uses TLS, and service-to-service calls use short-lived signed tokens. Recordings are encrypted at rest. Secrets come from environment or a secret store and never from the repository.
6. **Authentication and roles.** Login with admin and agent roles. Call access tokens are short-lived and limited to one room. Only admins can open recordings. (can add the QA role later)
7. **Audit without data.** An append-only audit table records Safe Mode start, end, success, failure and token reference, never any card data.
8. **Limited blast radius for the model.** The card-path model receives only text from the customer’s speech, a fixed instruction, and one function for submitting digits that code validates. It has no network access and cannot write storage. The copilot treats retrieved documents as data, never as instructions.
9. **Abuse limits.** A maximum of three capture attempts, a timeout on every state, and an automatic wipe when the customer hangs up.
10. **Leak testing.** An automated scanner looks for Luhn-valid 13 to 19 digit sequences in the database, logs, transcripts and recording metadata, and runs as a test on every build.
11. **Test cards only** during the hackathon.

## 12. Speed

- **Streaming everywhere.** The copilot is text only: live transcription feeds the model, and suggestions appear on the agent’s screen as they are generated. Only the payment voice agent speaks. Its speech-to-text, model and text-to-speech all stream, so it can start speaking before its full reply is ready.
- **Warm models.** Models are loaded before a session starts. The GPU stays warm only for testing and recording to protect credits.
- **Small prompts, low reasoning effort.** The copilot sends a rolling window of the conversation plus a few retrieved passages and asks for structured JSON.
- **Code for the exact work.** Digit assembly and the Luhn check are plain code, and the model only handles the conversation around them.
- **Natural turn-taking.** The platform’s speech-boundary detection decides when the customer has finished, and the payment voice agent stops speaking if the customer interrupts.
- **Targets, not promises.** We aim for an on-screen copilot suggestion within about one to two seconds of a sentence ending, and a payment voice-agent reply within about a second. We will measure both and report the real numbers.

## 13. Data handling

- **Card number, expiry, security code:** memory of the payment service only, for seconds, then wiped.
- **Token, last four digits, card brand:** PostgreSQL, linked to the call as a business record.
- **Call audio:** file storage, encrypted at rest, one file per call, readable by admin and QA roles only. The payment segment never exists.
- **Copilot transcripts:** PostgreSQL, non-payment speech only, with a configurable retention period.
- **Company documents and embeddings:** PostgreSQL with pgvector, managed by admins.
- **Audit events:** PostgreSQL, append-only.
- **Logs:** structured and redacted, with no payloads.
- **Outside AI providers:** off by default. When a client turns one on, only the redacted copilot transcript is sent, and that provider’s terms and data-use settings are checked for each client.

## 14. Tech stack

- **Calls and media:** LiveKit (open source), with separate tracks for customer, agent and the AI participant.
- **Backend:** Python with FastAPI.
- **Frontend:** React, Vite and Tailwind for the agent desktop, admin page and proof panel.
- **Database:** PostgreSQL with pgvector.
- **Copilot:** Whisper for transcription and Muse Spark Open on Baseten (or Glimmer) behind a provider interface. An optional adapter for outside providers, such as the Meta Model API, is off by default.
- **Payment service:** a separate container on Modal with Muse Glimmer 30B served through vLLM or SGLang, an open-source speech-to-text model and an open-source text-to-speech model.
- **Payments:** a mock token vault that behaves like a payment gateway’s tokenization call. A real gateway adapter, using the client’s own account, comes after the hackathon.
- **Packaging:** a public monorepo with copilot-app and payment-service folders and a docker-compose file.

## 15. Production rules we follow, and hackathon stand-ins

**We build to production rules now:** server-enforced controls, encrypted transport and storage, authentication and roles, audit log, log redaction, memory-only card handling, containers, least privilege, and automated leak tests.

**Hackathon stand-ins:** Modal and Baseten for the client’s own cloud, browser calls instead of telephony, a mock CRM, a mock token vault, third-party open-source speech models, a single tenant, and simplified secret management.

**Left for later because of our current limits:** real telephony, multi-tenant support, a key-management service, high availability, a penetration test, and a formal PCI assessment.

## 16. Phases of the sprint

After Phase 1 every phase is an iteration on a system that already works.

1. **Phase 0, feasibility:** repo, database and a two-sided call set up. Early tests on spoken test cards to choose the card-path model and the voice output, and a simple mock token vault. *Done when:* the card-path model is chosen.
2. **Phase 1, walking skeleton:** an ugly but complete flow: call, Safe Mode button, AI captures a test card, Luhn check, token, back to the agent. *Done when:* it works end to end once.
3. **Phase 2, zero-trust hardening:** server-enforced isolation, recording pause and resume with a withheld-payment notice and marker, copilot blackout, memory-only buffers, log redaction, leak scanner, retries, timeouts and hang-up wipe. *Done when:* the scanner finds nothing and the recording shows the gap.
4. **Phase 3, copilot:** admin document upload, retrieval, live transcription and structured suggestions, a provider interface with an off-by-default outside-provider adapter, a redaction filter on copilot input, and roles. *Done when:* suggestions appear live and stop during Safe Mode.
5. **Phase 4, proof and polish:** the “what the agent sees” and “what an attacker would capture” panels, the recording timeline player, the audit view, and latency tuning. *Done when:* the security story can be shown in under a minute.
6. **Phase 5, demo and submission:** script, rehearsals, recorded video, README, architecture diagram, clean public repo, submission form, and a post on X.
7. **Phase 6, buffer:** bug fixes only, no new features.

**If time runs short, cut in this order:** copilot extras, admin page polish, extra retry paths. We never cut Safe Mode, the recording gap or the proof panel.
