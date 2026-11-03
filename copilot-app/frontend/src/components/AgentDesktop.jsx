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
  const [chatSpeaker, setChatSpeaker] = useState('customer');
  const [transcriptLines, setTranscriptLines] = useState([
    { speaker: 'customer', text: 'Hi, I need help with my subscription billing...', ts: '11:38:35' },
    { speaker: 'agent',    text: 'Of course! I can help with that. Could you confirm your account email?', ts: '11:38:53' },
    { speaker: 'customer', text: "Sure, it's jane.doe@example.com. I wanted to upgrade and pay for the annual plan.", ts: '11:39:08' },
  ]);
  const [liveSuggestion, setLiveSuggestion] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
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
      channel = new BroadcastChannel('zytasafe_call_mesh');
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
        const ch = new BroadcastChannel('zytasafe_call_mesh');
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
        <div className="bg-[#0B261B] border-2 border-[#00E676] rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse shadow-lg">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-[#00E676] text-[#070B0A] flex items-center justify-center font-bold">
              <PhoneIncoming className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#00E676]">
                  Incoming Live Support Call
                </span>
                <span className="w-2 h-2 rounded-full bg-[#00E676] animate-ping" />
              </div>
              <h3 className="text-base font-bold text-white">
                {incomingCall.caller_name || 'Jane Doe'} • <span className="font-normal text-xs text-[#C0D0CB]">{incomingCall.plan || 'Annual Cloud AI Plan ($49.99/mo)'}</span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                soundFx.stopIncomingRing();
                if (onAcceptCall) onAcceptCall();
              }}
              className="px-6 py-2.5 rounded-xl bg-[#00E676] hover:bg-[#00C853] text-[#070B0A] font-bold text-xs flex items-center gap-2 transition-all shadow-md active:scale-98"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Accept Call</span>
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
              className="px-4 py-2.5 rounded-xl bg-[#1A1114] hover:bg-[#28181D] text-rose-400 border border-rose-500/30 font-semibold text-xs transition-all flex items-center gap-1.5 active:scale-98"
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
        <div className="lg:col-span-5 bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isSafeMode ? 'bg-rose-500 animate-pulse' : isCallActive ? 'bg-[#00E676]' : 'bg-[#768782]'}`} />
              <span className="text-xs font-medium text-[#768782]">Agent Screen</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${
                isSafeMode
                  ? 'bg-rose-950 text-rose-300 border-rose-500/40'
                  : isCallActive
                  ? 'bg-[#0B2A1E] text-[#00E676] border-[#165038]'
                  : 'bg-[#111A18] text-[#768782] border-[#1A2824]'
              }`}>
                {isSafeMode ? "Severed Line" : isCallActive ? "Control Plane Active" : "Standby"}
              </span>
              {isCallActive && (
                <button
                  onClick={onHangupCall}
                  className="p-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 transition-colors"
                  title="End Call"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#131E1B] border border-[#1E302B] flex items-center justify-center text-[#00E676]">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#EDF3F0]">
                  {isCallActive ? `Call with ${callState?.customer_name || 'Jane Doe'}` : "Line on Standby"}
                </h3>
                <p className="text-xs text-[#768782] mt-0.5">
                  {isCallActive ? (
                    <>Account: Premium Enterprise • <span className="font-mono text-[#00E676]">Duration: {formatDuration(seconds)}</span></>
                  ) : (
                    <span>Ready for incoming call from customer</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pl-2">
              {isSafeMode ? (
                <div className="flex items-center gap-1.5 text-rose-400 font-mono text-xs">
                  <MicOff className="w-4 h-4 animate-pulse" />
                  <span className="hidden sm:inline">Audio Severed</span>
                </div>
              ) : isCallActive ? (
                <div className="flex items-center gap-1.5 text-[#00E676] font-mono text-xs">
                  <div className="flex items-center gap-0.5">
                    <span className="w-0.5 h-3 bg-[#00E676] animate-pulse"></span>
                    <span className="w-0.5 h-4 bg-[#00E676] animate-pulse" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-0.5 h-2 bg-[#00E676] animate-pulse" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span className="hidden sm:inline">Bidirectional Live Audio</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#768782] hidden sm:inline">Line Ready</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSimulateCall) onSimulateCall();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#0E241B] hover:bg-[#16382A] text-[#00E676] border border-[#165038] text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                    title="Simulate incoming customer call to test Accept Call flow"
                  >
                    <PhoneIncoming className="w-3.5 h-3.5 animate-pulse" />
                    <span>Simulate Call</span>
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
          className={`lg:col-span-3 rounded-2xl p-4 flex items-center justify-between border cursor-pointer transition-all select-none ${
            isSafeMode
              ? 'bg-[#181013] border-rose-500/50 shadow-md'
              : 'bg-[#0E1614] border-[#1A2824] hover:border-[#233B34]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-colors ${
              isSafeMode
                ? 'bg-rose-950 text-rose-400 border-rose-500/40'
                : 'bg-[#0B261B] text-[#00E676] border-[#174D36]'
            }`}>
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold tracking-wider uppercase text-[#EDF3F0]">PCI SAFE MODE</div>
              <div className="text-[11px] text-[#768782]">
                {isSafeMode ? "Audio isolated at server" : "Ready to intercept"}
              </div>
            </div>
          </div>

          {/* Toggle Switch */}
          <div
            role="switch"
            aria-checked={isSafeMode}
            className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 flex items-center ${
              isSafeMode ? 'bg-[#00E676] justify-end' : 'bg-[#1A2824] justify-start'
            }`}
            title={isSafeMode ? "Safe Mode is Active. Click to cancel." : "Click to engage PCI Safe Mode."}
          >
            <div className={`w-6 h-6 rounded-full shadow-sm transform transition-transform duration-300 flex items-center justify-center ${
              isSafeMode ? 'bg-[#070B0A] text-[#00E676]' : 'bg-[#4B5E58] text-[#0E1614]'
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
        <div className="lg:col-span-4 bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isCallActive ? 'bg-[#00E676]' : 'bg-[#768782]'}`} />
              <span className="text-xs font-medium text-[#768782]">Customer Caller</span>
            </div>
            <button
              onClick={onOpenCustomerPhone}
              className="text-xs font-mono text-[#EDF3F0] hover:text-[#00E676] flex items-center gap-1 bg-[#131E1B] px-2.5 py-0.5 rounded-lg border border-[#1E302B] transition-colors"
              title="Open responsive Customer Phone simulator"
            >
              <span>{callState?.customer_name || 'Jane Doe'}</span>
              <ChevronDown className="w-3 h-3 text-[#768782]" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#0B261B] border border-[#174D36] flex items-center justify-center text-[#00E676]">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#EDF3F0]">Call with Support</h3>
                <p className="text-xs text-[#768782]">
                  {isSafeMode ? (
                    <span className="text-[#00E676] font-mono">Connected to Voice AI (Safe Mode)</span>
                  ) : isCallActive ? (
                    "Connected to Agent Alice"
                  ) : (
                    "Line on Standby"
                  )}
                </p>
              </div>
            </div>

            {/* Live Audio Waveform */}
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[#768782]" />
              <div className="flex items-center gap-0.5">
                {[4, 8, 14, 10, 6, 12, 16, 9, 5, 11, 7, 3].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}px` }}
                    className={`w-0.5 rounded-full transition-all ${
                      isSafeMode ? 'bg-rose-500 animate-pulse' : isCallActive ? 'bg-[#00E676]' : 'bg-[#1A2824]'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: Main Workspace (Billing & Recording + Transcript | Copilot) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Billing Details, Recording Player, Live Transcript (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Card: Order & Subscription Details */}
          <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1A2824] mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#00E676]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#EDF3F0]">Order & Subscription Details</h4>
              </div>
              <span className="text-[11px] font-mono text-[#768782] flex items-center gap-1 hover:text-[#00E676] cursor-pointer">
                <span>Invoice #INV-2026-891</span>
                <ExternalLink className="w-3 h-3" />
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2 text-xs text-[#EDF3F0]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E676]" />
                <span>Annual Cloud AI Plan (Tier 1)</span>
              </div>
              <span className="text-xs font-mono text-[#EDF3F0] font-medium">$49.99 / mo</span>
            </div>

            <div className="flex items-center justify-between pt-2 mt-2 border-t border-[#1A2824]">
              <span className="text-xs text-[#768782]">Total Due Now</span>
              <span className="text-base font-bold font-mono text-[#00E676]">$49.99</span>
            </div>

            {/* Informational Guidance Box */}
            <div className="mt-3 p-2.5 rounded-xl bg-[#0B2117] border border-[#154531] flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
              <p className="text-xs text-[#C0D0CB] leading-relaxed">
                When customer indicates readiness to pay, inform them to wait for the tone, then engage <strong className="text-[#00E676]">PCI Safe Mode</strong>. Recording pauses instantly with zero cardholder data captured.
              </p>
            </div>
          </div>

          {/* Card: Live Call Recording (For QA & Compliance) */}
          <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4">
            <div className="flex items-center justify-between pb-2 mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isSafeMode ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'}`} />
                <span className="text-xs font-semibold text-[#EDF3F0]">
                  Live Call Recording <span className="text-[#768782] font-normal">(For QA & Compliance)</span>
                </span>
                {isCurrentlyInPciGap ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-500/40 animate-pulse">
                    PCI GAP ACTIVE • AUDIO WITHHELD
                  </span>
                ) : timelineData?.has_pci_gap ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0B261B] text-[#00E676] border border-[#165038]">
                    PCI GAP ENFORCED (ZERO-TRUST)
                  </span>
                ) : null}
              </div>
              <span className="text-[11px] font-mono text-[#768782] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E676]" />
                <span>Server: US-East-1</span>
              </span>
            </div>

            {/* Scrub Bar & Controls */}
            <div className="flex items-center gap-3 mt-1">
              <button
                onClick={toggleRecordingPlay}
                className="w-8 h-8 rounded-lg bg-[#131E1B] hover:bg-[#1E302B] text-[#00E676] flex items-center justify-center transition-colors shrink-0"
                title={isRecordingPlaying ? "Pause Audio Preview" : "Play Audio Preview"}
              >
                {isRecordingPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              {/* Scrubber Slider */}
              <div className="flex-1 flex flex-col gap-1 relative">
                <input
                  type="range"
                  min="0"
                  max={effectiveRecordingDuration}
                  value={recordingTime}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setRecordingTime(val);
                    if (recordingAudioElRef.current) {
                      recordingAudioElRef.current.currentTime = val;
                    }
                  }}
                  className="w-full accent-[#00E676] bg-[#1A2824] h-1.5 rounded-full cursor-pointer appearance-none"
                  style={{
                    background: `linear-gradient(to right, #00E676 0%, #00E676 ${(recordingTime / effectiveRecordingDuration) * 100}%, #1A2824 ${(recordingTime / effectiveRecordingDuration) * 100}%, #1A2824 100%)`
                  }}
                />
              </div>

              <span className="text-[11px] font-mono text-[#768782] shrink-0">
                {formatDuration(recordingTime)} / {formatDuration(effectiveRecordingDuration)}
              </span>

              <button
                onClick={() => {
                  if (recordingAudioElRef.current) {
                    recordingAudioElRef.current.muted = !recordingAudioElRef.current.muted;
                  }
                  if (isRecordingPlaying) {
                    setIsRecordingPlaying(false);
                    if (recordingAudioElRef.current) recordingAudioElRef.current.pause();
                  }
                }}
                className="text-[#768782] hover:text-[#EDF3F0] transition-colors p-1"
                title="Mute / Pause Audio"
              >
                <Volume2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (recordedAudioUrl) {
                    const a = document.createElement('a');
                    a.href = recordedAudioUrl;
                    a.download = `compliant_call_recording_${callState?.call_id || '01'}.webm`;
                    a.click();
                  } else {
                    const blob = new Blob([JSON.stringify({
                      call_id: callState?.call_id,
                      duration_seconds: seconds,
                      pci_safe_mode_engaged: isSafeMode,
                      audio_manifest: "Compliant Zero-Trust - PCI Segment Withheld",
                      token: paymentResult?.token || null
                    }, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `audit_manifest_${callState?.call_id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }
                }}
                className="text-[#768782] hover:text-[#00E676] transition-colors p-1"
                title={recordedAudioUrl ? "Download Compliant Audio Recording (.webm)" : "Export Compliant Audio Manifest"}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card: Live Call Audio Transcript */}
          <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#1A2824]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00E676]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#EDF3F0]">Live Call Audio Transcript</h4>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-[#768782]">
                  <span className="text-[11px]">Auto-scroll</span>
                  <button
                    onClick={() => setAutoScroll(prev => !prev)}
                    className={`w-7 h-4 rounded-full p-0.5 transition-colors ${autoScroll ? 'bg-[#00E676]' : 'bg-[#1A2824]'}`}
                  >
                    <div className={`w-3 h-3 rounded-full bg-[#070B0A] transform transition-transform ${autoScroll ? 'translate-x-3' : 'translate-x-0'}`} />
                  </button>
                </div>
                <button className="text-[#768782] hover:text-[#EDF3F0] p-0.5" title="Expand View">
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable Transcript Messages */}
            <div className="h-56 overflow-y-auto pr-2 flex flex-col gap-2.5 font-sans text-xs">
              {transcriptLines.map((line, idx) => {
                if (line.isGapMarker) {
                  return (
                    <div key={idx} className="my-1 py-1.5 px-3 rounded-lg bg-[#181215] border border-rose-500/30 text-[11px] font-mono text-rose-300 flex items-center justify-between">
                      <span>{line.text}</span>
                      <span className="text-[10px] text-[#768782]">{line.ts}</span>
                    </div>
                  );
                }
                const isAgent = line.speaker === 'agent';
                return (
                  <div key={idx} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-[10px] text-[#768782]">
                      <span className={`flex items-center gap-1 font-semibold ${
                        isAgent ? 'text-[#00E676]' : 'text-[#34D399]'
                      }`}>
                        {isAgent ? (
                          <>
                            <Bot className="w-3 h-3 text-[#00E676]" />
                            <span>Agent Alice (Desk)</span>
                          </>
                        ) : (
                          <>
                            <User className="w-3 h-3 text-[#34D399]" />
                            <span>Customer (Jane Doe)</span>
                          </>
                        )}
                      </span>
                      <span className="font-mono">{line.ts}</span>
                    </div>
                    <div className={`p-2.5 rounded-xl leading-relaxed ${
                      isAgent
                        ? 'bg-[#10241C] border border-[#194532] text-[#EDF3F0]'
                        : 'bg-[#111A18] border border-[#1A2A25] text-[#D2DED9]'
                    }`}>
                      {line.text}
                    </div>
                  </div>
                );
              })}
              <div ref={transcriptEndRef} />
            </div>

            {/* Demo Prompts Bar */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] uppercase font-mono text-[#768782] mr-1">Demo Prompts:</span>
              <button
                onClick={() => handleSendUtterance("What is the annual pricing and discount rate?", 'customer')}
                className="px-2.5 py-1 rounded-lg bg-[#111C19] hover:bg-[#182B24] border border-[#1E332B] text-[11px] text-[#00E676] transition-colors flex items-center gap-1.5"
              >
                <Tag className="w-3 h-3 text-[#00E676]" />
                <span>Pricing & discount guide</span>
              </button>
              <button
                onClick={() => handleSendUtterance("Can I get a refund if I cancel my subscription?", 'customer')}
                className="px-2.5 py-1 rounded-lg bg-[#111C19] hover:bg-[#182B24] border border-[#1E332B] text-[11px] text-[#768782] hover:text-[#EDF3F0] transition-colors flex items-center gap-1.5"
              >
                <FileText className="w-3 h-3 text-[#34D399]" />
                <span>Refund policy guidelines</span>
              </button>
              <button
                onClick={() => handleSendUtterance("I want to pay with my credit card now", 'customer')}
                className="px-2.5 py-1 rounded-lg bg-[#111C19] hover:bg-[#182B24] border border-[#1E332B] text-[11px] text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5"
              >
                <Lock className="w-3 h-3 text-amber-400" />
                <span>Ready to pay (Engage Safe Mode)</span>
              </button>
            </div>

            {/* Sender Selector Pill Bar */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] uppercase font-mono text-[#768782]">Speak As:</span>
              <div className="flex items-center gap-1 bg-[#111C19] p-0.5 rounded-lg border border-[#1A2824]">
                <button
                  type="button"
                  onClick={() => setChatSpeaker('customer')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all flex items-center gap-1 ${
                    chatSpeaker === 'customer'
                      ? 'bg-[#34D399] text-[#070B0A] shadow-sm font-bold'
                      : 'text-[#768782] hover:text-[#EDF3F0]'
                  }`}
                >
                  <User className="w-3 h-3" />
                  <span>Customer (Jane)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChatSpeaker('agent')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all flex items-center gap-1 ${
                    chatSpeaker === 'agent'
                      ? 'bg-[#00E676] text-[#070B0A] shadow-sm font-bold'
                      : 'text-[#768782] hover:text-[#EDF3F0]'
                  }`}
                >
                  <Bot className="w-3 h-3" />
                  <span>Agent (Alice)</span>
                </button>
              </div>
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (inputMessage.trim()) {
                  handleSendUtterance(inputMessage, chatSpeaker);
                  setInputMessage('');
                }
              }}
              className="flex items-center gap-2 mt-0.5"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={
                  chatSpeaker === 'customer'
                    ? "Type customer inquiry (e.g. Can I get a refund?)..."
                    : "Type agent response..."
                }
                className="flex-1 bg-[#131E1B] border border-[#1A2824] focus:border-[#00E676] text-xs text-[#EDF3F0] rounded-xl px-3 py-2.5 outline-none transition-colors placeholder:text-[#4B5A55]"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="p-2.5 rounded-xl bg-[#00E676] hover:bg-[#00C853] disabled:opacity-30 text-[#070B0A] font-bold transition-all shadow-md active:scale-98"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Live Support Copilot (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-5 flex flex-col gap-4">
            {/* Copilot Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1A2824]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#0B261B] border border-[#174D36] flex items-center justify-center text-[#00E676]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#EDF3F0]">Live Support Copilot</h3>
                  <div className="text-[10px] text-[#768782] font-mono">Real-Time Knowledge Retrieval</div>
                </div>
              </div>
              <span className="text-[10px] font-mono bg-[#0B2A1E] text-[#00E676] border border-[#165038] px-2.5 py-0.5 rounded-full">
                Muse Spark Open
              </span>
            </div>

            {/* Blackout State during Safe Mode */}
            {isSafeMode ? (
              <div className="bg-[#181013] border border-rose-500/40 p-5 rounded-xl flex flex-col items-center justify-center text-center gap-3 py-8">
                <Shield className="w-10 h-10 text-rose-400 animate-pulse" />
                <div>
                  <div className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                    Copilot Blackout Enforced
                  </div>
                  <p className="text-[11px] text-rose-400/80 mt-1 max-w-xs">
                    Zero-Trust Protocol Active: LLM inference, transcript ingest, and suggestions are severed until tokenization completes.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-[#768782]">
                    <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
                    <span className="text-[10px] uppercase font-mono tracking-wider font-semibold">Real-Time Suggested Action</span>
                  </div>
                  <span className="text-[10px] font-mono bg-[#0B2A1E] text-[#00E676] border border-[#165038] px-2 py-0.5 rounded-full">
                    88% Match
                  </span>
                </div>

                {/* Suggestion Card */}
                <div className="p-4 rounded-xl bg-[#111C19] border border-[#1A2C27] text-xs text-[#EDF3F0] leading-relaxed flex flex-col gap-2">
                  <div className="flex items-start gap-2.5">
                    <Lightbulb className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
                    <div>
                      {isThinking ? (
                        <span className="text-[#768782] italic">Grounding against company documents via Muse Spark Open...</span>
                      ) : (
                        activeSuggestion
                      )}
                    </div>
                  </div>

                  {activeSourceDoc && (
                    <div className="text-[10px] font-mono text-[#768782] border-t border-[#1C2C28] pt-2 mt-1 flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-[#34D399]" />
                      <span>Document Citation:</span>
                      <span className="text-[#34D399]">{activeSourceDoc}</span>
                    </div>
                  )}
                </div>

                {/* Speak As Agent Action Button */}
                <button
                  onClick={handleInsertScriptAsAgent}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0B2A1E] hover:bg-[#12402E] border border-[#165038] text-[#00E676] font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                  title="Insert this recommendation directly into the agent script turn"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Speak As Agent (Insert into Call Transcript)</span>
                </button>
              </div>
            )}

            {/* Payment Token Receipt HUD (when token acquired) */}
            {paymentResult && (
              <div className="p-3.5 rounded-xl bg-[#0B261B] border border-[#174D36] flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#00E676]">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Payment Token Acquired
                  </span>
                  <span className="font-mono text-[11px] bg-[#131E1B] px-2 py-0.5 rounded text-white">
                    {paymentResult.brand || 'Visa'}
                  </span>
                </div>
                <div className="text-xs font-mono text-[#EDF3F0] flex justify-between pt-1">
                  <span className="text-[#768782]">Card Number:</span>
                  <span>**** **** **** {paymentResult.last4 || '4242'}</span>
                </div>
                <div className="text-xs font-mono text-[#EDF3F0] flex justify-between">
                  <span className="text-[#768782]">Gateway Token:</span>
                  <span className="text-[#34D399] break-all">{paymentResult.token}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}