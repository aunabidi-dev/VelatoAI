import React, { useState } from 'react';
import { Phone, Shield, ShieldCheck, Lock, Search, Filter, Download, ExternalLink, Play } from 'lucide-react';

const MOCK_CALL_LOGS = [
  {
    call_id: 'call_meta_hackathon_01',
    customer_name: 'Jane Doe',
    agent_name: 'Alice Chen',
    timestamp: 'Today, 11:38 AM',
    duration: '02:05',
    safe_mode_used: true,
    token_ref: 'tok_pci_7f9c2a81',
    redaction_status: 'Compliant Withheld',
    qa_status: 'Approved'
  },
  {
    call_id: 'call_ent_2026_8819',
    customer_name: 'Marcus Brody',
    agent_name: 'David Miller',
    timestamp: 'Today, 10:14 AM',
    duration: '03:45',
    safe_mode_used: true,
    token_ref: 'tok_pci_4a11b890',
    redaction_status: 'Compliant Withheld',
    qa_status: 'Approved'
  },
  {
    call_id: 'call_ent_2026_8818',
    customer_name: 'Evelyn Carter',
    agent_name: 'Sarah Connor',
    timestamp: 'Today, 09:50 AM',
    duration: '01:50',
    safe_mode_used: false,
    token_ref: null,
    redaction_status: 'No PCI Input',
    qa_status: 'Approved'
  },
  {
    call_id: 'call_ent_2026_8817',
    customer_name: 'Liam Zhang',
    agent_name: 'Alice Chen',
    timestamp: 'Today, 09:22 AM',
    duration: '04:12',
    safe_mode_used: true,
    token_ref: 'tok_pci_33c84f10',
    redaction_status: 'Compliant Withheld',
    qa_status: 'Approved'
  },
  {
    call_id: 'call_ent_2026_8816',
    customer_name: 'Sophia Patel',
    agent_name: 'David Miller',
    timestamp: 'Yesterday, 04:30 PM',
    duration: '02:18',
    safe_mode_used: true,
    token_ref: 'tok_pci_9b2e04f8',
    redaction_status: 'Compliant Withheld',
    qa_status: 'Approved'
  }
];

export default function CallLogsPanel({ onSelectCall }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSafeMode, setFilterSafeMode] = useState('ALL');

  const filteredLogs = MOCK_CALL_LOGS.filter(log => {
    const matchesSearch = log.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.call_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.agent_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSafeMode = filterSafeMode === 'ALL' ||
                            (filterSafeMode === 'PCI' && log.safe_mode_used) ||
                            (filterSafeMode === 'NON_PCI' && !log.safe_mode_used);
    return matchesSearch && matchesSafeMode;
  });

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 text-[#EDF3F0]">
      {/* Header */}
      <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#0B261B] border border-[#165038] flex items-center justify-center text-[#00E676]">
            <Phone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">Call Recording & Audio Audit Logs</h2>
            <p className="text-xs text-[#768782] mt-0.5">
              Verified auditable call recordings with zero-trust severed payment segments and cryptographic tokens.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="bg-[#070B0A] border border-[#1A2824] px-3.5 py-2 rounded-xl">
            <span className="text-[#768782] block text-[10px] uppercase">Total Logs</span>
            <span className="text-sm font-bold text-white">124 Calls</span>
          </div>
          <div className="bg-[#070B0A] border border-[#1A2824] px-3.5 py-2 rounded-xl">
            <span className="text-[#768782] block text-[10px] uppercase">PCI Withheld</span>
            <span className="text-sm font-bold text-[#00E676]">88 Encrypted</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#768782] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by customer, agent, or call ID..."
            className="w-full bg-[#070B0A] border border-[#1A2824] focus:border-[#00E676] rounded-xl pl-9 pr-3 py-2 text-xs text-[#EDF3F0] placeholder-[#768782] outline-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
          <Filter className="w-3.5 h-3.5 text-[#768782]" />
          <span className="text-[#768782] text-[11px]">Filter:</span>
          {[
            { id: 'ALL', label: 'All Calls' },
            { id: 'PCI', label: 'PCI Safe Mode Only' },
            { id: 'NON_PCI', label: 'Standard Calls' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setFilterSafeMode(opt.id)}
              className={`px-2.5 py-1 rounded-lg transition-colors text-[11px] font-medium ${
                filterSafeMode === opt.id
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676]'
                  : 'bg-[#070B0A] border border-[#1A2824] text-[#768782] hover:text-[#EDF3F0]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1A2824] bg-[#0A100F] text-[#768782] uppercase tracking-wider text-[10px] font-mono">
                <th className="py-3 px-4">Call ID & Time</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Agent</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">PCI Safe Mode</th>
                <th className="py-3 px-4">Payment Token</th>
                <th className="py-3 px-4">Redaction Status</th>
                <th className="py-3 px-4 text-right">Playback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2824]">
              {filteredLogs.map(log => (
                <tr key={log.call_id} className="hover:bg-[#14201D] transition-colors">
                  <td className="py-3.5 px-4 font-mono">
                    <div className="text-white font-semibold">{log.call_id}</div>
                    <div className="text-[10px] text-[#768782]">{log.timestamp}</div>
                  </td>
                  <td className="py-3.5 px-4 text-[#EDF3F0] font-medium">{log.customer_name}</td>
                  <td className="py-3.5 px-4 text-[#768782]">{log.agent_name}</td>
                  <td className="py-3.5 px-4 font-mono text-[#EDF3F0]">{log.duration}</td>
                  <td className="py-3.5 px-4">
                    {log.safe_mode_used ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#0B2A1E] text-[#00E676] border border-[#165038]">
                        <Lock className="w-3 h-3" />
                        ENGAGED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono text-[#768782] bg-[#070B0A] border border-[#1A2824]">
                        STANDARD
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px]">
                    {log.token_ref ? (
                      <span className="text-[#34D399] font-semibold">{log.token_ref}</span>
                    ) : (
                      <span className="text-[#4B5A55]">--</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="text-[11px] text-[#00E676] flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {log.redaction_status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={onSelectCall}
                      className="px-2.5 py-1 rounded-lg bg-[#0B2A1E] hover:bg-[#203D2C] border border-[#165038] text-[11px] text-[#00E676] font-medium inline-flex items-center gap-1 transition-colors"
                      title="Load this call into the interactive player"
                    >
                      <Play className="w-3 h-3" />
                      <span>Review</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

