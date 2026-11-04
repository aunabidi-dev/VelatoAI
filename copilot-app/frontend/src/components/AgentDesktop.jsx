import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, Lock, Mic, MicOff, Volume2, VolumeX, Play, Pause,
  Download, Send, Sparkles, Lightbulb, FileText, ExternalLink,
  Info, Maximize2, RotateCcw, PhoneCall, ChevronDown, CheckCircle2,
  Bot, AlertTriangle, ArrowRight, User, Tag, XCircle, PhoneIncoming,
  PhoneOff, Radio
} from 'lucide-react';
import { soundFx } from './AudioSynthesizer';

export default function AgentDesktop({
  callState,
  onTriggerSafeMode,
  onCancelSafeMode,
  copilotSuggestion,
  copilotBlackout,
  paymentResult,
  auditMarkers,
  wsRef,
  onOpenCustomerPhone,
  paymentSession,
  incomingCall,
  isCallActive = false,
  onAcceptCall,
  onHangupCall,
  onDeclineCall,
  onSimulateCall,
  remoteStream,
  localStream = null,
  onSetRecordedAudio = null,
  onSendTranscriptUtterance,
}) {
  const [lastCallDuration, setLastCallDuration] = useState(0);
  const isSafeMode = Boolean(callState?.safe_mode_active || callState?.agent_isolated);
  const [seconds, setSeconds] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isRecordingPlaying, setIsRecordingPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const [chatSpeaker, setChatSpeaker] = useState('customer'); // kept for handleSendUtterance logic
  const [transcriptLines, setTranscriptLines] = useState([
    { speaker: 'customer', text: 'Hi, I need help with my subscription billing...', ts: '11:38:35' },
    { speaker: 'agent',    text: 'Of course! I can help with that. Could you confirm your account email?', ts: '11:38:53' },
    { speaker: 'customer', text: "Sure, it's jane.doe@example.com. I wanted to upgrade and pay for the annual plan.", ts: '11:39:08' },
  ]);
  const [liveSuggestion, setLiveSuggestion] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [inputMessage, setInputMessage] = useState(''); // kept for potential external use
  const transcriptEndRef = useRef(null);
  const recTimerRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const recordingAudioElRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // Fetch real-time recording timeline from backend
  const fetchRecordingTimeline = async () => {
    try {
      const res = await fetch(`/api/calls/${callState?.call_id || 'call_meta_hackathon_01'}/recording/timeline`);
      if (res.ok) {
        const data = await res.json();
        setTimelineData(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchRecordingTimeline();
    const interval = setInterval(fetchRecordingTimeline, 3000);
    return () => clearInterval(interval);
  }, [callState?.call_id, isSafeMode, paymentResult]);

  // Wire WebRTC remote audio stream to audio element
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(e => console.warn('[Audio] autoplay prevented:', e));
    }
  }, [remoteStream]);

  // Call duration ticker when call is active
  useEffect(() => {
    if (!isCallActive) {
      if (seconds > 0) {
        setLastCallDuration(seconds);
      }
      return;
    }
    setSeconds(0);
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isCallActive]);

  const effectiveRecordingDuration = Math.max(seconds, lastCallDuration, timelineData?.total_duration_s || 0, 1);

  // Auto-scroll transcript
  useEffect(() => {
    if (autoScroll) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcriptLines, autoScroll]);

  // Insert timeline markers into transcript when Safe Mode engages or completes
  useEffect(() => {
    const now = new Date();
    const tsStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    if (isSafeMode) {
      setTranscriptLines(prev => [
        ...prev,
        {
          speaker: 'system',
          text: 'PCI_GAP_START: Zero-Trust Safe Mode Engaged — Call recording muted & agent line severed',
          ts: tsStr,
          isGapMarker: true,
        }
      ]);
    } else if (paymentResult) {
      setTranscriptLines(prev => [
        ...prev,
        {
          speaker: 'system',
          text: `PCI_GAP_END: Payment Authorized (${paymentResult.brand || 'Card'} ending in ${paymentResult.last4 || '****'}) — Recording resumed with Zero PAN`,
          ts: tsStr,
          isGapMarker: true,
        }
      ]);
    }
  }, [isSafeMode, !!paymentResult]);

  // WebSocket message listener for live suggestions and remote transcripts
  useEffect(() => {
    const ws = wsRef?.current;
    if (!ws) return;

    const handleTranscriptMsg = (msg) => {
      if (!msg || !msg.text || isSafeMode) return;
      const now = new Date();
      const tsStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
      const incomingSpeaker = msg.speaker || 'customer';
      setTranscriptLines(prev => {
        const last = prev[prev.length - 1];
        if (last && last.text === msg.text && last.speaker === incomingSpeaker) {
          return prev;
        }
        return [
          ...prev,
          { speaker: incomingSpeaker, text: msg.text, ts: tsStr }
        ];
      });
      if (incomingSpeaker === 'customer') {
        fetchLiveSuggestion(msg.text);
      }
    };

    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'COPILOT_SUGGESTION') {
          setIsThinking(false);
          if (msg.blackout) {
            setLiveSuggestion(null);
            return;
          }
          if (msg.suggestion) {
            setLiveSuggestion({
              suggestion: msg.suggestion,
              sourceDocTitle: msg.source_doc_title || null,
              confidence: msg.confidence ?? 0.88,
              model: msg.model || 'Muse Spark Open (Baseten)',
              redacted: msg.redacted || false,
              blackout: false,
            });
          }
        } else if (msg.type === 'TRANSCRIPT_CHUNK' || msg.type === 'CALL_SPEECH') {
          handleTranscriptMsg(msg);
        }
      } catch (e) { }
    };

    ws.addEventListener('message', handleMessage);

    // Also listen to local cross-tab BroadcastChannel for 0ms transcript synchronization
    let channel = null;
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      channel = new BroadcastChannel('velatoai_call_mesh');
      channel.onmessage = (event) => {
        const msg = event.data;
        if (msg && (msg.type === 'TRANSCRIPT_CHUNK' || msg.type === 'CALL_SPEECH')) {
          handleTranscriptMsg(msg);
        }
      };
    }

    return () => {
      ws.removeEventListener('message', handleMessage);
      if (channel) channel.close();
    };
  }, [wsRef?.current, isSafeMode]);

  // Real Customer Voice Capture via MediaRecorder on WebRTC Remote Stream
  useEffect(() => {
    if (!isCallActive || !remoteStream) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
      return;
    }

    try {
      const audioTracks = remoteStream.getAudioTracks();
      if (audioTracks.length === 0) return;

      recordedChunksRef.current = [];
      const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
        ? 'audio/webm;codecs=opus'
        : (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm'))
        ? 'audio/webm'
        : 'audio/mp4';

      // Full-duplex mix: combine remote customer track + local agent mic track
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const dest = audioCtx.createMediaStreamDestination();
      let hasTracks = false;

      if (remoteStream && remoteStream.getAudioTracks().length > 0) {
        try {
          const remoteSource = audioCtx.createMediaStreamSource(remoteStream);
          remoteSource.connect(dest);
          hasTracks = true;
        } catch (e) {}
      }
      if (localStream && localStream.getAudioTracks().length > 0) {
        try {
          const localSource = audioCtx.createMediaStreamSource(localStream);
          localSource.connect(dest);
          hasTracks = true;
        } catch (e) {}
      }

      const streamToRecord = hasTracks ? dest.stream : remoteStream;
      const recorder = new MediaRecorder(streamToRecord, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
          try {
            const blob = new Blob(recordedChunksRef.current, { type: mimeType });
            const url = URL.createObjectURL(blob);
            setRecordedAudioUrl(url);
            if (onSetRecordedAudio) {
              onSetRecordedAudio(url, effectiveRecordingDuration);
            }
          } catch (err) {}
        }
      };

      recorder.onstop = () => {
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(blob);
          setRecordedAudioUrl(url);
          if (onSetRecordedAudio) {
            onSetRecordedAudio(url, effectiveRecordingDuration);
          }
        }
      };

      recorder.start(1000);
    } catch (e) {
      console.warn("[Recording] MediaRecorder setup notice:", e);
    }

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
    };
  }, [isCallActive, remoteStream]);

  // Zero-Trust Isolation: Pause recording during PCI Safe Mode (No PAN in audio buffer)
  useEffect(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    try {
      if (isSafeMode && recorder.state === 'recording') {
        recorder.pause();
      } else if (!isSafeMode && recorder.state === 'paused') {
        recorder.resume();
      }
    } catch (e) {
      console.warn("[Recording] Pause/resume error:", e);
    }
  }, [isSafeMode]);

  useEffect(() => {
    if (copilotBlackout) {
      setLiveSuggestion(null);
      setIsThinking(false);
    }
  }, [copilotBlackout]);

  const formatDuration = (totalSec) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const fetchLiveSuggestion = async (customerText) => {
    setIsThinking(true);
    try {
      const res = await fetch('/api/copilot/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: callState?.call_id || 'call_meta_hackathon_01',
          speaker: 'customer',
          text: customerText.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsThinking(false);
        if (data.blackout) {
          setLiveSuggestion(null);
        } else {
          setLiveSuggestion({
            suggestion: data.suggestion,
            sourceDocTitle: data.source_doc_title || null,
            confidence: data.confidence ?? 0.88,
            model: data.model || 'Muse Spark Open (Baseten)',
            redacted: data.redacted || false,
            blackout: false,
          });
        }
      } else {
        setIsThinking(false);
      }
    } catch (e) {
      setIsThinking(false);
    }
  };

  const handleSendUtterance = async (text, speaker = 'customer') => {
    if (!text.trim()) return;
    const now = new Date();
    const tsStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;

    setTranscriptLines(prev => {
      const last = prev[prev.length - 1];
      if (last && last.text === text.trim() && last.speaker === speaker) {
        return prev;
      }
      return [...prev, { speaker, text: text.trim(), ts: tsStr }];
    });

    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        const ch = new BroadcastChannel('velatoai_call_mesh');
        ch.postMessage({ type: 'TRANSCRIPT_CHUNK', text: text.trim(), speaker });
        ch.close();
      }
    } catch (e) {}

    if (onSendTranscriptUtterance) {
      onSendTranscriptUtterance(text.trim(), speaker);
    }

    // Only customer speech triggers the live copilot suggestion
    if (speaker === 'customer') {
      fetchLiveSuggestion(text);
    }
  };

  const handleInsertScriptAsAgent = () => {
    const textToInsert = liveSuggestion?.suggestion || copilotSuggestion;
    if (textToInsert && !copilotBlackout) {
      handleSendUtterance(textToInsert, 'agent');
    }
  };

  // Recording preview playback toggle using real recorded audio (no artificial hum)
  const toggleRecordingPlay = () => {
    const audioEl = recordingAudioElRef.current;
    if (isRecordingPlaying) {
      setIsRecordingPlaying(false);
      if (audioEl) audioEl.pause();
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    } else {
      setIsRecordingPlaying(true);
      if (audioEl && recordedAudioUrl) {
        audioEl.currentTime = recordingTime;
        audioEl.play().catch(e => console.warn('[Audio Playback] Notice:', e));
      }
      recTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const maxSec = effectiveRecordingDuration;
          if (prev >= maxSec && maxSec > 0) {
            setIsRecordingPlaying(false);
            if (audioEl) audioEl.pause();
            clearInterval(recTimerRef.current);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const isCurrentlyInPciGap = isSafeMode || (timelineData?.segments || []).some(seg =>
    (seg.type === 'PCI_WITHHELD' || seg.type === 'NOTICE') &&
    recordingTime >= (seg.start_offset_s || 0) &&
    recordingTime <= (seg.end_offset_s || 999999)
  );

  // Mute real audio during Safe Mode or PCI gap if recording is playing
  useEffect(() => {
    const audioEl = recordingAudioElRef.current;
    if (audioEl) {
      audioEl.muted = Boolean(isCurrentlyInPciGap);
    }
  }, [isCurrentlyInPciGap, isRecordingPlaying]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, []);

  const activeSuggestion = liveSuggestion?.suggestion || copilotSuggestion;
  const activeSourceDoc = liveSuggestion?.sourceDocTitle || null;

  return (
    <div className="flex flex-col gap-5 w-full max-w-[1400px] mx-auto pb-8">
      {/* Hidden HTML audio element for playing WebRTC remote audio stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline />
      {/* HTML audio element for playing recorded call voice */}
      <audio ref={recordingAudioElRef} src={recordedAudioUrl || undefined} />

      {/* ── INCOMING CALL ALERT BANNER ──────────────────────────────────────── */}
      {incomingCall && (
        <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
              <PhoneIncoming className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-800">
                  Incoming live support call
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {incomingCall.caller_name || 'Jane Doe'} • <span className="font-normal text-xs text-slate-600">{incomingCall.plan || 'Annual Cloud AI Plan ($49.99/mo)'}</span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                soundFx.stopIncomingRing();
                if (onAcceptCall) onAcceptCall();
              }}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-xs active:scale-98"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Accept call</span>
            </button>
            <button
              onClick={() => {
                soundFx.stopIncomingRing();
                if (onDeclineCall) {
                  onDeclineCall();
                } else if (onHangupCall) {
                  onHangupCall();
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-xs transition-all flex items-center gap-1.5 active:scale-98"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>Decline</span>
            </button>
          </div>
        </div>
      )}

      {/* ── ROW 1: Top 3 Status & Action Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Card 1: Agent Screen (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isSafeMode ? 'bg-rose-500' : isCallActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <span className="text-xs font-semibold text-slate-500">Agent screen</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${
                isSafeMode
                  ? 'bg-rose-50 text-rose-700 border-rose-200 font-medium'
                  : isCallActive
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-medium'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {isSafeMode ? "Severed line" : isCallActive ? "Control plane active" : "Standby"}
              </span>
              {isCallActive && (
                <button
                  onClick={onHangupCall}
                  className="p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                  title="End Call"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {isCallActive ? `Call with ${callState?.customer_name || 'Jane Doe'}` : "Line on standby"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isCallActive ? (
                    <>Account: Premium Enterprise • <span className="font-mono text-emerald-700 font-medium">Duration: {formatDuration(seconds)}</span></>
                  ) : (
                    <span>Ready for incoming call from customer</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pl-2">
              {isSafeMode ? (
                <div className="flex items-center gap-1.5 text-rose-700 font-mono text-xs font-medium">
                  <MicOff className="w-4 h-4 text-rose-600" />
                  <span className="hidden sm:inline">Audio severed</span>
                </div>
              ) : isCallActive ? (
                <div className="flex items-center gap-1.5 text-emerald-700 font-mono text-xs font-medium">
                  <div className="flex items-center gap-0.5">
                    <span className="w-0.5 h-3 bg-emerald-600 rounded-full"></span>
                    <span className="w-0.5 h-4 bg-emerald-600 rounded-full"></span>
                    <span className="w-0.5 h-2 bg-emerald-600 rounded-full"></span>
                  </div>
                  <span className="hidden sm:inline">Live audio</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSimulateCall) onSimulateCall();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-medium flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
                    title="Simulate incoming customer call"
                  >
                    <PhoneIncoming className="w-3.5 h-3.5 text-slate-500" />
                    <span>Simulate call</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: PCI SAFE MODE (Prominent Hero Toggle) (3 cols) */}
        <div
          onClick={() => {
            if (isSafeMode) {
              if (onCancelSafeMode) onCancelSafeMode();
            } else {
              soundFx.playSafeModeBeep();
              if (onTriggerSafeMode) onTriggerSafeMode();
            }
          }}
          className={`lg:col-span-3 rounded-2xl p-4 flex items-center justify-between border cursor-pointer transition-all select-none shadow-xs ${
            isSafeMode
              ? 'bg-rose-50 border-rose-300'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-colors ${
              isSafeMode
                ? 'bg-rose-100 text-rose-700 border-rose-300'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className={`text-xs font-bold tracking-wider uppercase ${isSafeMode ? 'text-rose-900' : 'text-slate-900'}`}>
                PCI SAFE MODE
              </div>
              <div className={`text-[11px] ${isSafeMode ? 'text-rose-700 font-medium' : 'text-slate-500'}`}>
                {isSafeMode ? "Audio isolated at server" : "Ready for payment handover"}
              </div>
            </div>
          </div>

          {/* Toggle Switch */}
          <div
            role="switch"
            aria-checked={isSafeMode}
            className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 flex items-center ${
              isSafeMode ? 'bg-rose-600 justify-end' : 'bg-slate-200 justify-start'
            }`}
            title={isSafeMode ? "Safe Mode is Active. Click to cancel." : "Click to engage PCI Safe Mode."}
          >
            <div className={`w-6 h-6 rounded-full shadow-xs transform transition-transform duration-300 flex items-center justify-center ${
              isSafeMode ? 'bg-white text-rose-600' : 'bg-white text-slate-400'
            }`}>
              {isSafeMode ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Shield className="w-3.5 h-3.5" />
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Customer Caller (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isCallActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <span className="text-xs font-semibold text-slate-500">Customer caller</span>
            </div>
            <button
              onClick={onOpenCustomerPhone}
              className="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200 transition-colors"
              title="Open customer phone simulator"
            >
              <span>{callState?.customer_name || 'Jane Doe'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Call with support</h3>
                <p className="text-xs text-slate-500">
                  {isSafeMode ? (
                    <span className="text-emerald-700 font-medium">Connected to voice AI (Safe Mode)</span>
                  ) : isCallActive ? (
                    "Connected to Agent Alice"
                  ) : (
                    "Line on standby"
                  )}
                </p>
              </div>
            </div>

            {/* Live Audio Waveform */}
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-slate-400" />
              <div className="flex items-center gap-0.5">
                {[4, 8, 14, 10, 6, 12, 16, 9, 5, 11, 7, 3].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}px` }}
                    className={`w-0.5 rounded-full transition-all ${
                      isSafeMode ? 'bg-rose-500' : isCallActive ? 'bg-emerald-600' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: Main Workspace (Zoom-Style Call + Live Transcript | Copilot) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Zoom Call Interface + Live Transcript (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* ── Zoom Call Video Interface (Split-screen Participant Tiles) ── */}
          <div className={`relative rounded-2xl overflow-hidden border flex flex-col transition-all shadow-xs ${
            isSafeMode
              ? 'bg-slate-900 border-rose-300'
              : isCallActive
              ? 'bg-slate-900 border-slate-300'
              : 'bg-slate-900 border-slate-200'
          }`}>
            {/* Top Zoom Call Bar */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isSafeMode ? 'bg-rose-500' : isCallActive ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                <span className="text-xs font-semibold text-white">
                  {isSafeMode ? 'PCI Safe Mode payment handover' : isCallActive ? 'Active call session' : 'Voice line standby'}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  ID: {callState?.call_id || 'call_01'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isCallActive && (
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950 px-2.5 py-0.5 rounded-full border border-emerald-800">
                    {formatDuration(seconds)}
                  </span>
                )}
              </div>
            </div>

            {/* Zoom Participant Tiles */}
            <div className="grid grid-cols-2 gap-3 p-3 min-h-[190px] bg-slate-900">
              {/* Tile 1: Agent Alice */}
              <div className={`relative rounded-xl flex flex-col items-center justify-center p-4 border transition-all ${
                isSafeMode
                  ? 'bg-slate-950/80 border-rose-900/60'
                  : isCallActive
                  ? 'bg-slate-800/80 border-slate-700'
                  : 'bg-slate-800/40 border-slate-800'
              }`}>
                {/* Audio Severed Stamp in Safe Mode */}
                {isSafeMode && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-rose-950/90 text-rose-300 border border-rose-600/50 text-[10px] font-mono flex items-center gap-1">
                    <MicOff className="w-3 h-3 text-rose-400" />
                    <span>AUDIO SEVERED</span>
                  </div>
                )}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg border-2 transition-all ${
                  isSafeMode
                    ? 'bg-rose-950/80 border-rose-500/60 text-rose-300'
                    : isCallActive
                    ? 'bg-slate-700 border-emerald-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}>
                  {isSafeMode ? <Lock className="w-6 h-6 text-rose-400" /> : <User className="w-6 h-6" />}
                </div>

                <div className="text-center mt-2">
                  <div className="text-xs font-semibold text-white">Agent Alice (You)</div>
                  <div className={`text-[10px] font-mono mt-0.5 ${isSafeMode ? 'text-rose-400 font-medium' : isCallActive ? 'text-emerald-400 font-medium' : 'text-slate-400'}`}>
                    {isSafeMode ? 'Line isolated server-side' : isCallActive ? 'Live audio active' : 'Ready'}
                  </div>
                </div>

                <div className="absolute bottom-2 left-2 text-[10px] font-mono bg-slate-950/90 px-2 py-0.5 rounded text-slate-400 border border-slate-800">
                  Agent Desktop
                </div>
              </div>

              {/* Tile 2: Customer Jane Doe / Voice AI */}
              <div className={`relative rounded-xl flex flex-col items-center justify-center p-4 border transition-all ${
                isSafeMode
                  ? 'bg-emerald-950/40 border-emerald-800/60'
                  : isCallActive
                  ? 'bg-slate-800/80 border-slate-700'
                  : 'bg-slate-800/40 border-slate-800'
              }`}>
                {isSafeMode && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-600/50 text-[10px] font-mono flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>VOICE AI ACTIVE</span>
                  </div>
                )}

                <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg border-2 transition-all ${
                  isSafeMode
                    ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                    : isCallActive
                    ? 'bg-slate-700 border-emerald-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}>
                  {isSafeMode ? <Bot className="w-6 h-6 text-emerald-300" /> : 'JD'}
                </div>

                <div className="text-center mt-2">
                  <div className="text-xs font-semibold text-white">
                    {isSafeMode ? 'VelatoAI Voice Assistant' : (callState?.customer_name || 'Jane Doe')}
                  </div>
                  <div className={`text-[10px] font-mono mt-0.5 ${isSafeMode ? 'text-emerald-300 font-medium' : isCallActive ? 'text-emerald-400 font-medium' : 'text-slate-400'}`}>
                    {isSafeMode ? 'Collecting card details safely' : isCallActive ? 'Connected • Live audio' : 'Awaiting connection'}
                  </div>
                </div>

                <div className="absolute bottom-2 left-2 text-[10px] font-mono bg-slate-950/90 px-2 py-0.5 rounded text-slate-400 border border-slate-800">
                  Customer Audio Line
                </div>
              </div>
            </div>

            {/* Bottom Zoom Call Control Strip */}
            <div className={`px-4 py-2 border-t flex items-center justify-between text-xs ${
              isSafeMode ? 'bg-slate-950 border-rose-900/40 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isSafeMode ? 'bg-rose-500' : isCallActive ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                <span className="font-mono text-[11px]">
                  {isSafeMode
                    ? 'ZERO-TRUST ENFORCED: Audio isolation server-side. Zero card digits recorded or visible.'
                    : isCallActive
                    ? 'Recording & live transcription active'
                    : 'System ready for inbound calls'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onOpenCustomerPhone}
                  className="hover:text-emerald-400 text-[11px] font-mono flex items-center gap-1 transition-colors"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Customer simulator</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card: Live Call Audio Transcript */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">Live call audio transcript</h4>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="text-[11px]">Auto-scroll</span>
                  <button
                    onClick={() => setAutoScroll(prev => !prev)}
                    className={`w-7 h-4 rounded-full p-0.5 transition-colors ${autoScroll ? 'bg-emerald-600' : 'bg-slate-200'}`}
                  >
                    <div className={`w-3 h-3 rounded-full bg-white shadow-2xs transform transition-transform ${autoScroll ? 'translate-x-3' : 'translate-x-0'}`} />
                  </button>
                </div>
                <button className="text-slate-400 hover:text-slate-700 p-0.5" title="Expand view">
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable Transcript Messages */}
            <div className="h-56 overflow-y-auto pr-2 flex flex-col gap-2.5 font-sans text-xs">
              {transcriptLines.map((line, idx) => {
                if (line.isGapMarker) {
                  return (
                    <div key={idx} className="my-1 py-1.5 px-3 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-mono text-rose-800 flex items-center justify-between">
                      <span>{line.text}</span>
                      <span className="text-[10px] text-rose-500">{line.ts}</span>
                    </div>
                  );
                }
                const isAgent = line.speaker === 'agent';
                return (
                  <div key={idx} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className={`flex items-center gap-1 font-semibold ${
                        isAgent ? 'text-emerald-700' : 'text-slate-700'
                      }`}>
                        {isAgent ? (
                          <>
                            <Bot className="w-3 h-3 text-emerald-600" />
                            <span>Agent Alice (Desk)</span>
                          </>
                        ) : (
                          <>
                            <User className="w-3 h-3 text-slate-600" />
                            <span>Customer (Jane Doe)</span>
                          </>
                        )}
                      </span>
                      <span className="font-mono text-slate-400">{line.ts}</span>
                    </div>
                    <div className={`p-2.5 rounded-xl leading-relaxed ${
                      isAgent
                        ? 'bg-emerald-50/70 border border-emerald-200 text-slate-900'
                        : 'bg-slate-50 border border-slate-200 text-slate-800'
                    }`}>
                      {line.text}
                    </div>
                  </div>
                );
              })}
              <div ref={transcriptEndRef} />
            </div>

            {/* Demo Prompts Bar */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
              <span className="text-[10px] uppercase font-mono text-slate-400 mr-1">Demo prompts:</span>
              <button
                onClick={() => handleSendUtterance("What is the annual pricing and discount rate?", 'customer')}
                className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[11px] text-slate-700 transition-colors flex items-center gap-1.5"
              >
                <Tag className="w-3 h-3 text-emerald-600" />
                <span>Pricing & discount guide</span>
              </button>
              <button
                onClick={() => handleSendUtterance("Can I get a refund if I cancel my subscription?", 'customer')}
                className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[11px] text-slate-700 transition-colors flex items-center gap-1.5"
              >
                <FileText className="w-3 h-3 text-slate-500" />
                <span>Refund policy guidelines</span>
              </button>
              <button
                onClick={() => handleSendUtterance("I want to pay with my credit card now", 'customer')}
                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-[11px] text-amber-800 transition-colors flex items-center gap-1.5"
              >
                <Lock className="w-3 h-3 text-amber-600" />
                <span>Ready to pay (Engage Safe Mode)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Support Copilot (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 shadow-xs">
            {/* Copilot Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Live Support Copilot</h3>
                  <div className="text-[10px] text-slate-500 font-mono">Real-time knowledge retrieval</div>
                </div>
              </div>
              <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-medium">
                Active
              </span>
            </div>

            {/* Blackout State during Safe Mode */}
            {isSafeMode ? (
              <div className="bg-rose-50 border border-rose-200 p-5 rounded-xl flex flex-col items-center justify-center text-center gap-3 py-8">
                <Shield className="w-10 h-10 text-rose-600" />
                <div>
                  <div className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                    Copilot blackout enforced
                  </div>
                  <p className="text-[11px] text-rose-700 mt-1 max-w-xs">
                    Zero-Trust Protocol Active: LLM inference, transcript ingest, and suggestions are paused until tokenization completes.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-600">Suggested action</span>
                  </div>
                  <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                    88% Match
                  </span>
                </div>

                {/* Suggestion Card */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed flex flex-col gap-2">
                  <div className="flex items-start gap-2.5">
                    <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      {isThinking ? (
                        <span className="text-slate-400 italic">Retrieving knowledge base guides...</span>
                      ) : (
                        activeSuggestion
                      )}
                    </div>
                  </div>

                  {activeSourceDoc && (
                    <div className="text-[10px] font-mono text-slate-500 border-t border-slate-200 pt-2 mt-1 flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-emerald-600" />
                      <span>Document citation:</span>
                      <span className="text-emerald-700 font-medium">{activeSourceDoc}</span>
                    </div>
                  )}
                </div>

                {/* Speak As Agent Action Button */}
                <button
                  onClick={handleInsertScriptAsAgent}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-xs"
                  title="Insert this recommendation directly into the agent script turn"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Insert into transcript (Speak as agent)</span>
                </button>
              </div>
            )}

            {/* Payment Token Receipt HUD (when token acquired) */}
            {paymentResult && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col gap-1.5 shadow-2xs">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Payment Token Acquired
                  </span>
                  <span className="font-mono text-[11px] bg-white border border-emerald-200 px-2 py-0.5 rounded text-emerald-800">
                    {paymentResult.brand || 'Visa'}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-700 flex justify-between pt-1">
                  <span className="text-slate-500">Card number:</span>
                  <span className="font-medium">**** **** **** {paymentResult.last4 || '4242'}</span>
                </div>
                <div className="text-xs font-mono text-slate-700 flex justify-between">
                  <span className="text-slate-500">Gateway token:</span>
                  <span className="text-emerald-700 font-medium break-all">{paymentResult.token}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
