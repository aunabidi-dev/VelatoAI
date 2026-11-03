import React, { useState, useEffect, useRef } from 'react';
import {
  Phone, PhoneCall, Volume2, Mic, MicOff, Check, RotateCcw,
  AlertTriangle, ShieldCheck, Sparkles, Send, Radio, Wrench, Bell,
  PhoneOff, Tag, FileText, Lock
} from 'lucide-react';
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
  nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
  fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19'
};

const TENS_MAP = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

const ONES_VAL = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9
};

function formatSpokenToDigits(text) {
  if (!text) return '';
  const cleanText = text.toLowerCase().replace(/[-,\.]/g, ' ');
  const tokens = cleanText.split(/\s+/).filter(Boolean);
  let res = '';
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];

    // Multipliers: double / triple
    if ((t === 'double' || t === 'triple') && i + 1 < tokens.length) {
      const mult = t === 'double' ? 2 : 3;
      const next = tokens[i + 1];
      const digit = WORD_MAP[next] || (next.match(/^\d$/) ? next : '');
      if (digit) {
        res += digit[0].repeat(mult);
        i += 2;
        continue;
      }
    }

    // Compound numbers: "forty two" -> 42
    if (TENS_MAP[t]) {
      if (i + 1 < tokens.length && ONES_VAL[tokens[i + 1]]) {
        res += String(TENS_MAP[t] + ONES_VAL[tokens[i + 1]]);
        i += 2;
        continue;
      } else {
        res += String(TENS_MAP[t]);
        i += 1;
        continue;
      }
    }

    if (WORD_MAP[t]) {
      res += WORD_MAP[t];
    } else if (/^\d+$/.test(t)) {
      res += t;
    } else {
      const match = t.match(/\d/g);
      if (match) res += match.join('');
    }
    i++;
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
  paymentCompleted,
  isCustomerWindow = false,
  isCallActive = false,
  callStatus = 'IDLE',
  onInitiateCall,
  onHangupCall,
  onSendCustomerSpeech,
}) {
  const [customInput, setCustomInput] = useState('');
  const [normalSpeechInput, setNormalSpeechInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const recognitionRef = useRef(null);
  const autoSubmitTimerRef = useRef(null);
  const sessionRef = useRef(paymentSessionData);
  const shouldListenRef = useRef(false);
  const speechUtteranceRef = useRef(null);
  const ttsFallbackTimerRef = useRef(null);

  useEffect(() => {
    sessionRef.current = paymentSessionData;
  }, [paymentSessionData]);

  // Inter-window call event listener for customer phone
  useEffect(() => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return;
    const channel = new BroadcastChannel('zytasafe_call_mesh');

    channel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === 'CALL_ACCEPTED') {
        setIsCalling(false);
        soundFx.stopOutgoingRing();
      } else if (msg.type === 'CALL_DECLINED' || msg.type === 'CALL_DECLINE') {
        setIsCalling(false);
        soundFx.stopOutgoingRing();
      } else if (msg.type === 'CALL_HANGUP' || msg.type === 'CALL_ENDED') {
        setIsCalling(false);
        soundFx.stopOutgoingRing();
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  // Sync calling state when call becomes active, ends, or is declined
  useEffect(() => {
    if (isCallActive) {
      setIsCalling(false);
      soundFx.stopOutgoingRing();
    } else if (callStatus === 'DECLINED' || callStatus === 'ENDED') {
      setIsCalling(false);
      soundFx.stopOutgoingRing();
    }
  }, [isCallActive, callStatus]);

  // Clean state whenever payment state transitions
  useEffect(() => {
    setCustomInput('');
    shouldListenRef.current = false;
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      try { recognitionRef.current.abort(); } catch (e) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, [paymentSessionData?.state]);

  // Play transition tone on Safe Mode engagement
  useEffect(() => {
    if (safeModeActive) {
      soundFx.playSafeModeBeep();
    }
  }, [safeModeActive]);

  // Clean up speech recognition & timers on unmount
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (ttsFallbackTimerRef.current) {
        clearTimeout(ttsFallbackTimerRef.current);
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
    };
  }, []);

  // Text-to-Speech voice agent reader during Safe Mode: AI completes sentence, THEN tone plays, THEN mic listens
  useEffect(() => {
    if (safeModeActive && paymentSessionData?.prompt) {
      if (ttsFallbackTimerRef.current) {
        clearTimeout(ttsFallbackTimerRef.current);
      }

      // Ensure microphone does NOT listen while AI is speaking
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      setIsListening(false);
      setIsAiSpeaking(true);

      const triggerToneAndListening = () => {
        setIsAiSpeaking(false);
        // Play the audible prompt beep 250ms AFTER AI voice finishes
        setTimeout(() => {
          soundFx.playPromptTone();
          // Start microphone 350ms after beep finishes so microphone never captures the beep itself
          setTimeout(() => {
            if (sessionRef.current?.state !== "COMPLETED") {
              startRecognition();
            }
          }, 350);
        }, 250);
      };

      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();

          const utterance = new SpeechSynthesisUtterance(paymentSessionData.prompt);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          speechUtteranceRef.current = utterance; // Prevent Chromium GC freeze

          // Fallback timer: only trigger if TTS genuinely freezes for >8s
          ttsFallbackTimerRef.current = setTimeout(() => {
            triggerToneAndListening();
          }, 8000);

          utterance.onstart = () => {
            setIsAiSpeaking(true);
            setIsListening(false);
          };

          utterance.onend = () => {
            if (ttsFallbackTimerRef.current) clearTimeout(ttsFallbackTimerRef.current);
            triggerToneAndListening();
          };

          utterance.onerror = (e) => {
            if (e && (e.error === 'interrupted' || e.error === 'canceled')) {
              return;
            }
            if (ttsFallbackTimerRef.current) clearTimeout(ttsFallbackTimerRef.current);
            triggerToneAndListening();
          };

          window.speechSynthesis.speak(utterance);
        } catch (e) {
          triggerToneAndListening();
        }
      } else {
        triggerToneAndListening();
      }
    }
  }, [paymentSessionData?.prompt, safeModeActive]);

  const startRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[STT] SpeechRecognition not available in this browser");
      return;
    }

    shouldListenRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

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
        if (shouldListenRef.current && sessionRef.current?.state !== "COMPLETED") {
          setTimeout(() => {
            if (shouldListenRef.current && sessionRef.current?.state !== "COMPLETED") {
              try {
                recognition.start();
              } catch (e) {}
            }
          }, 150);
        } else {
          setIsListening(false);
        }
      };

      recognition.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          shouldListenRef.current = false;
          setIsListening(false);
        }
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + ' ';
        }
        const trimmed = transcript.trim();
        const currentState = sessionRef.current?.state;

        if (currentState === "CAPTURING_PAN") {
          const formatted = formatSpokenToDigits(trimmed);
          const digitsOnly = formatted.replace(/\D/g, '');
          setCustomInput(formatted);

          if (digitsOnly.length >= 16) {
            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
            autoSubmitTimerRef.current = setTimeout(() => {
              shouldListenRef.current = false;
              if (recognitionRef.current) {
                recognitionRef.current.onresult = null;
                try { recognitionRef.current.abort(); } catch (e) {}
                recognitionRef.current = null;
              }
              handleCustomSubmit(digitsOnly.slice(0, 16));
            }, 600);
          }
        } else if (currentState === "CAPTURING_EXPIRY") {
          const parsed = parseExpiryInput(trimmed);
          setCustomInput(parsed && parsed.includes('/') ? parsed : trimmed);

          if (parsed && parsed.includes('/')) {
            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
            autoSubmitTimerRef.current = setTimeout(() => {
              shouldListenRef.current = false;
              if (recognitionRef.current) {
                recognitionRef.current.onresult = null;
                try { recognitionRef.current.abort(); } catch (e) {}
                recognitionRef.current = null;
              }
              handleCustomSubmit(parsed);
            }, 600);
          }
        } else if (currentState === "CAPTURING_CVV") {
          const formatted = formatSpokenToDigits(trimmed);
          const cvvDigits = formatted.replace(/\D/g, '');
          setCustomInput(cvvDigits);

          const expectedLen = sessionRef.current?.brand === "American Express" ? 4 : 3;
          if (cvvDigits.length === expectedLen) {
            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
            autoSubmitTimerRef.current = setTimeout(() => {
              shouldListenRef.current = false;
              if (recognitionRef.current) {
                recognitionRef.current.onresult = null;
                try { recognitionRef.current.abort(); } catch (e) {}
                recognitionRef.current = null;
              }
              handleCustomSubmit(cvvDigits);
            }, 500);
          }
        } else if (currentState === "CONFIRMING") {
          setCustomInput(trimmed);
          const isYes = /\b(yes|yeah|yep|confirm|confirmed|correct|sure|right|ok|okay|sounds good|it is|affirmative)\b/i.test(trimmed);
          const isNo = /\b(no|nope|wrong|incorrect|cancel|restart|stop)\b/i.test(trimmed);

          if (isYes) {
            shouldListenRef.current = false;
            if (recognitionRef.current) {
              recognitionRef.current.onresult = null;
              try { recognitionRef.current.abort(); } catch (e) {}
              recognitionRef.current = null;
            }
            setIsListening(false);
            soundFx.playTokenSuccessChime();
            onConfirmPayment(true);
          } else if (isNo) {
            shouldListenRef.current = false;
            if (recognitionRef.current) {
              recognitionRef.current.onresult = null;
              try { recognitionRef.current.abort(); } catch (e) {}
              recognitionRef.current = null;
            }
            setIsListening(false);
            onConfirmPayment(false);
          }
        }
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  const toggleMicrophone = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Microphone Speech Recognition is not supported by this browser. Please use Chrome/Edge or type directly.");
      return;
    }

    if (isListening) {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      setIsListening(false);
      return;
    }

    setCustomInput('');
    startRecognition();
  };

  const handleCustomSubmit = (overrideText = null) => {
    const textToSend = overrideText || customInput;
    if (!textToSend.trim()) return;

    shouldListenRef.current = false;
    if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      setIsListening(false);
    }

    const currentState = sessionRef.current?.state;

    if (currentState === "CAPTURING_PAN") {
      const digitsOnly = textToSend.replace(/\D/g, '');
      onSendPan(digitsOnly);
    } else if (currentState === "CAPTURING_EXPIRY") {
      const parsedExp = parseExpiryInput(textToSend);
      onSendExpiry(parsedExp);
    } else if (currentState === "CAPTURING_CVV") {
      const cvvDigits = textToSend.replace(/\D/g, '');
      onSendCvv(cvvDigits || textToSend);
    } else if (currentState === "CONFIRMING") {
      const isYes = /\b(yes|yeah|yep|confirm|confirmed|correct|sure|right|ok|okay|affirmative)\b/i.test(textToSend);
      const isNo = /\b(no|nope|wrong|incorrect|cancel|restart)\b/i.test(textToSend);
      if (isYes) {
        soundFx.playTokenSuccessChime();
        onConfirmPayment(true);
      } else if (isNo) {
        onConfirmPayment(false);
      } else {
        soundFx.playTokenSuccessChime();
        onConfirmPayment(true);
      }
    }
    setCustomInput('');
  };

  const handleCallSupport = () => {
    setIsCalling(true);
    soundFx.playOutgoingRing();
    if (onInitiateCall) {
      onInitiateCall();
    }
  };

  const handleHangup = () => {
    setIsCalling(false);
    soundFx.stopOutgoingRing();
    if (onHangupCall) {
      onHangupCall();
    }
  };

  const handleSendPromptTurn = (phrase) => {
    if (onSendCustomerSpeech) {
      onSendCustomerSpeech(phrase);
    }
  };

  const cleanDigits = customInput.replace(/\D/g, '');
  const cleanDigitsCount = cleanDigits.length;

  return (
    <div className={`w-full max-w-md mx-auto bg-[#0E1614] border border-[#1A2824] rounded-2xl p-6 flex flex-col gap-5 relative text-[#EDF3F0] ${isCustomerWindow ? 'min-h-screen justify-center' : ''}`}>
      {/* Phone Header */}
      <div className="flex items-center justify-between border-b border-[#1A2824] pb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${
            safeModeActive
              ? 'bg-[#1C1417] text-rose-400 border border-rose-500/30'
              : isCallActive
              ? 'bg-[#0B261B] text-[#00E676] border border-[#165038]'
              : 'bg-[#131E1B] text-[#768782] border border-[#1A2824]'
          }`}>
            <PhoneCall className={`w-5 h-5 ${isCallActive ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="text-sm font-bold text-[#EDF3F0]">
              {safeModeActive ? "ZytaSafe Automated Pay" : isCallActive ? "Live Call Active" : "ZytaSafe Customer Caller"}
            </div>
            <div className="text-[11px] text-[#768782] font-mono">
              {safeModeActive
                ? "Voice AI Isolated Data Plane (MMS / Browser Native)"
                : isCallActive
                ? "Connected to Agent Alice"
                : "Caller: Jane Doe • Ready to Connect"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {safeModeActive && (
            <button
              onClick={() => soundFx.playSafeModeBeep()}
              title="Test Tone"
              className="p-1.5 rounded-lg bg-[#0B261B] border border-[#165038] text-[#768782] hover:text-[#00E676] text-[10px] flex items-center gap-1 transition-colors"
            >
              <Bell className="w-3 h-3" />
              <span>Beep</span>
            </button>
          )}
          <span className="text-[10px] font-mono bg-[#070B0A] border border-[#1A2824] px-2 py-0.5 rounded text-[#768782]">
            Jane Doe
          </span>
        </div>
      </div>

      {/* Voice Visualizer */}
      <div className="bg-[#070B0A] border border-[#1A2824] rounded-xl p-4 flex flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-1.5 h-8">
          <div className={`wave-bar ${isListening ? 'bg-rose-400' : isCallActive ? 'bg-[#00E676]' : 'bg-[#1A2824]'}`} style={{ animationDelay: '0.1s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-400' : isCallActive ? 'bg-[#00E676]' : 'bg-[#1A2824]'}`} style={{ animationDelay: '0.3s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-400' : isCallActive ? 'bg-[#00E676]' : 'bg-[#1A2824]'}`} style={{ animationDelay: '0.2s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-400' : isCallActive ? 'bg-[#00E676]' : 'bg-[#1A2824]'}`} style={{ animationDelay: '0.4s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-400' : isCallActive ? 'bg-[#00E676]' : 'bg-[#1A2824]'}`} style={{ animationDelay: '0.15s' }}></div>
        </div>
        <span className="text-[11px] text-[#768782] font-mono flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-[#00E676]" />
          {isListening ? (
            <span className="text-rose-400 font-semibold animate-pulse">
              {paymentSessionData?.state === "CONFIRMING"
                ? "Microphone Active • Say 'Yes' or 'No'"
                : "Microphone Active • Listening..."}
            </span>
          ) : safeModeActive ? (
            <span className="text-[#00E676]">AI Voice Agent Active (Audio Isolated)</span>
          ) : isCallActive ? (
            "Bidirectional Voice Active"
          ) : (
            "Microphone on Standby"
          )}
        </span>
      </div>

      {/* ── CALL LIFECYCLE CONTROLS (When Not in Safe Mode) ────────────────── */}
      {!safeModeActive && (
        <div className="flex flex-col gap-4">
          {!isCallActive ? (
            <div className="flex flex-col gap-3">
              {isCalling ? (
                <div className="flex flex-col items-center gap-3 py-4 px-4 rounded-xl bg-[#0B2017] border border-[#165038]">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#00E676] animate-pulse">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00E676] animate-ping" />
                    <span>Dialing Agent Desktop... (Ringing)</span>
                  </div>
                  <p className="text-[11px] text-[#A3B8B0] text-center leading-relaxed">
                    Agent screen is receiving incoming alert. Awaiting agent to click [Accept Call].
                  </p>
                  <button
                    onClick={handleHangup}
                    className="mt-1 px-4 py-2 rounded-lg bg-[#2A1519] hover:bg-[#3D1E24] text-rose-400 border border-rose-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>Cancel Call</span>
                  </button>
                </div>
              ) : callStatus === 'DECLINED' ? (
                <div className="flex flex-col items-center gap-2.5 py-4 px-4 rounded-xl bg-[#1C1215] border border-rose-500/30">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
                    <PhoneOff className="w-4 h-4" />
                    <span>Call Declined by Agent Desk</span>
                  </div>
                  <p className="text-[11px] text-[#A3B8B0] text-center leading-relaxed">
                    The agent desk was busy or declined the call. Click below to try again whenever you're ready.
                  </p>
                  <button
                    onClick={handleCallSupport}
                    className="mt-1 w-full py-3 px-4 rounded-xl bg-[#00E676] hover:bg-[#00C853] text-[#070B0A] font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Call Again</span>
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleCallSupport}
                    className="w-full py-3.5 px-4 rounded-xl bg-[#00E676] hover:bg-[#00C853] text-[#070B0A] font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Call ZytaSafe Support (Live Demo)</span>
                  </button>
                  <p className="text-[11px] text-[#768782] text-center leading-relaxed">
                    Clicking will ring the Agent Desktop window live without carrier phone numbers.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between bg-[#070B0A] p-2.5 rounded-xl border border-[#1A2824]">
                <span className="text-xs text-[#EDF3F0] font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
                  Live Call Connected
                </span>
                <button
                  onClick={handleHangup}
                  className="px-3 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>Hang Up</span>
                </button>
              </div>

              {/* Demo Conversation Starters */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-mono text-[#768782] uppercase tracking-wider">
                  Speak to Agent (Demo Phrases):
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    onClick={() => handleSendPromptTurn("What is the annual pricing and discount rate for Tier 1?")}
                    className="p-2.5 rounded-xl bg-[#070B0A] hover:bg-[#111C19] border border-[#1A2824] hover:border-[#165038] text-xs text-left text-[#EDF3F0] flex items-center justify-between transition-all"
                  >
                    <span>"What is the annual pricing & discounts?"</span>
                    <Tag className="w-3.5 h-3.5 text-[#00E676] shrink-0" />
                  </button>
                  <button
                    onClick={() => handleSendPromptTurn("Can I get a refund if I cancel my subscription?")}
                    className="p-2.5 rounded-xl bg-[#070B0A] hover:bg-[#111C19] border border-[#1A2824] hover:border-[#165038] text-xs text-left text-[#EDF3F0] flex items-center justify-between transition-all"
                  >
                    <span>"Can I get a refund if I cancel?"</span>
                    <FileText className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
                  </button>
                  <button
                    onClick={() => handleSendPromptTurn("I am ready to upgrade and pay for the annual plan.")}
                    className="p-2.5 rounded-xl bg-[#070B0A] hover:bg-[#111C19] border border-[#1A2824] hover:border-amber-500/40 text-xs text-left text-amber-300 flex items-center justify-between transition-all"
                  >
                    <span>"I am ready to pay with my credit card."</span>
                    <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Live Speech or Typed Utterance Bar */}
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={normalSpeechInput}
                  onChange={(e) => setNormalSpeechInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && normalSpeechInput.trim()) {
                      handleSendPromptTurn(normalSpeechInput);
                      setNormalSpeechInput('');
                    }
                  }}
                  placeholder="Type or speak customer utterance..."
                  className="flex-1 bg-[#070B0A] border border-[#1A2824] focus:border-[#00E676] rounded-xl px-3 py-2 text-xs text-[#EDF3F0] placeholder:text-[#4B5A55] outline-none"
                />
                <button
                  onClick={() => {
                    if (normalSpeechInput.trim()) {
                      handleSendPromptTurn(normalSpeechInput);
                      setNormalSpeechInput('');
                    }
                  }}
                  disabled={!normalSpeechInput.trim()}
                  className="p-2 rounded-xl bg-[#00E676] hover:bg-[#00C853] disabled:opacity-40 text-[#070B0A] font-bold transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SAFE MODE VOICE DIALOGUE PANEL (Automated PCI Isolation) ────────── */}
      {safeModeActive && (
        <div className="flex flex-col gap-4">
          <div className="bg-[#0B261B] border border-[#165038] p-3.5 rounded-xl text-xs text-[#EDF3F0] leading-relaxed flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-[#00E676] block mb-1">Automated Voice Agent:</span>
              <p>{paymentSessionData?.prompt || "Please speak your 16-digit card number after the tone."}</p>
            </div>
          </div>

          {paymentSessionData?.last4 && (
            <div className="bg-[#070B0A] border border-[#165038] p-2.5 rounded-lg text-xs font-mono flex items-center justify-between">
              <span className="text-[#768782]">Verified Card:</span>
              <span className="text-[#00E676] font-bold">
                {paymentSessionData.brand || "Card"} ending in **** {paymentSessionData.last4}
              </span>
            </div>
          )}

          {paymentSessionData?.state !== "COMPLETED" && (
            <div className="flex flex-col gap-2.5 bg-[#070B0A] border border-[#1A2824] p-3.5 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#EDF3F0] font-bold flex items-center gap-1.5">
                  <Radio className={`w-3.5 h-3.5 ${isListening ? 'text-rose-400 animate-ping' : 'text-[#00E676]'}`} />
                  Live Voice Microphone:
                </span>
                {cleanDigitsCount > 0 && paymentSessionData?.state === "CAPTURING_PAN" && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-[#0B261B] text-[#00E676] border border-[#165038]">
                    {cleanDigitsCount} Digits Heard
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={toggleMicrophone}
                disabled={isAiSpeaking}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                  isAiSpeaking
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40 cursor-wait'
                    : isListening
                    ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse border border-rose-400'
                    : 'bg-[#00E676] hover:bg-[#00C853] text-[#070B0A] font-bold'
                }`}
              >
                {isAiSpeaking ? (
                  <>
                    <Volume2 className="w-4 h-4 animate-bounce text-amber-400" />
                    <span>AI Agent Speaking Prompt... (Beep incoming)</span>
                  </>
                ) : isListening ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>
                      {paymentSessionData?.state === "CONFIRMING"
                        ? "Listening... Say 'Yes' or 'No'"
                        : "Listening... Speak digits now"}
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>
                      {paymentSessionData?.state === "CAPTURING_PAN"
                        ? "Tap to Speak Card Number (Mic Ready)"
                        : paymentSessionData?.state === "CAPTURING_EXPIRY"
                        ? "Tap to Speak Expiry (e.g. December 2028)"
                        : paymentSessionData?.state === "CAPTURING_CVV"
                        ? "Tap to Speak CVV (e.g. 1 2 3)"
                        : "Tap to Speak (Say 'Yes' to Confirm)"}
                    </span>
                  </>
                )}
              </button>

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
                      : paymentSessionData?.state === "CAPTURING_CVV"
                      ? "Say or type: 1 2 3..."
                      : "Say or type: Yes..."
                  }
                  className="flex-1 bg-[#0E1614] border border-[#1A2824] focus:border-[#00E676] rounded-xl px-3 py-2 text-xs text-[#EDF3F0] placeholder:text-[#768782] focus:outline-none font-mono"
                />

                <button
                  type="button"
                  onClick={() => handleCustomSubmit()}
                  disabled={!customInput.trim()}
                  className="bg-[#00E676] hover:bg-[#00C853] disabled:opacity-40 text-[#070B0A] font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick-Action Presets */}
          {paymentSessionData?.state === "CAPTURING_PAN" && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono text-[#768782] uppercase">
                Quick Test Card Presets:
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  onClick={() => onSendPan("4000 1234 5678 0987")}
                  className="bg-[#070B0A] hover:bg-[#111C19] border border-[#165038] p-2.5 rounded-xl text-xs font-mono text-[#EDF3F0] text-left flex items-center justify-between transition-all"
                >
                  <span>Standard Test Card (ends 0987)</span>
                  <span className="text-[10px] text-[#00E676] bg-[#0E1614] border border-[#165038] px-1.5 py-0.5 rounded font-bold">Safe Mode Target</span>
                </button>
                <button
                  onClick={() => onSendPan("4242 4242 4242 4242")}
                  className="bg-[#070B0A] hover:bg-[#111C19] border border-[#1A2824] p-2.5 rounded-xl text-xs font-mono text-[#EDF3F0] text-left flex items-center justify-between transition-all"
                >
                  <span>Visa Standard Test (ends 4242)</span>
                  <span className="text-[10px] text-[#34D399] bg-[#0E1614] border border-[#1A2824] px-1.5 py-0.5 rounded">Standard Test</span>
                </button>
              </div>
            </div>
          )}

          {paymentSessionData?.state === "CAPTURING_EXPIRY" && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono text-[#768782] uppercase">
                Quick Expiry Options:
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onSendExpiry("09/28")}
                  className="bg-[#070B0A] hover:bg-[#111C19] border border-[#165038] p-2.5 rounded-xl text-xs font-mono text-[#00E676] text-center font-bold"
                >
                  09 / 28
                </button>
                <button
                  onClick={() => onSendExpiry("12/28")}
                  className="bg-[#070B0A] hover:bg-[#111C19] border border-[#1A2824] p-2.5 rounded-xl text-xs font-mono text-[#EDF3F0] text-center font-bold"
                >
                  12 / 28
                </button>
                <button
                  onClick={() => onSendExpiry("05/30")}
                  className="bg-[#070B0A] hover:bg-[#111C19] border border-[#1A2824] p-2.5 rounded-xl text-xs font-mono text-[#EDF3F0] text-center font-bold"
                >
                  05 / 30
                </button>
              </div>
            </div>
          )}

          {paymentSessionData?.state === "CAPTURING_CVV" && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono text-[#768782] uppercase">
                Quick Security Code (CVV):
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onSendCvv("123")}
                  className="bg-[#070B0A] hover:bg-[#111C19] border border-[#165038] p-2.5 rounded-xl text-xs font-mono text-[#00E676] text-center font-bold"
                >
                  1 2 3
                </button>
                <button
                  onClick={() => onSendCvv("888")}
                  className="bg-[#070B0A] hover:bg-[#111C19] border border-[#1A2824] p-2.5 rounded-xl text-xs font-mono text-[#EDF3F0] text-center font-bold"
                >
                  8 8 8
                </button>
              </div>
            </div>
          )}

          {paymentSessionData?.state === "CONFIRMING" && (
            <div className="flex flex-col gap-3">
              <div className="bg-[#1C1A14] border border-amber-500/40 p-3 rounded-xl text-xs text-amber-200">
                Zero-Trust Confirmation: The AI speaks and shows <strong>ONLY</strong> the last 4 digits ({paymentSessionData?.last4 || "----"}) and expiry ({paymentSessionData?.expiry || "--/--"}).
                <span className="block mt-1 text-[#00E676] font-semibold">
                  Voice command: Speak "Yes" into your microphone or click the button below to complete.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    soundFx.playTokenSuccessChime();
                    onConfirmPayment(true);
                  }}
                  className="bg-[#00E676] hover:bg-[#00C853] text-[#070B0A] font-bold p-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md"
                >
                  <Check className="w-4 h-4" />
                  <span>"Yes, Confirm"</span>
                </button>
                <button
                  onClick={() => onConfirmPayment(false)}
                  className="bg-[#070B0A] hover:bg-[#111C19] text-[#768782] hover:text-[#EDF3F0] font-medium p-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all border border-[#1A2824]"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>"No, Restart"</span>
                </button>
              </div>
            </div>
          )}

          {paymentCompleted && (
            <div className="bg-[#0B261B] border border-[#165038] p-4 rounded-xl flex flex-col items-center justify-center text-center gap-2">
              <ShieldCheck className="w-8 h-8 text-[#00E676]" />
              <div className="text-xs font-bold text-[#00E676] uppercase tracking-wider">
                Payment Authorized & Tokenized
              </div>
              <p className="text-[11px] text-[#768782]">
                Your card has been safely tokenized. Returning to your agent now.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}