import React, { useState } from 'react';
import { Users, ShieldCheck, PhoneCall, CheckCircle, Search, Filter, Shield, Activity, Clock, ArrowUpRight } from 'lucide-react';

const MOCK_AGENTS = [
  {
    id: 'AGT-104',
    name: 'Alice Chen',
    email: 'alice.chen@velatoai.internal',
    status: 'ON_CALL',
    callWith: 'Jane Doe',
    clearance: 'Level 3 (PCI Authorized)',
    callsToday: 18,
    complianceScore: 100,
    avgHandleTime: '03:42'
  },
  {
    id: 'AGT-108',
    name: 'David Miller',
    email: 'david.miller@velatoai.internal',
    status: 'AVAILABLE',
    callWith: null,
    clearance: 'Level 3 (PCI Authorized)',
    callsToday: 24,
    complianceScore: 100,
    avgHandleTime: '02:55'
  },
  {
    id: 'AGT-112',
    name: 'Sarah Connor',
    email: 'sarah.connor@velatoai.internal',
    status: 'WRAP_UP',
    callWith: null,
    clearance: 'Level 2 (Standard Copilot)',
    callsToday: 15,
    complianceScore: 99.2,
    avgHandleTime: '04:10'
  },
  {
    id: 'AGT-115',
    name: 'Marcus Vance',
    email: 'marcus.vance@velatoai.internal',
    status: 'AVAILABLE',
    callWith: null,
    clearance: 'Level 2 (Standard Copilot)',
    callsToday: 12,
    complianceScore: 100,
    avgHandleTime: '03:15'
  },
  {
    id: 'AGT-120',
    name: 'Elena Rostova',
    email: 'elena.rostova@velatoai.internal',
    status: 'OFFLINE',
    callWith: null,
    clearance: 'Level 1 (Auditor)',
    callsToday: 0,
    complianceScore: 100,
    avgHandleTime: '--'
  }
];

export default function AgentsPanel({ onSelectCall }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredAgents = MOCK_AGENTS.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          agent.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          agent.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || agent.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 text-[#EDF3F0]">
      {/* Header Card */}
      <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#0B261B] border border-[#165038] flex items-center justify-center text-[#00E676]">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">Agent Personnel Directory</h2>
            <p className="text-xs text-[#768782] mt-0.5">
              Live operational monitoring and zero-trust PCI compliance tracking across all support lines.
            </p>
          </div>
        </div>

        {/* Aggregate Stats */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="bg-[#070B0A] border border-[#1A2824] px-3.5 py-2 rounded-xl">
            <span className="text-[#768782] block text-[10px] uppercase">Active Roster</span>
            <span className="text-sm font-bold text-white">5 Agents</span>
          </div>
          <div className="bg-[#070B0A] border border-[#1A2824] px-3.5 py-2 rounded-xl">
            <span className="text-[#768782] block text-[10px] uppercase">PCI Compliance</span>
            <span className="text-sm font-bold text-[#00E676]">100% Zero-Leak</span>
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
            placeholder="Search agents by name, ID, or email..."
            className="w-full bg-[#070B0A] border border-[#1A2824] focus:border-[#00E676] rounded-xl pl-9 pr-3 py-2 text-xs text-[#EDF3F0] placeholder-[#768782] outline-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
          <Filter className="w-3.5 h-3.5 text-[#768782]" />
          <span className="text-[#768782] text-[11px]">Filter:</span>
          {['ALL', 'ON_CALL', 'AVAILABLE', 'WRAP_UP'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1 rounded-lg transition-colors text-[11px] font-medium ${
                statusFilter === status
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676]'
                  : 'bg-[#070B0A] border border-[#1A2824] text-[#768782] hover:text-[#EDF3F0]'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Agents Table */}
      <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1A2824] bg-[#0A100F] text-[#768782] uppercase tracking-wider text-[10px] font-mono">
                <th className="py-3 px-4">Agent</th>
                <th className="py-3 px-4">Current Status</th>
                <th className="py-3 px-4">Clearance</th>
                <th className="py-3 px-4">Calls Handled</th>
                <th className="py-3 px-4">PCI Compliance</th>
                <th className="py-3 px-4">Avg Duration</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2824]">
              {filteredAgents.map(agent => (
                <tr key={agent.id} className="hover:bg-[#14201D] transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#0B2A1E] border border-[#165038] flex items-center justify-center font-bold text-xs text-[#00E676]">
                        {agent.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <div className="font-semibold text-[#EDF3F0]">{agent.name}</div>
                        <div className="text-[10px] text-[#768782] font-mono">{agent.id} · {agent.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    {agent.status === 'ON_CALL' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#0B2A1E] text-[#00E676] border border-[#165038]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse" />
                        Live Call ({agent.callWith})
                      </span>
                    )}
                    {agent.status === 'AVAILABLE' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#0D1614] text-[#34D399] border border-[#1A2824]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                        Ready
                      </span>
                    )}
                    {agent.status === 'WRAP_UP' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#1C1A14] text-amber-300 border border-amber-500/30">
                        <Clock className="w-3 h-3" />
                        Wrap-Up
                      </span>
                    )}
                    {agent.status === 'OFFLINE' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#0E1614] text-[#768782] border border-[#1A2824]">
                        Offline
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-[#768782]">
                    <div className="flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-[#00E676]" />
                      <span>{agent.clearance}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#EDF3F0]">{agent.callsToday}</td>
                  <td className="py-3.5 px-4 font-mono">
                    <span className="text-[#00E676] font-semibold">{agent.complianceScore}%</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#768782]">{agent.avgHandleTime}</td>
                  <td className="py-3.5 px-4 text-right">
                    {agent.status === 'ON_CALL' ? (
                      <button
                        onClick={onSelectCall}
                        className="px-2.5 py-1 rounded-lg bg-[#0B2A1E] hover:bg-[#203D2C] border border-[#165038] text-[11px] text-[#00E676] font-medium inline-flex items-center gap-1 transition-colors"
                      >
                        <span>Inspect Call</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#4B5A55] font-mono">Standby</span>
                    )}
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

