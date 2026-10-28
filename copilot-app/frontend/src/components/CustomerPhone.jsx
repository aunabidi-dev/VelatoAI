import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneCall, Volume2, Mic, MicOff, Check, RotateCcw, AlertTriangle, ShieldCheck, Sparkles, Send, Radio, Wrench } from 'lucide-react';
import { soundFx } from './AudioSynthesizer';

const WORD_MAP = {
  zero: '0', oh: '0', o: '0', nought: '0',
  one: '1', won: '1',
  two: '2', to: '2', too: '2',
  three: '3', tree: '3',
  four: '4', for: '4', fore: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8', ate: '8',
  nine: '9'
};

function formatSpokenToDigits(text) {
  if (!text) return '';
  const tokens = text.toLowerCase().replace(/[-,\.]/g, ' ').split(/\s+/);
  let res = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'double' && i + 1 < tokens.length) {
      const next = tokens[i + 1];
      const digit = WORD_MAP[next] || (next.match(/^\d$/) ? next : '');
      if (digit) {
        res += digit.repeat(2);
        i++;
        continue;
      }
    }
    if (t === 'triple' && i + 1 < tokens.length) {
      const next = tokens[i + 1];
      const digit = WORD_MAP[next] || (next.match(/^\d$/) ? next : '');
      if (digit) {
        res += digit.repeat(3);
        i++;
        continue;
      }
    }
    if (WORD_MAP[t]) {
      res += WORD_MAP[t];
    } else if (/^\d+$/.test(t)) {
      res += t;
    }
  }
  return res || text;
}

function parseExpiryInput(text) {
  if (!text) return '';
  const clean = text.toLowerCase().trim();

  // Pattern like "09/28", "9/28", "09-28", "9-28", "09 28", "9 28"
  const matchSlash = clean.match(/^(0?[1-9]|1[0-2])[\/\-\s]+(20)?(\d{2})$/);
  if (matchSlash) {
    const m = matchSlash[1].padStart(2, '0');
    const y = matchSlash[3];
    return `${m}/${y}`;
  }

  // Month names
  const months = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07',
    aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  for (const [mName, mNum] of Object.entries(months)) {
    if (clean.includes(mName)) {
      const yearMatch = clean.match(/\b(20)?(2[4-9]|3[0-9])\b/);
      if (yearMatch) {
        return `${mNum}/${yearMatch[2]}`;
      }
      return `${mNum}/28`;
    }
  }

  // Spoken month word numbers (e.g. "zero nine twenty eight", "nine twenty eight", "twelve twenty eight")
  const wordNums = {
    "zero one": '01', "zero two": '02', "zero three": '03', "zero four": '04', "zero five": '05',
    "zero six": '06', "zero seven": '07', "zero eight": '08', "zero nine": '09',
    "oh one": '01', "oh two": '02', "oh three": '03', "oh four": '04', "oh five": '05',
    "oh six": '06', "oh seven": '07', "oh eight": '08', "oh nine": '09',
    one: '01', two: '02', three: '03', four: '04', five: '05',
    six: '06', seven: '07', eight: '08', nine: '09', ten: '10',
    eleven: '11', twelve: '12'
  };

  for (const [wName, wNum] of Object.entries(wordNums)) {
    if (clean.startsWith(wName)) {
      const yearMatch = clean.match(/\b(20)?(2[4-9]|3[0-9])\b/);
      if (yearMatch) {
        return `${wNum}/${yearMatch[2]}`;
      }
      if (clean.includes("twenty eight") || clean.includes("28")) return `${wNum}/28`;
      if (clean.includes("twenty nine") || clean.includes("29")) return `${wNum}/29`;
      if (clean.includes("thirty") || clean.includes("30")) return `${wNum}/30`;
      return `${wNum}/28`;
    }
  }

  // Raw digits (e.g. "0928" -> "09/28", "928" -> "09/28", "1228" -> "12/28")
  const digits = clean.replace(/\D/g, '');
  if (digits.length === 4) {
    const m = digits.slice(0, 2);
    const y = digits.slice(2);
    if (parseInt(m, 10) >= 1 && parseInt(m, 10) <= 12) {
      return `${m}/${y}`;
    }
  }
  if (digits.length === 3) {
    const m = digits.slice(0, 1).padStart(2, '0');
    const y = digits.slice(1);
    if (parseInt(m, 10) >= 1 && parseInt(m, 10) <= 12) {
      return `${m}/${y}`;
    }
  }
  if (digits.length === 2) {
    return `12/${digits}`;
  }

  return clean;
}

