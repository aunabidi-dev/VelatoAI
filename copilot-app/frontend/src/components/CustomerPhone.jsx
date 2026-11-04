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
    const mInt = parseInt(m, 10);
    const yInt = parseInt(y, 10);
    const now = new Date();
    const currentYY = now.getFullYear() % 100;
    const currentMM = now.getMonth() + 1;
    if (yInt < currentYY || (yInt === currentYY && mInt < currentMM)) {
      return null; // Expired card
    }
    return `${m}/${y}`;
  }

  // Check for month > 12 in slash format
  const rawSlash = clean.match(/^(\d{1,2})[\/\-\s]+(20)?(\d{2})$/);
  if (rawSlash) {
    const rawM = parseInt(rawSlash[1], 10);
    if (rawM < 1 || rawM > 12) {
      return null; // Invalid month
    }
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
    const mInt = parseInt(m, 10);
    const yInt = parseInt(y, 10);
    if (mInt >= 1 && mInt <= 12) {
      const now = new Date();
      const currentYY = now.getFullYear() % 100;
      const currentMM = now.getMonth() + 1;
      if (yInt < currentYY || (yInt === currentYY && mInt < currentMM)) {
        return null; // Expired card
      }
      return `${m}/${y}`;
    }
    return null; // Invalid month > 12
  }
  if (digits.length === 3) {
    const m = digits.slice(0, 1).padStart(2, '0');
    const y = digits.slice(1);
    const mInt = parseInt(m, 10);
    const yInt = parseInt(y, 10);
    if (mInt >= 1 && mInt <= 12) {
      const now = new Date();
      const currentYY = now.getFullYear() % 100;
      const currentMM = now.getMonth() + 1;
      if (yInt < currentYY || (yInt === currentYY && mInt < currentMM)) {
        return null; // Expired card
      }
      return `${m}/${y}`;
    }
    return null;
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
  const [inputError, setInputError] = useState(null);
  const [mmsTtsActive, setMmsTtsActive] = useState(false);
  const recognitionRef = useRef(null);
  const autoSubmitTimerRef = useRef(null);
  const sessionRef = useRef(paymentSessionData);
  const shouldListenRef = useRef(false);
  const speechUtteranceRef = useRef(null);
  const ttsFallbackTimerRef = useRef(null);
  const stuckWatchdogRef = useRef(null);
  const isStartingRecognitionRef = useRef(false);

  useEffect(() => {
    sessionRef.current = paymentSessionData;
  }, [paymentSessionData]);

  // Inter-window call event listener for customer phone
  useEffect(() => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return;
    const channel = new BroadcastChannel('velatoai_call_mesh');

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
    setInputError(null);
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
      if (stuckWatchdogRef.current) {
        clearTimeout(stuckWatchdogRef.current);
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
    };
  }, []);

  // TTS engine: Meta MMS TTS (backend) -> Browser Web Speech API (fallback)
  // Per product spec §6 & §14
  useEffect(() => {
    if (safeModeActive && paymentSessionData?.prompt) {
      if (ttsFallbackTimerRef.current) clearTimeout(ttsFallbackTimerRef.current);
      if (stuckWatchdogRef.current) clearTimeout(stuckWatchdogRef.current);

      // Ensure microphone does NOT listen while AI is speaking
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      setIsListening(false);
      setIsAiSpeaking(true);

      const triggerToneAndListening = () => {
        if (stuckWatchdogRef.current) clearTimeout(stuckWatchdogRef.current);
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

      // Stuck-state watchdog: force-trigger if AI appears stuck for 10s
      stuckWatchdogRef.current = setTimeout(() => {
        if (!shouldListenRef.current) {
          console.warn('[VelatoAI TTS] Stuck watchdog triggered — forcing tone & mic');
          triggerToneAndListening();
        }
      }, 10000);

      const promptText = paymentSessionData.prompt;
      const ttsTimeoutMs = Math.min(Math.max(promptText.length * 80, 2000), 6000);

      // Try Meta MMS TTS backend first
      const tryMMSTTS = async () => {
        try {
          const ctrl = new AbortController();
          const fetchTimer = setTimeout(() => ctrl.abort(), 2500); // 2.5s fast timeout for backend
          const res = await fetch('/api/tts/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: promptText, session_id: paymentSessionData?.session_id || '' }),
            signal: ctrl.signal,
          });
          clearTimeout(fetchTimer);
          if (!res.ok) throw new Error(`TTS backend: ${res.status}`);
          const audioBlob = await res.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          speechUtteranceRef.current = audio;
          setMmsTtsActive(true);

          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            clearTimeout(ttsFallbackTimerRef.current);
            triggerToneAndListening();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            fallbackToBrowserTTS();
          };
          ttsFallbackTimerRef.current = setTimeout(() => {
            audio.pause();
            triggerToneAndListening();
          }, ttsTimeoutMs + 2000);
          audio.play().catch(() => fallbackToBrowserTTS());
        } catch (e) {
          fallbackToBrowserTTS();
        }
      };

      const fallbackToBrowserTTS = () => {
        setMmsTtsActive(false);
        if (!('speechSynthesis' in window)) {
          triggerToneAndListening();
          return;
        }
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(promptText);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          speechUtteranceRef.current = utterance;

          ttsFallbackTimerRef.current = setTimeout(() => {
            triggerToneAndListening();
          }, ttsTimeoutMs);

          utterance.onstart = () => {
            setIsAiSpeaking(true);
            setIsListening(false);
          };
          utterance.onend = () => {
            if (ttsFallbackTimerRef.current) clearTimeout(ttsFallbackTimerRef.current);
            triggerToneAndListening();
          };
          utterance.onerror = (e) => {
            if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
            if (ttsFallbackTimerRef.current) clearTimeout(ttsFallbackTimerRef.current);
            triggerToneAndListening();
          };
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          triggerToneAndListening();
        }
      };

      tryMMSTTS();
    }
  }, [paymentSessionData?.prompt, safeModeActive]);

  const startRecognition = () => {
    if (isStartingRecognitionRef.current) return; // Prevent double-start
    isStartingRecognitionRef.current = true;
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
        isStartingRecognitionRef.current = false;
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
          setCustomInput(formatted || trimmed);

          // Give customer time to finish speaking their card turns naturally without premature cutoff
          if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
          const digitsOnly = (formatted || trimmed).replace(/\D/g, '');
          const isHesitationOrQuestion = /\b(hold on|one sec|wait|alice|hear|secure|safe|transfer|why|operator|human)\b/i.test(trimmed);

          // Submit after a natural 1.2s pause in speaking
          if (digitsOnly.length >= 15 || isHesitationOrQuestion) {
            autoSubmitTimerRef.current = setTimeout(() => {
              shouldListenRef.current = false;
              if (recognitionRef.current) {
                recognitionRef.current.onresult = null;
                try { recognitionRef.current.abort(); } catch (e) {}
                recognitionRef.current = null;
              }
              handleCustomSubmit(trimmed);
            }, 1200);
          }
        } else if (currentState === "CAPTURING_EXPIRY") {
          setCustomInput(trimmed);
          if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
          autoSubmitTimerRef.current = setTimeout(() => {
            shouldListenRef.current = false;
            if (recognitionRef.current) {
              recognitionRef.current.onresult = null;
              try { recognitionRef.current.abort(); } catch (e) {}
              recognitionRef.current = null;
            }
            handleCustomSubmit(trimmed);
          }, 1100);
        } else if (currentState === "CAPTURING_CVV") {
          setCustomInput(trimmed);
          if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
          autoSubmitTimerRef.current = setTimeout(() => {
            shouldListenRef.current = false;
            if (recognitionRef.current) {
              recognitionRef.current.onresult = null;
              try { recognitionRef.current.abort(); } catch (e) {}
              recognitionRef.current = null;
            }
            handleCustomSubmit(trimmed);
          }, 1000);
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
      setTimeout(() => { isStartingRecognitionRef.current = false; }, 300);
    } catch (e) {
      isStartingRecognitionRef.current = false;
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
      setInputError(null);
      onSendPan(textToSend);
    } else if (currentState === "CAPTURING_EXPIRY") {
      setInputError(null);
      onSendExpiry(textToSend);
    } else if (currentState === "CAPTURING_CVV") {
      setInputError(null);
      onSendCvv(textToSend);
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
    <div className={`w-full max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-5 relative text-slate-900 shadow-sm ${isCustomerWindow ? 'min-h-screen justify-center' : ''}`}>
      {/* Phone Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${
            safeModeActive
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : isCallActive
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-slate-100 text-slate-600 border border-slate-200'
          }`}>
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">
              {safeModeActive ? "VelatoAI Automated Pay" : isCallActive ? "Live Call Active" : "VelatoAI Customer Caller"}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {safeModeActive
                ? "Secure automated voice assistant"
                : isCallActive
                ? "Connected to Agent Alice"
                : "Caller: Jane Doe • Ready to connect"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {safeModeActive && (
            <button
              onClick={() => soundFx.playSafeModeBeep()}
              title="Test Tone"
              className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 text-[10px] flex items-center gap-1 transition-colors shadow-2xs"
            >
              <Bell className="w-3 h-3 text-slate-500" />
              <span>Beep</span>
            </button>
          )}
          <span className="text-[10px] font-mono bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-600">
            Jane Doe
          </span>
        </div>
      </div>

      {/* Voice Visualizer */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-1.5 h-8">
          <div className={`wave-bar ${isListening ? 'bg-rose-500' : isCallActive ? 'bg-emerald-600' : 'bg-slate-300'}`} style={{ animationDelay: '0.1s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-500' : isCallActive ? 'bg-emerald-600' : 'bg-slate-300'}`} style={{ animationDelay: '0.3s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-500' : isCallActive ? 'bg-emerald-600' : 'bg-slate-300'}`} style={{ animationDelay: '0.2s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-500' : isCallActive ? 'bg-emerald-600' : 'bg-slate-300'}`} style={{ animationDelay: '0.4s' }}></div>
          <div className={`wave-bar ${isListening ? 'bg-rose-500' : isCallActive ? 'bg-emerald-600' : 'bg-slate-300'}`} style={{ animationDelay: '0.15s' }}></div>
        </div>
        <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-slate-500" />
          {isListening ? (
            <span className="text-rose-600 font-semibold">
              {paymentSessionData?.state === "CONFIRMING"
                ? "Microphone active • Say 'Yes' or 'No'"
                : "Microphone active • Listening..."}
            </span>
          ) : safeModeActive ? (
            <span className="text-emerald-700 font-medium">Automated voice assistant active</span>
          ) : isCallActive ? (
            "Bidirectional audio connected"
          ) : (
            "Microphone on standby"
          )}
        </span>
      </div>

      {/* ── CALL LIFECYCLE CONTROLS (When Not in Safe Mode) ────────────────── */}
      {!safeModeActive && (
        <div className="flex flex-col gap-4">
          {!isCallActive ? (
            <div className="flex flex-col gap-3">
              {isCalling ? (
                <div className="flex flex-col items-center gap-3 py-4 px-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>Calling agent desktop... (Ringing)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 text-center leading-relaxed">
                    The agent screen is receiving an incoming call alert. Awaiting agent to accept.
                  </p>
                  <button
                    onClick={handleHangup}
                    className="mt-1 px-4 py-2 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>Cancel call</span>
                  </button>
                </div>
              ) : callStatus === 'DECLINED' ? (
                <div className="flex flex-col items-center gap-2.5 py-4 px-4 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="flex items-center gap-2 text-xs font-semibold text-rose-800">
                    <PhoneOff className="w-4 h-4 text-rose-600" />
                    <span>Call declined by agent desk</span>
                  </div>
                  <p className="text-[11px] text-slate-600 text-center leading-relaxed">
                    The agent was busy or declined the call. Click below to try again whenever you're ready.
                  </p>
                  <button
                    onClick={handleCallSupport}
                    className="mt-1 w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-xs active:scale-98"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Call again</span>
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleCallSupport}
                    className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-xs active:scale-98"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Call VelatoAI support</span>
                  </button>
                  <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                    Simulates a direct inbound WebRTC customer call to the agent desktop.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-900 font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Live call connected
                </span>
                <button
                  onClick={handleHangup}
                  className="px-3 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>Hang up</span>
                </button>
              </div>

              {/* Demo Conversation Starters */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                  Speak to agent (Demo phrases):
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    onClick={() => handleSendPromptTurn("What is the annual pricing and discount rate for Tier 1?")}
                    className="p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs text-left text-slate-800 flex items-center justify-between transition-all shadow-2xs"
                  >
                    <span>"What is the annual pricing & discounts?"</span>
                    <Tag className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  </button>
                  <button
                    onClick={() => handleSendPromptTurn("Can I get a refund if I cancel my subscription?")}
                    className="p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs text-left text-slate-800 flex items-center justify-between transition-all shadow-2xs"
                  >
                    <span>"Can I get a refund if I cancel?"</span>
                    <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>
                  <button
                    onClick={() => handleSendPromptTurn("I am ready to upgrade and pay for the annual plan.")}
                    className="p-2.5 rounded-xl bg-amber-50/70 hover:bg-amber-100/60 border border-amber-200 text-xs text-left text-amber-900 flex items-center justify-between transition-all shadow-2xs"
                  >
                    <span>"I am ready to pay with my credit card."</span>
                    <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
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
                  className="flex-1 bg-white border border-slate-300 focus:border-slate-500 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
                <button
                  onClick={() => {
                    if (normalSpeechInput.trim()) {
                      handleSendPromptTurn(normalSpeechInput);
                      setNormalSpeechInput('');
                    }
                  }}
                  disabled={!normalSpeechInput.trim()}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-medium transition-all shadow-2xs"
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
          <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl text-xs text-slate-900 leading-relaxed flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-emerald-900 block mb-1">Automated Voice Agent:</span>
              <p className="text-slate-800">{paymentSessionData?.prompt || "Please speak your 16-digit card number after the tone."}</p>
            </div>
          </div>

          {paymentSessionData?.last4 && (
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs font-mono flex items-center justify-between">
              <span className="text-slate-500">Verified Card:</span>
              <span className="text-emerald-700 font-bold">
                {paymentSessionData.brand || "Card"} ending in **** {paymentSessionData.last4}
              </span>
            </div>
          )}

          {paymentSessionData?.state !== "COMPLETED" && (
            <div className="flex flex-col gap-2.5 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-900 font-bold flex items-center gap-1.5">
                  <Radio className={`w-3.5 h-3.5 ${isListening ? 'text-rose-500' : 'text-emerald-600'}`} />
                  Live voice input:
                </span>
                {cleanDigitsCount > 0 && paymentSessionData?.state === "CAPTURING_PAN" && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-white text-slate-700 border border-slate-200">
                    {cleanDigitsCount} Digits Heard
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={toggleMicrophone}
                disabled={isAiSpeaking}
                className={`w-full py-2.5 px-4 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-xs ${
                  isAiSpeaking
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 cursor-wait'
                    : isListening
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {isAiSpeaking ? (
                  <>
                    <Volume2 className="w-4 h-4 text-amber-700" />
                    <span>Agent speaking prompt... (Beep incoming)</span>
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
                        ? "Tap to speak card number"
                        : paymentSessionData?.state === "CAPTURING_EXPIRY"
                        ? "Tap to speak expiry (e.g. December 2028)"
                        : paymentSessionData?.state === "CAPTURING_CVV"
                        ? "Tap to speak CVV (e.g. 1 2 3)"
                        : "Tap to speak (Say 'Yes' to confirm)"}
                    </span>
                  </>
                )}
              </button>

              {/* Real-time Validation Error Banner */}
              {inputError && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" />
                  <span>{inputError}</span>
                </div>
              )}

              {/* Live Luhn & Format Status Badge for Card Entry */}
              {paymentSessionData?.state === "CAPTURING_PAN" && cleanDigitsCount >= 13 && (
                <div className="flex items-center justify-between px-1 text-[11px] font-mono">
                  <span className="text-slate-500">Luhn checksum status:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    checkLuhn(cleanDigits)
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}>
                    {checkLuhn(cleanDigits) ? '✓ Valid Checksum' : '✗ Invalid Luhn Checksum'}
                  </span>
                </div>
              )}

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
                  className="flex-1 bg-white border border-slate-300 focus:border-slate-500 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none font-mono transition-colors"
                />

                <button
                  type="button"
                  onClick={() => handleCustomSubmit()}
                  disabled={!customInput.trim()}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-medium px-3 py-2 rounded-xl text-xs flex items-center gap-1 transition-all shadow-2xs"
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
              <span className="text-[11px] font-mono text-slate-500 uppercase">
                Quick test card presets:
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  onClick={() => onSendPan("4000 1234 5678 0982")}
                  className="bg-white hover:bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-mono text-slate-800 text-left flex items-center justify-between transition-all shadow-2xs"
                >
                  <span>Standard Test Card (ends 0982)</span>
                  <span className="text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">Safe Mode Target (Valid Checksum)</span>
                </button>
                <button
                  onClick={() => onSendPan("4242 4242 4242 4242")}
                  className="bg-white hover:bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-mono text-slate-800 text-left flex items-center justify-between transition-all shadow-2xs"
                >
                  <span>Visa Standard Test (ends 4242)</span>
                  <span className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">Standard Test</span>
                </button>
                <button
                  onClick={() => onSendPan("4000 1234 5678 0987")}
                  className="bg-amber-50/60 hover:bg-amber-100/50 border border-amber-200 p-2.5 rounded-xl text-xs font-mono text-amber-900 text-left flex items-center justify-between transition-all shadow-2xs"
                >
                  <span>Checksum Failure Test (ends 0987)</span>
                  <span className="text-[10px] text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded font-medium">Simulate Luhn Failure</span>
                </button>
              </div>
            </div>
          )}

          {paymentSessionData?.state === "CAPTURING_EXPIRY" && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono text-slate-500 uppercase">
                Quick expiry presets:
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onSendExpiry("09/28")}
                  className="bg-white hover:bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-mono text-emerald-700 text-center font-bold shadow-2xs"
                >
                  09 / 28
                </button>
                <button
                  onClick={() => onSendExpiry("12/28")}
                  className="bg-white hover:bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-mono text-slate-800 text-center font-bold shadow-2xs"
                >
                  12 / 28
                </button>
                <button
                  onClick={() => onSendExpiry("05/30")}
                  className="bg-white hover:bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-mono text-slate-800 text-center font-bold shadow-2xs"
                >
                  05 / 30
                </button>
              </div>
            </div>
          )}

          {paymentSessionData?.state === "CAPTURING_CVV" && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono text-slate-500 uppercase">
                Quick security code (CVV):
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onSendCvv("123")}
                  className="bg-white hover:bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-mono text-emerald-700 text-center font-bold shadow-2xs"
                >
                  1 2 3
                </button>
                <button
                  onClick={() => onSendCvv("888")}
                  className="bg-white hover:bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-mono text-slate-800 text-center font-bold shadow-2xs"
                >
                  8 8 8
                </button>
              </div>
            </div>
          )}

          {paymentSessionData?.state === "CONFIRMING" && (
            <div className="flex flex-col gap-3">
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900">
                Zero-Trust Confirmation: The assistant speaks and shows <strong>ONLY</strong> the last 4 digits ({paymentSessionData?.last4 || "----"}) and expiry ({paymentSessionData?.expiry || "--/--"}).
                <span className="block mt-1 text-emerald-800 font-semibold">
                  Voice command: Speak "Yes" into your microphone or click the button below to complete.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    soundFx.playTokenSuccessChime();
                    onConfirmPayment(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium p-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>"Yes, Confirm"</span>
                </button>
                <button
                  onClick={() => onConfirmPayment(false)}
                  className="bg-white hover:bg-slate-50 text-slate-700 font-medium p-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-300 shadow-2xs"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>"No, Restart"</span>
                </button>
              </div>
            </div>
          )}

          {paymentCompleted && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex flex-col items-center justify-center text-center gap-2">
              <ShieldCheck className="w-8 h-8 text-emerald-600" />
              <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                Payment authorized & tokenized
              </div>
              <p className="text-[11px] text-slate-600">
                Your card has been safely tokenized. Returning to your agent now.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
