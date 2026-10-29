import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, ShieldAlert, ShieldCheck, Mic, MicOff, Lock, AlertCircle,
  FileText, Bot, CheckCircle2, MessageSquare, Zap, ChevronRight, Send, Sparkles
} from 'lucide-react';
import { soundFx } from './AudioSynthesizer';

/**
 * AgentDesktop — Phase 3 Enhanced
 * 
 * Phase 3 additions:
 *  - Live transcript feed: shows rolling customer & agent utterances
 *  - Structured copilot suggestions: suggestion + source doc citation + confidence bar
 *  - Interactive prompt pills for instant testing (Pricing, Refund, Cancellation, Payment)
 *  - One-click "Speak As Agent" button to insert copilot recommendation into transcript
 *  - Real-time HTTP + WebSocket dual-channel updates
 */
export default function AgentDesktop({
  callState,
  onTriggerSafeMode,
  copilotSuggestion,
  copilotBlackout,
  paymentResult,
  auditMarkers,
  wsRef,
}) {
  const [seconds, setSeconds] = useState(48);

  const [transcriptLines, setTranscriptLines] = useState([
    { speaker: 'customer', text: 'Hi, I need help with my subscription billing.', ts: Date.now() - 45000 },
    { speaker: 'agent',    text: 'Of course! I can help with that. Could you confirm your account email?', ts: Date.now() - 30000 },
    { speaker: 'customer', text: 'Sure, it\'s jane.doe@example.com. I wanted to upgrade and pay for the annual plan.', ts: Date.now() - 15000 },
  ]);
  const [liveSuggestion, setLiveSuggestion] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [demoInput, setDemoInput] = useState('');
  const transcriptEndRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptLines]);

  // WebSocket message listener
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
              confidence: msg.confidence ?? 0,
              model: msg.model || 'Local Copilot',
              redacted: msg.redacted || false,
              blackout: false,
            });
          }
        }
      } catch (e) { /* ignore parse errors */ }
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

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatTs = (ts) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
  };

  // Send an utterance to the live call & trigger copilot
  const handleSendTranscript = async (text, speaker = 'customer') => {
    if (!text || !text.trim()) return;
    const cleanText = text.trim();
    const line = { speaker, text: cleanText, ts: Date.now() };
    setTranscriptLines(prev => [...prev.slice(-19), line]);
    setDemoInput('');

    // If the agent is speaking, we just append to transcript without re-querying copilot
    if (speaker === 'agent') {
      return;
    }

    // If the customer utterance has no letters or numbers (e.g., just "?" or punctuation),
    // keep the current copilot suggestion active rather than resetting to fallback.
    const hasAlphanumeric = /[a-zA-Z0-9]/.test(cleanText);
    if (!hasAlphanumeric) {
      return;
    }

    setIsThinking(true);

    // 1. Send via WebSocket if connected
    const ws = wsRef?.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'TRANSCRIPT_CHUNK',
        text: cleanText,
        speaker: 'customer',
        call_id: callState.call_id,
      }));
    }

    // 2. Also call HTTP endpoint for immediate guaranteed local response
    try {
      const res = await fetch('/api/copilot/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callState.call_id, speaker: 'customer', text: cleanText }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsThinking(false);
        if (!data.blackout && data.suggestion) {
          setLiveSuggestion({
            suggestion: data.suggestion,
            sourceDocTitle: data.source_doc_title || null,
            confidence: data.confidence ?? 0,
            model: data.model || 'Local Copilot',
            redacted: data.redacted || false,
            blackout: false,
          });
        }
      }
    } catch (e) {
      setIsThinking(false);
    }
  };

  const activeSuggestion = liveSuggestion?.suggestion || copilotSuggestion;
  const activeSourceDoc = liveSuggestion?.sourceDocTitle || null;
  const activeModel = liveSuggestion?.model || 'Local Copilot';
  const activeConfidence = liveSuggestion?.confidence ?? 0.85;

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
      {/* Top Header Card */}
      <div className="glass-panel p-5 flex items-center justify-between border-slate-800">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={`w-3 h-3 rounded-full ${callState.agent_isolated ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400 animate-ping'}`} />
            <div className={`w-3 h-3 rounded-full absolute top-0 left-0 ${callState.agent_isolated ? 'bg-rose-500' : 'bg-emerald-400'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">Call with Jane Doe</h2>
              <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                {callState.call_id || 'call_live_01'}
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Account: Premium Enterprise</span> •{' '}
              <span className="font-mono text-cyan-400 font-medium">Duration: {formatTime(seconds)}</span>
            </p>
          </div>
        </div>

        {/* Audio Route Indicator */}
        <div className="flex items-center gap-3">
          {callState.agent_isolated ? (
            <div className="flex items-center gap-2 bg-rose-950/80 border border-rose-500/40 text-rose-300 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <MicOff className="w-4 h-4 text-rose-400 animate-pulse" />
              <span>AGENT AUDIO SEVERED (ZERO TRANSMIT)</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <Mic className="w-4 h-4 text-emerald-400" />
              <span>BIDIRECTIONAL AUDIO ACTIVE</span>
            </div>
          )}

          {/* Safe Mode Trigger Button */}
          {!callState.agent_isolated && !paymentResult && (
            <button
              onClick={() => {
                soundFx.playSafeModeBeep();
                onTriggerSafeMode();
              }}
              className="btn-safe-mode"
              title="Isolate audio line and hand over to secure AI payment agent"
            >
              <Shield className="w-5 h-5 fill-rose-100/20" />
              <span>PCI Safe Mode</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: CRM Details & Live Transcript */}
        <div className="md:col-span-2 flex flex-col gap-6">
          {/* Isolation HUD when in Safe Mode */}
          {callState.agent_isolated ? (
            <div className="glass-panel-isolated p-6 flex flex-col items-center justify-center text-center gap-4 py-12 relative overflow-hidden">
              <div className="absolute top-2 right-3 text-[10px] font-mono tracking-widest text-rose-400/80 uppercase">
                PCI DSS Scope: Zero Agent Audio
              </div>
              <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500 flex items-center justify-center animate-pulse">
                <Lock className="w-8 h-8 text-rose-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-rose-200">PAYMENT IN PROGRESS</h3>
                <p className="text-sm text-rose-300/80 max-w-md mt-1">
                  Your audio line and screen are strictly isolated. The AI Voice Agent is collecting customer payment details directly in a separate VPC container.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs bg-black/40 border border-rose-500/30 text-rose-200 px-4 py-2 rounded-full font-mono mt-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span>Customer is speaking card credentials to Voice AI...</span>
              </div>
            </div>
          ) : paymentResult ? (
            /* Post-Payment Tokenized HUD */
            <div className="glass-panel p-6 border-emerald-500/40 bg-emerald-950/20 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  <h3 className="text-base font-bold text-emerald-300">PCI Safe Mode Completed</h3>
                </div>
                <span className="text-[11px] font-mono bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded border border-emerald-500/30">
                  ZERO CARD DATA HELD
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] uppercase text-slate-400 font-mono">Gateway Token</div>
                  <div className="text-sm font-bold text-cyan-300 font-mono mt-1 break-all">{paymentResult.token}</div>
                </div>
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] uppercase text-slate-400 font-mono">Card Brand</div>
                  <div className="text-sm font-bold text-slate-100 mt-1">{paymentResult.brand || 'Visa'}</div>
                </div>
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] uppercase text-slate-400 font-mono">Card Digits</div>
                  <div className="text-sm font-bold text-slate-100 font-mono mt-1">**** {paymentResult.last4}</div>
                </div>
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] uppercase text-slate-400 font-mono">Memory State</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono mt-1 flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4" /> ZEROIZED
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Normal CRM Screen */
            <div className="glass-panel p-6 border-slate-800 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  Order & Subscription Details
                </h3>
                <span className="text-xs text-slate-400">Invoice #INV-2026-891</span>
              </div>
              <div className="flex justify-between items-center py-2 text-sm text-slate-300">
                <span>Annual Cloud AI Plan (Tier 1)</span>
                <span className="font-mono font-bold text-slate-100">$49.99 / mo</span>
              </div>
              <div className="flex justify-between items-center py-2 text-sm text-slate-400 border-t border-slate-800/60">
                <span>Total Due Now</span>
                <span className="font-mono font-bold text-cyan-400 text-base">$49.99</span>
              </div>
              <div className="bg-cyan-950/20 border border-cyan-500/20 p-3 rounded-lg text-xs text-cyan-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
                <span>When customer indicates readiness to pay, inform them to wait for the beep, then click <strong>PCI Safe Mode</strong>.</span>
              </div>
            </div>
          )}

          {/* Call Recording Timeline Player */}
          <div className="glass-panel p-4 border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                LIVE CALL RECORDING (FOR QA & COMPLIANCE)
              </span>
              <span className="text-slate-500 text-[11px] font-mono">Server-Enforced Stream</span>
            </div>
            <div className="w-full bg-slate-900 h-9 rounded-md overflow-hidden relative flex items-center px-2 border border-slate-800">
              <div className="h-5 bg-cyan-600/40 border border-cyan-500/60 rounded flex items-center justify-center text-[10px] font-mono text-cyan-200 px-3 w-1/3">
                Live Audio (Normal)
              </div>
              {(callState.agent_isolated || paymentResult) && (
                <div className="h-5 bg-amber-500/20 border border-amber-500/50 rounded flex items-center justify-center text-[10px] font-mono text-amber-300 px-3 mx-2 animate-pulse">
                  ⚠ PCI Audio Withheld (tok_pci...)
                </div>
              )}
              {paymentResult && (
                <div className="h-5 bg-cyan-600/40 border border-cyan-500/60 rounded flex items-center justify-center text-[10px] font-mono text-cyan-200 px-3 flex-1">
                  Resumed Audio
                </div>
              )}
            </div>
          </div>

          {/* Phase 3: Live Transcript Feed */}
          {!callState.agent_isolated && (
            <div className="glass-panel p-4 border-slate-800 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Live Call Audio Transcript</h3>
                </div>
                <span className="text-[10px] text-cyan-400/80 font-mono flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  Auto-feeder to Live Copilot
                </span>
              </div>

              {/* Transcript lines */}
              <div className="max-h-40 overflow-y-auto flex flex-col gap-1.5 pr-1">
                {transcriptLines.map((line, idx) => (
                  <div key={idx} className={`flex gap-2 text-[11px] ${line.speaker === 'agent' ? 'flex-row-reverse' : ''}`}>
                    <span className={`font-mono text-[9px] shrink-0 mt-0.5 font-bold ${line.speaker === 'agent' ? 'text-cyan-400' : 'text-slate-400'}`}>
                      {line.speaker === 'agent' ? 'AGENT' : 'CUSTOMER'}
                    </span>
                    <div className={`rounded-lg px-2.5 py-1.5 max-w-[85%] leading-relaxed ${
                      line.speaker === 'agent'
                        ? 'bg-cyan-950/60 border border-cyan-800/80 text-cyan-100 shadow-sm'
                        : 'bg-slate-800/80 border border-slate-700/80 text-slate-200'
                    }`}>
                      {line.text}
                    </div>
                    <span className="text-[9px] text-slate-500 font-mono shrink-0 mt-auto mb-0.5">{formatTs(line.ts)}</span>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>

              {/* Quick Prompt Pills for Demo */}
              <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 text-[11px]">
                <span className="text-[10px] uppercase font-mono text-slate-500 shrink-0">Demo Prompts:</span>
                <button
                  type="button"
                  onClick={() => handleSendTranscript("Can you provide me pricing and discount guide?", "customer")}
                  className="shrink-0 px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-cyan-300 text-[11px] transition-colors"
                >
                  🏷️ "Pricing & discount guide?"
                </button>
                <button
                  type="button"
                  onClick={() => handleSendTranscript("What is your refund policy?", "customer")}
                  className="shrink-0 px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-cyan-300 text-[11px] transition-colors"
                >
                  ↩️ "Refund policy?"
                </button>
                <button
                  type="button"
                  onClick={() => handleSendTranscript("I want to cancel my subscription", "customer")}
                  className="shrink-0 px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-cyan-300 text-[11px] transition-colors"
                >
                  ❌ "Cancel subscription"
                </button>
                <button
                  type="button"
                  onClick={() => handleSendTranscript("I am ready to pay with my card now", "customer")}
                  className="shrink-0 px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-emerald-300 text-[11px] transition-colors"
                >
                  💳 "Ready to pay"
                </button>
              </div>

              {/* Demo transcript input */}
              <div className="flex gap-2 pt-1 border-t border-slate-800/60">
                <input
                  type="text"
                  value={demoInput}
                  onChange={e => setDemoInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendTranscript(demoInput, 'customer')}
                  placeholder="Speak or type what the customer says (e.g. pricing, discounts, refunds)..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <button
                  onClick={() => handleSendTranscript(demoInput, 'customer')}
                  disabled={!demoInput.trim() || isThinking}
                  className="bg-cyan-600/40 hover:bg-cyan-600/70 disabled:opacity-30 border border-cyan-500/50 text-cyan-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Copilot Assistance Panel */}
        <div className="glass-panel p-5 border-slate-800 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-slate-200">Live Support Copilot</h3>
            </div>
            <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded">
              {activeModel.length > 20 ? activeModel.slice(0, 18) + '…' : activeModel}
            </span>
          </div>

          {copilotBlackout ? (
            <div className="bg-rose-950/40 border border-rose-500/30 p-4 rounded-xl flex flex-col items-center justify-center text-center gap-2 py-8">
              <ShieldAlert className="w-8 h-8 text-rose-400 animate-bounce" />
              <div className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                Copilot Blackout Enforced
              </div>
              <p className="text-[11px] text-rose-400/80">
                Transcription and suggestions are completely paused during PCI Safe Mode.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Thinking indicator */}
              {isThinking && (
                <div className="flex items-center gap-2 text-[11px] text-cyan-400 animate-pulse bg-cyan-950/30 border border-cyan-500/20 p-2 rounded-lg">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Searching knowledge base and formulating suggestion...</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">
                  Real-Time Suggested Action:
                </span>
                {activeConfidence !== null && (
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-2 py-0.5 rounded-full font-bold">
                    {Math.round(activeConfidence * 100)}% match
                  </span>
                )}
              </div>

              {/* Suggestion Card */}
              <div className="bg-slate-900/90 border border-cyan-500/40 p-3.5 rounded-xl text-xs text-slate-200 leading-relaxed shadow-lg shadow-cyan-950/30 whitespace-pre-line">
                {activeSuggestion}
              </div>

              {/* One-Click Action: Speak As Agent */}
              {!isThinking && activeSuggestion && (
                <button
                  type="button"
                  onClick={() => {
                    const cleanReply = activeSuggestion.split('\n\n📄')[0];
                    handleSendTranscript(cleanReply, 'agent');
                  }}
                  className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-200 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all hover:border-cyan-400 active:scale-95 shadow-sm"
                  title="Speak this answer to the customer in the call transcript"
                >
                  <Send className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Speak As Agent (Insert into Call Transcript)</span>
                </button>
              )}

              {/* Source doc citation (Phase 3) */}
              {activeSourceDoc && (
                <div className="bg-slate-900/60 border border-indigo-500/40 p-2.5 rounded-lg text-[11px] text-slate-300 flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 shrink-0 text-indigo-400 mt-0.5" />
                  <div>
                    <span className="text-[10px] text-indigo-400 uppercase font-mono block">Grounded Reference:</span>
                    <strong className="text-indigo-200">{activeSourceDoc}</strong>
                  </div>
                </div>
              )}

              {/* Redaction notice */}
              {liveSuggestion?.redacted && (
                <div className="text-[10px] text-amber-400/90 font-mono flex items-center gap-1.5 bg-amber-950/30 border border-amber-800/50 p-2 rounded-lg">
                  <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>PAN detected in customer speech — masked before copilot processing</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