function checkLuhn(card) {
  const clean = (card || '').replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let d = parseInt(clean.charAt(i), 10);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export default function CustomerPhone({
  safeModeActive,
  paymentSessionData,
  onSendPan,
  onSendExpiry,
  onSendCvv,
  onConfirmPayment,
  paymentCompleted
}) {
  const [customInput, setCustomInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const autoSubmitTimerRef = useRef(null);

  // Text-to-Speech (TTS) voice agent reader
  useEffect(() => {
    if (safeModeActive && paymentSessionData?.prompt && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(paymentSessionData.prompt);
      utterance.rate = 1.02;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }, [paymentSessionData?.prompt, safeModeActive]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
    };
  }, []);

  // Web Speech API Continuous Microphone listener
  const toggleMicrophone = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Microphone Speech Recognition is not supported by this browser. Please use Chrome or Edge, or type in the box.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    // Reset input on fresh voice session
    setCustomInput('');

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (e) => {
        console.warn("Speech recognition error:", e.error);
        setIsListening(false);
      };

      recognition.onresult = (event) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript + ' ';
        }
        const trimmed = fullTranscript.trim();

        if (paymentSessionData?.state === "CAPTURING_PAN") {
          const formatted = formatSpokenToDigits(trimmed);
          const digitsOnly = formatted.replace(/\D/g, '');
          setCustomInput(formatted);

          if (digitsOnly.length >= 16) {
            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
            autoSubmitTimerRef.current = setTimeout(() => {
              // Submit user's exact spoken digits without altering them!
              handleCustomSubmit(digitsOnly);
              if (recognitionRef.current) recognitionRef.current.stop();
            }, 600);
          }
        } else if (paymentSessionData?.state === "CAPTURING_EXPIRY") {
          const parsed = parseExpiryInput(trimmed);
          // Immediately format as MM/YY (e.g. 09/28) in the input box so it never stays as raw 0928
          setCustomInput(parsed && parsed.includes('/') ? parsed : trimmed);

          if (parsed && parsed.includes('/')) {
            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
            autoSubmitTimerRef.current = setTimeout(() => {
              handleCustomSubmit(parsed);
              if (recognitionRef.current) recognitionRef.current.stop();
            }, 700);
          }
        } else if (paymentSessionData?.state === "CAPTURING_CVV") {
          const formatted = formatSpokenToDigits(trimmed);
          const cvvDigits = formatted.replace(/\D/g, '');
          setCustomInput(cvvDigits);
          if (cvvDigits.length >= 3) {
            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
            autoSubmitTimerRef.current = setTimeout(() => {
              handleCustomSubmit(cvvDigits.slice(0, 4));
              if (recognitionRef.current) recognitionRef.current.stop();
            }, 600);
          }
        } else if (paymentSessionData?.state === "CONFIRMING") {
          if (trimmed.toLowerCase().includes('yes') || trimmed.toLowerCase().includes('confirm')) {
            onConfirmPayment(true);
            if (recognitionRef.current) recognitionRef.current.stop();
          }
        }
      };

      recognition.start();
    } catch (e) {
      console.error("Speech recognition start failed", e);
      setIsListening(false);
    }
  };

  const handleCustomSubmit = (overrideText = null) => {
    const textToSend = overrideText || customInput;
    if (!textToSend.trim()) return;

    if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    if (paymentSessionData?.state === "CAPTURING_PAN") {
      const digitsOnly = textToSend.replace(/\D/g, '');
      onSendPan(digitsOnly);
    } else if (paymentSessionData?.state === "CAPTURING_EXPIRY") {
      const parsedExp = parseExpiryInput(textToSend);
      onSendExpiry(parsedExp);
    } else if (paymentSessionData?.state === "CAPTURING_CVV") {
      const cvvDigits = textToSend.replace(/\D/g, '');
      onSendCvv(cvvDigits || textToSend);
    }
    setCustomInput('');
  };

  const cleanDigits = customInput.replace(/\D/g, '');
  const cleanDigitsCount = cleanDigits.length;
  const isLuhnValid = cleanDigitsCount >= 13 && checkLuhn(cleanDigits);

  return (
    <div className="w-full max-w-md mx-auto glass-panel p-6 border-slate-800 flex flex-col gap-5 relative">
      {/* Phone Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${safeModeActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            <PhoneCall className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-100">
              {safeModeActive ? "ZytaSafe Automated Pay" : "Call with Support"}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {safeModeActive ? "Voice AI Isolated Data Plane" : "Connected to Agent Alice"}
            </div>
          </div>
        </div>
        <span className="text-[10px] font-mono bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400">
          Caller: Jane Doe
        </span>
      </div>

      {/* Voice Visualizer */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-1.5 h-8">
          <div className={`wave-bar ${isListening ? 'bg-rose-400' : 'bg-cyan-400'}`} style={{ animationDelay: '0.1s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-400' : 'bg-cyan-400'}`} style={{ animationDelay: '0.3s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-400' : 'bg-cyan-400'}`} style={{ animationDelay: '0.2s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-400' : 'bg-cyan-400'}`} style={{ animationDelay: '0.4s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-400' : 'bg-cyan-400'}`} style={{ animationDelay: '0.15s' }}></div>
        </div>
        <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
          {isListening ? (
            <span className="text-rose-400 font-semibold animate-pulse">Microphone Active • Listening...</span>
          ) : safeModeActive ? (
            "AI Voice Agent Active (Audio Isolated)"
          ) : (
            "Agent Voice Active"
          )}
        </span>
      </div>

      {/* Safe Mode Voice Dialogue Panel */}
      {safeModeActive && (
        <div className="flex flex-col gap-4">
          {/* AI Voice Prompt Dialogue Bubble */}
          <div className="bg-cyan-950/40 border border-cyan-500/30 p-3.5 rounded-xl text-xs text-cyan-100 leading-relaxed shadow-lg flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-cyan-300 block mb-1">Automated Voice Agent:</span>
              <p>{paymentSessionData?.prompt || "Please speak your 16-digit card number after the tone."}</p>
            </div>
          </div>

          {/* Captured Card Metadata Badge (Strictly Last 4 only) */}
          {paymentSessionData?.last4 && (
            <div className="bg-slate-900/90 border border-emerald-500/30 p-2.5 rounded-lg text-xs font-mono flex items-center justify-between">
              <span className="text-slate-400">Verified Card:</span>
              <span className="text-emerald-400 font-bold">
                {paymentSessionData.brand || "Card"} ending in **** {paymentSessionData.last4}
              </span>
            </div>
          )}

          {/* PROMINENT SPEAK BUTTON & INPUT CONTROLS */}
          {paymentSessionData?.state !== "CONFIRMING" && paymentSessionData?.state !== "COMPLETED" && (
            <div className="flex flex-col gap-2.5 bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-300 font-bold flex items-center gap-1.5">
                  <Radio className={`w-3.5 h-3.5 ${isListening ? 'text-rose-400 animate-ping' : 'text-cyan-400'}`} />
                  Live Voice Microphone:
                </span>
                {cleanDigitsCount > 0 && paymentSessionData?.state === "CAPTURING_PAN" && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-cyan-950 text-cyan-300">
                    {cleanDigitsCount} Digits Heard
                  </span>
                )}
              </div>

              {/* Big Speech Toggle Button */}
              <button
                type="button"
                onClick={toggleMicrophone}
                className={`w-full py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
                  isListening
                    ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse border border-rose-400'
                    : 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white border border-cyan-400/30'
                }`}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>Listening... Speak now</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>
                      {paymentSessionData?.state === "CAPTURING_PAN"
                        ? "Click to Speak Card Number"
                        : paymentSessionData?.state === "CAPTURING_EXPIRY"
                        ? "Click to Speak Expiry (e.g. December 2028)"
                        : "Click to Speak CVV (e.g. 1 2 3)"}
                    </span>
                  </>
                )}
              </button>

              {/* Live Transcript / Manual Input Bar */}
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                  placeholder={
                    paymentSessionData?.state === "CAPTURING_PAN"
                      ? "Speak or type 16-digit card..."
                      : paymentSessionData?.state === "CAPTURING_EXPIRY"
                      ? "Say or type: December 2028 or 12/28..."
                      : "Say or type: 1 2 3..."
                  }
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                />

                <button
                  type="button"
                  onClick={() => handleCustomSubmit()}
                  disabled={!customInput.trim()}
                  className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold px-3 py-2 rounded-lg text-xs flex items-center gap-1 transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick-Action Presets for Fast Testing */}
          {paymentSessionData?.state === "CAPTURING_PAN" && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase">
                Or Click Quick Test Card:
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  onClick={() => onSendPan("4000 1234 5678 0987")}
                  className="bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 p-2 rounded-lg text-xs font-mono text-cyan-200 text-left flex items-center justify-between transition-all"
                >
                  <span>🗣️ Custom Card (ends in 0987)</span>
                  <span className="text-[10px] text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded font-bold">Spoken Target</span>
                </button>

                <button
                  onClick={() => onSendPan("4242 4242 4242 4242")}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs font-mono text-cyan-300 text-left flex items-center justify-between transition-all"
                >
                  <span>🗣️ Visa Test (ends in 4242)</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded">Standard Test</span>
                </button>

                <button
                  onClick={() => onSendPan("5555 5555 5555 4444")}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs font-mono text-cyan-300 text-left flex items-center justify-between transition-all"
                >
                  <span>🗣️ Mastercard (ends in 4444)</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded">Standard Test</span>
                </button>
              </div>
            </div>
          )}

          {/* Expiry Input Presets */}
          {paymentSessionData?.state === "CAPTURING_EXPIRY" && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase">
                Quick Expiry Options:
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onSendExpiry("09/28")}
                  className="bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 p-2.5 rounded-lg text-xs font-mono text-cyan-200 text-center font-bold"
                >
                  🗣️ "09 / 28"
                </button>
                <button
                  onClick={() => onSendExpiry("12/28")}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs font-mono text-cyan-300 text-center font-bold"
                >
                  🗣️ "12 / 28"
                </button>
                <button
                  onClick={() => onSendExpiry("05/30")}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs font-mono text-cyan-300 text-center font-bold"
                >
                  🗣️ "05 / 30"
                </button>
              </div>
            </div>
          )}

          {/* CVV Input Presets */}
          {paymentSessionData?.state === "CAPTURING_CVV" && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase">
                Quick Security Code (CVV):
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onSendCvv("123")}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs font-mono text-cyan-300 text-center font-bold"
                >
                  🗣️ "1 2 3"
                </button>
                <button
                  onClick={() => onSendCvv("888")}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs font-mono text-cyan-300 text-center font-bold"
                >
                  🗣️ "8 8 8"
                </button>
              </div>
            </div>
          )}

          {/* Confirmation Step - Reads back ONLY last 4 digits */}
          {paymentSessionData?.state === "CONFIRMING" && (
            <div className="flex flex-col gap-3">
              <div className="bg-amber-950/30 border border-amber-500/40 p-3 rounded-lg text-xs text-amber-200">
                🔒 Zero-Trust Confirmation: The AI speaks and shows <strong>ONLY</strong> the last 4 digits ({paymentSessionData?.last4 || "----"}) and expiry ({paymentSessionData?.expiry || "--/--"}).
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    soundFx.playTokenSuccessChime();
                    onConfirmPayment(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold p-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-950/50"
                >
                  <Check className="w-4 h-4" />
                  <span>"Yes, Confirm"</span>
                </button>
                <button
                  onClick={() => onConfirmPayment(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium p-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>"No, Change"</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completed State */}
      {paymentCompleted && (
        <div className="bg-emerald-950/30 border border-emerald-500/40 p-4 rounded-xl flex flex-col items-center justify-center text-center gap-2">
          <ShieldCheck className="w-8 h-8 text-emerald-400" />
          <div className="text-sm font-bold text-emerald-300">Payment Processed Safely</div>
          <p className="text-xs text-emerald-400/80">
            Card details tokenized and memory wiped. Reconnected with human agent.
          </p>
        </div>
      )}
    </div>
  );
}
