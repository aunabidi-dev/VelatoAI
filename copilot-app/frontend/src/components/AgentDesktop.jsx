import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, Lock, Mic, MicOff, Volume2, VolumeX, Play, Pause,
  Download, Send, Sparkles, Lightbulb, FileText, ExternalLink,
  Info, Maximize2, RotateCcw, PhoneCall, ChevronDown, CheckCircle2,
  Bot, AlertTriangle, ArrowRight, User, Tag, XCircle
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
}) {
  const isSafeMode = Boolean(callState?.safe_mode_active || callState?.agent_isolated);
  const [seconds, setSeconds] = useState(125); // 02:05 default matching mockup
  const [autoScroll, setAutoScroll] = useState(true);
  const [isRecordingPlaying, setIsRecordingPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcriptLines, setTranscriptLines] = useState([
    { speaker: 'customer', text: 'Hi, I need help with my subscription billing...', ts: '11:38:35' },
    { speaker: 'agent',    text: 'Of course! I can help with that. Could you confirm your account email?', ts: '11:38:53' },
    { speaker: 'customer', text: "Sure, it's jane.doe@example.com. I wanted to upgrade and pay for the annual plan.", ts: '11:39:08' },
  ]);
  const [liveSuggestion, setLiveSuggestion] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const transcriptEndRef = useRef(null);
  const recTimerRef = useRef(null);

  // Call duration ticker
  useEffect(() => {
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (autoScroll) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcriptLines, autoScroll]);

  // WebSocket message listener for live suggestions
  useEffect(() => {
    const ws = wsRef?.current;
    if (!ws) return;

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
              confidence: msg.confidence ?? 0.85,
              model: msg.model || 'Muse Spark Open (Baseten)',
              redacted: msg.redacted || false,
              blackout: false,
            });
          }
        }
      } catch (e) { }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [wsRef?.current]);

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

  const handleSendUtterance = async (text, speaker = 'customer') => {
    if (!text.trim()) return;
    const now = new Date();
    const tsStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;

    setTranscriptLines(prev => [...prev, { speaker, text: text.trim(), ts: tsStr }]);

    // Only customer speech triggers the live copilot suggestion
    if (speaker === 'customer') {
      setIsThinking(true);
      try {
        const res = await fetch('/api/copilot/transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call_id: callState.call_id || 'call_meta_hackathon_01',
            speaker: 'customer',
            text: text.trim(),
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
              confidence: data.confidence ?? 0.85,
              model: data.model || 'Muse Spark Open (Baseten)',
              redacted: data.redacted || false,
              blackout: false,
            });
          }
        }
      } catch (e) {
        setIsThinking(false);
      }
    }
  };

  const handleInsertScriptAsAgent = () => {
    const textToInsert = liveSuggestion?.suggestion || copilotSuggestion;
    if (textToInsert && !copilotBlackout) {
      handleSendUtterance(textToInsert, 'agent');
    }
  };

  // Recording preview playback toggle with Web Audio synthesizer
  const toggleRecordingPlay = () => {
    if (isRecordingPlaying) {
      setIsRecordingPlaying(false);
      soundFx.stopRecordedAudioHum();
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    } else {
      setIsRecordingPlaying(true);
      if (!isSafeMode) {
        soundFx.startRecordedAudioHum();
      }
      recTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= seconds) {
            setIsRecordingPlaying(false);
            soundFx.stopRecordedAudioHum();
            clearInterval(recTimerRef.current);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  // Mute audio during Safe Mode if recording is playing
  useEffect(() => {
    if (isRecordingPlaying) {
      if (isSafeMode) {
        soundFx.stopRecordedAudioHum();
      } else {
        soundFx.startRecordedAudioHum();
      }
    }
  }, [isSafeMode, isRecordingPlaying]);

  // Clean up Web Audio on unmount
  useEffect(() => {
    return () => {
      soundFx.stopRecordedAudioHum();
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, []);

  const activeSuggestion = liveSuggestion?.suggestion || copilotSuggestion;
  const activeSourceDoc = liveSuggestion?.sourceDocTitle || null;

  return (
    <div className="flex flex-col gap-5 w-full max-w-[1400px] mx-auto pb-8">
      {/* ── ROW 1: Top 3 Status & Action Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Card 1: Agent Screen (5 cols) */}
        <div className="lg:col-span-5 bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isSafeMode ? 'bg-rose-500 animate-pulse' : 'bg-[#00E676]'}`} />
              <span className="text-xs font-medium text-[#768782]">Agent Screen</span>
            </div>
            <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${isSafeMode ? 'bg-rose-950 text-rose-300 border-rose-500/40' : 'bg-[#0B2A1E] text-[#00E676] border-[#165038]'}`}>
              {isSafeMode ? "Severed Line" : "Control Plane"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#131E1B] border border-[#1E302B] flex items-center justify-center text-[#00E676]">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#EDF3F0]">Call with {callState?.customer_name || 'Jane Doe'}</h3>
                <p className="text-xs text-[#768782] mt-0.5">
                  Account: Premium Enterprise • <span className="font-mono text-[#00E676]">Duration: {formatDuration(seconds)}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pl-2">
              {isSafeMode ? (
                <div className="flex items-center gap-1.5 text-rose-400 font-mono text-xs">
                  <MicOff className="w-4 h-4 animate-pulse" />
                  <span className="hidden sm:inline">Audio Severed</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[#00E676] font-mono text-xs">
                  <div className="flex items-center gap-0.5">
                    <span className="w-0.5 h-3 bg-[#00E676] animate-pulse"></span>
                    <span className="w-0.5 h-4 bg-[#00E676] animate-pulse" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-0.5 h-2 bg-[#00E676] animate-pulse" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span className="hidden sm:inline">Bidirectional Audio Active</span>
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
              ? 'bg-[#181013] border-rose-500/50'
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
              <span className="w-2 h-2 rounded-full bg-[#00E676]" />
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
                  ) : (
                    "Connected to Agent Alice"
                  )}
                </p>
              </div>
            </div>

            {/* Simulated Live Audio Waveform */}
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[#768782]" />
              <div className="flex items-center gap-0.5">
                {[4, 8, 14, 10, 6, 12, 16, 9, 5, 11, 7, 3].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}px` }}
                    className={`w-0.5 rounded-full transition-all ${
                      isSafeMode ? 'bg-[#00E676] animate-pulse' : 'bg-[#00E676]/80'
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
                When customer indicates readiness to pay, inform them to wait for the beep, then click <strong className="text-[#00E676]">PCI Safe Mode</strong>.
              </p>
            </div>
          </div>

          {/* Card: Live Call Recording (For QA & Compliance) */}
          <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4">
            <div className="flex items-center justify-between pb-2 mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isSafeMode ? 'bg-amber-400' : 'bg-rose-500'}`} />
                <span className="text-xs font-semibold text-[#EDF3F0]">
                  Live Call Recording <span className="text-[#768782] font-normal">(For QA & Compliance)</span>
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#768782] flex items-center gap-1">
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
                  max={seconds || 125}
                  value={recordingTime}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setRecordingTime(val);
                  }}
                  className="w-full accent-[#00E676] bg-[#1A2824] h-1.5 rounded-full cursor-pointer appearance-none"
                  style={{
                    background: `linear-gradient(to right, #00E676 0%, #00E676 ${(recordingTime / (seconds || 1)) * 100}%, #1A2824 ${(recordingTime / (seconds || 1)) * 100}%, #1A2824 100%)`
                  }}
                />
              </div>

              <span className="text-[11px] font-mono text-[#768782] shrink-0">
                {formatDuration(recordingTime)} / {formatDuration(seconds)}
              </span>

              <button
                onClick={() => {
                  if (isRecordingPlaying) {
                    soundFx.stopRecordedAudioHum();
                    setIsRecordingPlaying(false);
                  }
                }}
                className="text-[#768782] hover:text-[#EDF3F0] transition-colors p-1"
                title="Mute / Stop Audio"
              >
                <Volume2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
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
                }}
                className="text-[#768782] hover:text-[#00E676] transition-colors p-1"
                title="Export Compliant Audio Manifest"
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
            <div className="h-48 overflow-y-auto pr-2 flex flex-col gap-2.5 font-sans text-xs">
              {transcriptLines.map((line, idx) => (
                <div key={idx} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-[10px] text-[#768782]">
                    <span className={line.speaker === 'agent' ? 'text-[#00E676] font-semibold' : 'text-[#34D399] font-medium'}>
                      {line.speaker === 'agent' ? 'Agent' : 'Customer'}
                    </span>
                    <span className="font-mono">{line.ts}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl leading-relaxed ${
                    line.speaker === 'agent'
                      ? 'bg-[#10241C] border border-[#194532] text-[#EDF3F0]'
                      : 'bg-[#111A18] border border-[#1A2A25] text-[#D2DED9]'
                  }`}>
                    {line.text}
                  </div>
                </div>
              ))}
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
                onClick={() => handleSendUtterance("I want to cancel my subscription right now", 'customer')}
                className="px-2.5 py-1 rounded-lg bg-[#111C19] hover:bg-[#182B24] border border-[#1E332B] text-[11px] text-[#768782] hover:text-[#EDF3F0] transition-colors flex items-center gap-1.5"
              >
                <XCircle className="w-3 h-3 text-rose-400" />
                <span>Cancellation protocol</span>
              </button>
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (inputMessage.trim()) {
                  handleSendUtterance(inputMessage, 'customer');
                  setInputMessage('');
                }
              }}
              className="flex items-center gap-2 mt-1"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask a question or send a response template..."
                className="flex-1 bg-[#131E1B] border border-[#1A2824] focus:border-[#00E676] text-xs text-[#EDF3F0] rounded-xl px-3 py-2.5 outline-none transition-colors placeholder:text-[#4B5A55]"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="w-9 h-9 rounded-xl bg-[#00E676] hover:bg-[#00C853] disabled:opacity-40 text-[#070B0A] flex items-center justify-center transition-all shrink-0 font-bold"
              >
                <ArrowRight className="w-4 h-4" />
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
                    85% Match
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
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0B2A1E] hover:bg-[#12402E] border border-[#165038] text-[#00E676] font-semibold text-xs flex items-center justify-center gap-2 transition-all"
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
