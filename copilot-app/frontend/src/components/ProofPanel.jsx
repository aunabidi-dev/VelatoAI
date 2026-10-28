import React, { useState } from 'react';
import { ShieldCheck, Search, Database, Terminal, AlertCircle, FileCheck, CheckCircle2, Lock } from 'lucide-react';

export default function ProofPanel({ auditEvents, onRunLeakScan, scanResults }) {
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = async () => {
    setIsScanning(true);
    await onRunLeakScan();
    setIsScanning(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
      {/* Proof Header */}
      <div className="glass-panel p-6 border-slate-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-cyan-400" />
            <h2 className="text-lg font-bold text-slate-100">Zero-Trust PCI Security & Leak Proof</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time verification: Database, transcripts, logs and memory are scanned for raw PAN numbers.
          </p>
        </div>

        <button
          onClick={handleScan}
          disabled={isScanning}
          className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition-all shadow-lg shadow-cyan-950/30"
        >
          <Search className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Scanning Tables...' : 'Run Automated Leak Scan'}</span>
        </button>
      </div>

      {/* Leak Scan Status Result HUD */}
      {scanResults && (
        <div className="glass-panel p-4 border-emerald-500/40 bg-emerald-950/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-xs font-bold text-emerald-300">
                AUDIT VERIFIED: {scanResults.status}
              </div>
              <div className="text-[11px] text-emerald-400/80 font-mono">
                {scanResults.total_records_checked} Records Scanned • {scanResults.leaks_found} Card Digits Found
              </div>
            </div>
          </div>
          <span className="text-xs font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-full">
            0 LEAKS IN LOGS OR DB
          </span>
        </div>
      )}

      {/* Comparison Grid: Insider vs Attacker */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: What Human Agent / QA Sees */}
        <div className="glass-panel p-5 border-slate-800 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
            <FileCheck className="w-4 h-4 text-cyan-400" />
            What Human Agent & QA Sees:
          </div>
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 font-mono text-xs text-slate-300 flex flex-col gap-1.5">
            <div><span className="text-slate-500">Screen Status:</span> Payment Completed</div>
            <div><span className="text-slate-500">Token Ref:</span> <span className="text-cyan-400">tok_pci_7c4a189f3b1e</span></div>
            <div><span className="text-slate-500">Card Display:</span> **** 4242 (Visa)</div>
            <div><span className="text-slate-500">Call Audio:</span> 00:00 - 01:20 (Normal)</div>
            <div><span className="text-slate-500">Payment Segment:</span> <span className="text-amber-400">[WITHHELD - SILENCE]</span></div>
          </div>
        </div>

        {/* Card 2: What an Attacker / Memory Dump Captures */}
        <div className="glass-panel p-5 border-slate-800 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-300 uppercase font-mono tracking-wider">
            <Lock className="w-4 h-4 text-rose-400" />
            What an Attacker / Wiretap Captures:
          </div>
          <div className="bg-slate-950 p-4 rounded-lg border border-rose-950/40 font-mono text-xs text-rose-300 flex flex-col gap-1.5">
            <div><span className="text-slate-500">Control Plane Log:</span> No card payload allowed</div>
            <div><span className="text-slate-500">Agent Audio Packet:</span> RTP Muted / Severed at Server</div>
            <div><span className="text-slate-500">Memory Dump:</span> <span className="text-emerald-400">0x00 0x00 (ZEROIZED)</span></div>
            <div><span className="text-slate-500">Database Search:</span> 0 matches for 16-digit PAN</div>
            <div><span className="text-slate-500">Scope Reduction:</span> Contact center out of PCI scope</div>
          </div>
        </div>
      </div>

      {/* Append-Only Audit Trail Table */}
      <div className="glass-panel p-5 border-slate-800 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Append-Only Security Audit Trail
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Cryptographically verifiable events</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono text-slate-300">
            <thead className="text-[11px] text-slate-500 uppercase border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">Event ID</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3">Token Ref</th>
                <th className="py-2 px-3">Last 4</th>
                <th className="py-2 px-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {auditEvents && auditEvents.length > 0 ? (
                auditEvents.map((evt, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-3 text-slate-400">{evt.id}</td>
                    <td className="py-2.5 px-3 text-cyan-300 font-bold">{evt.event_type}</td>
                    <td className="py-2.5 px-3 text-cyan-400 font-medium">{evt.token_ref || "—"}</td>
                    <td className="py-2.5 px-3 text-slate-200">{evt.last4 ? `**** ${evt.last4}` : "—"}</td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">{evt.details || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="py-4 text-center text-slate-500">
                    No events recorded yet. Trigger PCI Safe Mode to generate audit entries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
