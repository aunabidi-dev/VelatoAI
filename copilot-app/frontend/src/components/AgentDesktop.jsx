import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Mic, MicOff, Lock, Play, Pause, AlertCircle, FileText, Bot, CheckCircle2 } from 'lucide-react';
import { soundFx } from './AudioSynthesizer';

export default function AgentDesktop({
  callState,
  onTriggerSafeMode,
  copilotSuggestion,
  copilotBlackout,
  paymentResult,
  auditMarkers
}) {
  const [seconds, setSeconds] = useState(48);

  useEffect(() => {
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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
                {callState.call_id || "call_live_01"}
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Account: Premium Enterprise</span> • 
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

      {/* Main Grid: Copilot + Workspace */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: CRM Details & Payment Summary */}
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
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
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
                  <div className="text-sm font-bold text-cyan-300 font-mono mt-1 break-all">
                    {paymentResult.token}
                  </div>
                </div>
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] uppercase text-slate-400 font-mono">Card Brand</div>
                  <div className="text-sm font-bold text-slate-100 mt-1">
                    {paymentResult.brand || "Visa"}
                  </div>
                </div>
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] uppercase text-slate-400 font-mono">Card Digits</div>
                  <div className="text-sm font-bold text-slate-100 font-mono mt-1">
                    **** {paymentResult.last4}
                  </div>
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
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                LIVE CALL RECORDING (FOR QA & COMPLIANCE)
              </span>
              <span className="text-slate-500 text-[11px] font-mono">Server-Enforced Stream</span>
            </div>

            {/* Audio Timeline Bar */}
            <div className="w-full bg-slate-900 h-9 rounded-md overflow-hidden relative flex items-center px-2 border border-slate-800">
              {/* Normal Audio Segment 1 */}
              <div className="h-5 bg-cyan-600/40 border border-cyan-500/60 rounded flex items-center justify-center text-[10px] font-mono text-cyan-200 px-3 w-1/3">
                Live Audio (Normal)
              </div>

              {/* PCI Gap Segment */}
              {(callState.agent_isolated || paymentResult) && (
                <div className="h-5 bg-amber-500/20 border border-amber-500/50 rounded flex items-center justify-center text-[10px] font-mono text-amber-300 px-3 mx-2 animate-pulse">
                  ⚠ PCI Audio Withheld (tok_pci...)
                </div>
              )}

              {/* Normal Audio Segment 2 */}
              {paymentResult && (
                <div className="h-5 bg-cyan-600/40 border border-cyan-500/60 rounded flex items-center justify-center text-[10px] font-mono text-cyan-200 px-3 flex-1">
                  Resumed Audio
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Copilot Assistance Panel */}
        <div className="glass-panel p-5 border-slate-800 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-slate-200">Live Support Copilot</h3>
            </div>
            <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded">
              Meta Muse Spark
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
              <div className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">
                Real-Time Suggested Action:
              </div>
              <div className="bg-slate-900/90 border border-cyan-500/30 p-3 rounded-lg text-xs text-slate-200 leading-relaxed shadow-lg shadow-cyan-950/20">
                {copilotSuggestion || "Customer is asking about the payment plan. Explain the refund window then trigger Safe Mode when ready."}
              </div>

              <div className="text-[11px] text-slate-400 uppercase font-mono tracking-wider mt-2">
                Knowledge Reference:
              </div>
              <div className="bg-slate-900/40 border border-slate-800 p-2.5 rounded-lg text-[11px] text-slate-400">
                📄 <strong className="text-slate-300">Policy Doc 4.2</strong>: Payments must not be captured verbally by human agents. Use automated voice intercept.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
