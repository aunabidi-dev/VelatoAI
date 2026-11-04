import React from 'react';
import { User, Shield, Key, CheckCircle, X, LogOut, ArrowRightLeft } from 'lucide-react';

export default function UserProfileModal({ isOpen, onClose, agentRole, onToggleRole }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl p-6 flex flex-col gap-5 shadow-xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Operator Security Profile</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Card */}
        <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 p-4 rounded-xl">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-lg font-bold text-emerald-800">
            SA
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-bold text-slate-900 truncate">Syed Asher Imtiaz</h4>
            <div className="text-xs text-slate-500">Enterprise Security Architect</div>
            <div className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>ACTIVE SESSION</span>
            </div>
          </div>
        </div>

        {/* Credentials & Clearance Details */}
        <div className="flex flex-col gap-2.5 text-xs font-mono">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500">Assigned Role:</span>
            <span className="font-bold text-emerald-800 uppercase">{agentRole}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500">Security Clearance:</span>
            <span className="font-semibold text-slate-900">PCI-DSS Level 1 / Master</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500">2FA Status:</span>
            <span className="text-emerald-700 flex items-center gap-1 font-medium">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>FIDO2 Hardware Key Verified</span>
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500">Session Vault Key:</span>
            <span className="text-slate-500">sess_sec_9921_auth</span>
          </div>
        </div>

        {/* Role Toggle Switcher */}
        {onToggleRole && (
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-200">
            <span className="text-[11px] text-slate-500">Simulation Override:</span>
            <button
              onClick={onToggleRole}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors shadow-2xs"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Switch Role to {agentRole === 'admin' ? 'Agent (Read-Only Mode)' : 'Admin (Master Privilege)'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
