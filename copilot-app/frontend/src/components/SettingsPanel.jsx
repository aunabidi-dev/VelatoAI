import React, { useState } from 'react';
import { Settings, Shield, Cpu, Lock, Radio, Server, Check, Save } from 'lucide-react';

export default function SettingsPanel({ agentRole = 'admin' }) {
  const [saved, setSaved] = useState(false);
  const [config, setConfig] = useState({
    autoSeverAudio: true,
    enforceLuhn: true,
    copilotModel: 'Muse Spark Open (Baseten)',
    sttEngine: 'spark_open_audio',
    ttsEngine: 'facebook/mms-tts-eng',
    livekitUrl: 'ws://localhost:7880',
    vaultTtlSeconds: 60,
    debugMode: false,
  });

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 text-[#EDF3F0]">
      {/* Header */}
      <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#0B261B] border border-[#165038] flex items-center justify-center text-[#00E676]">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">Security & Infrastructure Configuration</h2>
            <p className="text-xs text-[#768782] mt-0.5">
              Control plane policies, isolated data plane boundaries, and Meta AI inference runtime parameters.
            </p>
          </div>
        </div>

        <span className={`text-xs font-mono px-3 py-1 rounded-full border ${
          agentRole === 'admin'
            ? 'bg-[#0B2A1E] text-[#00E676] border-[#165038]'
            : 'bg-[#1C1417] text-rose-300 border-rose-500/40'
        }`}>
          Role: {agentRole === 'admin' ? 'Admin (Read/Write)' : 'Agent (Read-Only)'}
        </span>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* Section 1: Zero-Trust PCI Audio Isolation */}
        <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-[#1A2824] pb-3">
            <Shield className="w-4 h-4 text-[#00E676]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Voice Intercept & Media Routing Policies</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#070B0A] border border-[#1A2824] cursor-pointer hover:border-[#223631] transition-colors">
              <input
                type="checkbox"
                checked={config.autoSeverAudio}
                onChange={e => setConfig({ ...config, autoSeverAudio: e.target.checked })}
                disabled={agentRole !== 'admin'}
                className="mt-0.5 rounded border-[#1A2824] text-[#00E676] focus:ring-0 bg-[#0E1614]"
              />
              <div>
                <span className="font-semibold text-white block">Auto-Sever Agent Audio Line</span>
                <span className="text-[#768782] text-[11px] mt-0.5 block">
                  Immediately mute the agent microphone and speaker tracks via LiveKit signaling when PCI Safe Mode is triggered.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#070B0A] border border-[#1A2824] cursor-pointer hover:border-[#223631] transition-colors">
              <input
                type="checkbox"
                checked={config.enforceLuhn}
                onChange={e => setConfig({ ...config, enforceLuhn: e.target.checked })}
                disabled={agentRole !== 'admin'}
                className="mt-0.5 rounded border-[#1A2824] text-[#00E676] focus:ring-0 bg-[#0E1614]"
              />
              <div>
                <span className="font-semibold text-white block">Enforce Client-Side Luhn Verification</span>
                <span className="text-[#768782] text-[11px] mt-0.5 block">
                  Require valid Luhn mod-10 mathematical check on captured card digits before issuing gateway tokenization requests.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Section 2: Meta Open-Weight Model Architecture */}
        <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-[#1A2824] pb-3">
            <Cpu className="w-4 h-4 text-[#34D399]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Meta Open-Weight Model Inference Runtime</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div>
              <label className="text-[11px] text-[#768782] block mb-1.5 uppercase">Live Support Copilot LLM</label>
              <select
                value={config.copilotModel}
                onChange={e => setConfig({ ...config, copilotModel: e.target.value })}
                disabled={agentRole !== 'admin'}
                className="w-full bg-[#070B0A] border border-[#1A2824] focus:border-[#00E676] text-xs text-[#EDF3F0] rounded-xl px-3 py-2 outline-none"
              >
                <option value="Muse Spark Open (Baseten)">Muse Spark Open (Baseten Serverless)</option>
                <option value="Llama 3.3 70B Instruct">Llama 3.3 70B Instruct</option>
                <option value="Llama 3.1 8B Local">Llama 3.1 8B (Local Ephemeral)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-[#768782] block mb-1.5 uppercase">Fallback Speech-To-Text</label>
              <select
                value={config.sttEngine}
                onChange={e => setConfig({ ...config, sttEngine: e.target.value })}
                disabled={agentRole !== 'admin'}
                className="w-full bg-[#070B0A] border border-[#1A2824] focus:border-[#00E676] text-xs text-[#EDF3F0] rounded-xl px-3 py-2 outline-none"
              >
                <option value="spark_open_audio">Meta Spark Open Audio</option>
                <option value="meta_wav2vec2">Meta wav2vec 2.0 (facebook/wav2vec2-base-960h)</option>
                <option value="web_speech_native">Browser Native Web Speech API</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-[#768782] block mb-1.5 uppercase">Automated Speech Synthesis (TTS)</label>
              <select
                value={config.ttsEngine}
                onChange={e => setConfig({ ...config, ttsEngine: e.target.value })}
                disabled={agentRole !== 'admin'}
                className="w-full bg-[#070B0A] border border-[#1A2824] focus:border-[#00E676] text-xs text-[#EDF3F0] rounded-xl px-3 py-2 outline-none"
              >
                <option value="facebook/mms-tts-eng">Meta MMS TTS (facebook/mms-tts-eng)</option>
                <option value="web_speech_native">Browser Native SpeechSynthesis</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Signaling & Infrastructure */}
        <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-[#1A2824] pb-3">
            <Radio className="w-4 h-4 text-[#00E676]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">LiveKit Signaling & Ephemeral Vault Scope</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <label className="text-[11px] text-[#768782] block mb-1.5 uppercase">LiveKit WebRTC Signaling URL</label>
              <input
                type="text"
                value={config.livekitUrl}
                onChange={e => setConfig({ ...config, livekitUrl: e.target.value })}
                disabled={agentRole !== 'admin'}
                className="w-full bg-[#070B0A] border border-[#1A2824] focus:border-[#00E676] text-xs text-[#EDF3F0] rounded-xl px-3 py-2 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#768782] block mb-1.5 uppercase">Ephemeral Payment Session TTL (Seconds)</label>
              <input
                type="number"
                value={config.vaultTtlSeconds}
                onChange={e => setConfig({ ...config, vaultTtlSeconds: Number(e.target.value) })}
                disabled={agentRole !== 'admin'}
                className="w-full bg-[#070B0A] border border-[#1A2824] focus:border-[#00E676] text-xs text-[#EDF3F0] rounded-xl px-3 py-2 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Action Button */}
        {agentRole === 'admin' && (
          <div className="flex items-center justify-end gap-3 pt-2">
            {saved && (
              <span className="text-xs text-[#00E676] font-semibold flex items-center gap-1.5 animate-in fade-in">
                <Check className="w-4 h-4" />
                Settings saved successfully
              </span>
            )}
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-[#00E676] hover:bg-[#00C853] text-[#070B0A] font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-[#00E676]/15"
            >
              <Save className="w-4 h-4" />
              <span>Apply Configuration</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

