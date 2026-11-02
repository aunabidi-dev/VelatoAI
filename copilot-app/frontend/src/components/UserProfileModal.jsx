import React from 'react';
import { User, Shield, Key, CheckCircle, X, LogOut, ArrowRightLeft } from 'lucide-react';

export default function UserProfileModal({ isOpen, onClose, agentRole, onToggleRole }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#0E1614] border border-[#1A2824] w-full max-w-md rounded-2xl p-6 flex flex-col gap-5 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1A2824]">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#00E676]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Operator Security Profile</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#768782] hover:text-white hover:bg-[#16201E] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Card */}
        <div className="flex items-center gap-4 bg-[#070B0A] border border-[#1A2824] p-4 rounded-xl">
          <div className="w-14 h-14 rounded-full bg-[#0B2A1E] border border-[#165038] flex items-center justify-center text-lg font-bold text-[#00E676]">
            SA
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-bold text-white truncate">Syed Asher Imtiaz</h4>
            <div className="text-xs text-[#768782]">Enterprise Security Architect</div>
            <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#0B2A1E] text-[#00E676] border border-[#165038]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse" />
              <span>ACTIVE SESSION</span>
            </div>
          </div>
        </div>

        {/* Credentials & Clearance Details */}
        <div className="flex flex-col gap-2.5 text-xs font-mono">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070B0A] border border-[#1A2824]">
            <span className="text-[#768782]">Assigned Role:</span>
            <span className="font-bold text-[#00E676] uppercase">{agentRole}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070B0A] border border-[#1A2824]">
            <span className="text-[#768782]">Security Clearance:</span>
            <span className="font-semibold text-white">PCI-DSS Level 1 / Master</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070B0A] border border-[#1A2824]">
            <span className="text-[#768782]">2FA Status:</span>
            <span className="text-[#34D399] flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>FIDO2 Hardware Key Verified</span>
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070B0A] border border-[#1A2824]">
            <span className="text-[#768782]">Session Vault Key:</span>
            <span className="text-[#768782]">sess_sec_9921_auth</span>
          </div>
        </div>

        {/* Role Toggle Switcher */}
        <div className="flex flex-col gap-2 pt-2 border-t border-[#1A2824]">
          <span className="text-[11px] text-[#768782]">Simulation Override:</span>
          <button
            onClick={onToggleRole}
            className="w-full py-2.5 px-4 rounded-xl bg-[#16201E] hover:bg-[#20312E] border border-[#243531] text-xs font-medium text-white flex items-center justify-center gap-2 transition-colors"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-[#00E676]" />
            <span>Switch Role to {agentRole === 'admin' ? 'Agent (Read-Only Mode)' : 'Admin (Master Privilege)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

