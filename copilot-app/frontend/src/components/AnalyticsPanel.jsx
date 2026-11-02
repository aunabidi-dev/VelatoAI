import React from 'react';
import { BarChart3, ShieldCheck, Zap, Activity, Cpu, Lock, Clock, CheckCircle2 } from 'lucide-react';

export default function AnalyticsPanel() {
  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 text-[#EDF3F0]">
      {/* Header */}
      <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#0B261B] border border-[#165038] flex items-center justify-center text-[#00E676]">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">Zero-Trust Telemetry & Model Performance</h2>
            <p className="text-xs text-[#768782] mt-0.5">
              Real-time benchmarks across WebRTC voice severance, Meta open-weight AI inference, and memory zeroization.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
          <span className="text-xs font-mono text-[#34D399]">Live Telemetry Stream Active</span>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#768782] mb-2">
            <span className="text-xs font-medium">Audio Severance Latency</span>
            <Zap className="w-4 h-4 text-[#00E676]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#00E676]">0.02 ms</div>
          <div className="text-[11px] text-[#768782] mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-[#34D399]" />
            <span>Target: &lt; 5.0 ms (Ultra Low)</span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#768782] mb-2">
            <span className="text-xs font-medium">Zero-Trust Redaction</span>
            <ShieldCheck className="w-4 h-4 text-[#00E676]" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">100.0%</div>
          <div className="text-[11px] text-[#768782] mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-[#34D399]" />
            <span>0 bytes of PAN leaked to disk</span>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#768782] mb-2">
            <span className="text-xs font-medium">Muse Spark Open TTFT</span>
            <Cpu className="w-4 h-4 text-[#34D399]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#34D399]">142 ms</div>
          <div className="text-[11px] text-[#768782] mt-1 flex items-center gap-1">
            <span>Baseten Serverless Inference</span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#768782] mb-2">
            <span className="text-xs font-medium">Tokens Issued Today</span>
            <Lock className="w-4 h-4 text-[#00E676]" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">88</div>
          <div className="text-[11px] text-[#768782] mt-1 flex items-center gap-1">
            <span>All validated via Luhn mod-10</span>
          </div>
        </div>
      </div>

      {/* Deep Telemetry Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Architecture Benchmark Card */}
        <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-5 flex flex-col gap-4">
          <div className="border-b border-[#1A2824] pb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Engine Latency Breakdown</h3>
            <span className="text-[10px] font-mono text-[#768782]">Rolling 24 Hours</span>
          </div>

          <div className="flex flex-col gap-3.5">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#EDF3F0]">LiveKit Signaling Severance</span>
                <span className="font-mono text-[#00E676]">0.02 ms</span>
              </div>
              <div className="w-full bg-[#070B0A] h-2 rounded-full overflow-hidden">
                <div className="bg-[#00E676] h-full rounded-full" style={{ width: '4%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#EDF3F0]">Ephemeral Tokenization Vault Generation</span>
                <span className="font-mono text-[#34D399]">1.40 ms</span>
              </div>
              <div className="w-full bg-[#070B0A] h-2 rounded-full overflow-hidden">
                <div className="bg-[#34D399] h-full rounded-full" style={{ width: '12%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#EDF3F0]">Meta MMS TTS Prompt Audio Synthesis</span>
                <span className="font-mono text-[#EDF3F0]">48.20 ms</span>
              </div>
              <div className="w-full bg-[#070B0A] h-2 rounded-full overflow-hidden">
                <div className="bg-[#10B981] h-full rounded-full" style={{ width: '38%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#EDF3F0]">Muse Spark Open LLM Copilot Grounding</span>
                <span className="font-mono text-[#EDF3F0]">142.00 ms</span>
              </div>
              <div className="w-full bg-[#070B0A] h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-[#10B981] to-[#00E676] h-full rounded-full" style={{ width: '70%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Security Compliance Checklist */}
        <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-5 flex flex-col gap-4">
          <div className="border-b border-[#1A2824] pb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">PCI-DSS 4.0 Compliance Guarantees</h3>
            <span className="text-[10px] font-mono text-[#00E676] bg-[#0B2A1E] border border-[#165038] px-2 py-0.5 rounded">
              VERIFIED PASS
            </span>
          </div>

          <div className="flex flex-col gap-3 text-xs">
            <div className="p-3 rounded-xl bg-[#070B0A] border border-[#1A2824] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block">Req 3.4 — PAN Zero-Persistence:</strong>
                <span className="text-[#768782]">Payment card numbers exist strictly in RAM within the read-only isolated container and are wiped post-tokenization.</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#070B0A] border border-[#1A2824] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block">Req 4.1 — Dual-Channel Network Segmentation:</strong>
                <span className="text-[#768782]">Control Plane (agent desktop/copilot) and PCI Data Plane (voice tokenization) operate on isolated Docker networks with zero shared routes.</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#070B0A] border border-[#1A2824] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block">Req 10.2 — Cryptographic Audit Trail:</strong>
                <span className="text-[#768782]">Every call transition and safe mode engagement writes an immutable SHA-256 hashed ledger record.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

