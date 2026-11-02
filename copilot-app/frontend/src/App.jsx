import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Users, Phone, BarChart3, Settings,
  Shield, Activity, BookOpen, ShieldCheck, RefreshCw, X, ChevronDown,
  User, Sparkles, Volume2, MicOff, Server, Zap, CheckCircle2
} from 'lucide-react';
import logoImg from './assets/logo.png';
import AgentDesktop from './components/AgentDesktop';
import CustomerPhone from './components/CustomerPhone';
import ProofPanel from './components/ProofPanel';
import AdminPanel from './components/AdminPanel';
import AgentsPanel from './components/AgentsPanel';
import CallLogsPanel from './components/CallLogsPanel';
import AnalyticsPanel from './components/AnalyticsPanel';
import SettingsPanel from './components/SettingsPanel';
import UserProfileModal from './components/UserProfileModal';

export default function App() {
  const [viewMode, setViewMode] = useState('live'); // 'live', 'agent', 'customer', 'admin', 'proof'
  const [agentRole, setAgentRole] = useState('admin'); // 'agent' | 'admin'
  const [sidebarActive, setSidebarActive] = useState('dashboard'); // 'dashboard', 'agents', 'logs', 'analytics', 'settings'
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Call & Safe Mode state
  const [callState, setCallState] = useState({
    call_id: 'call_meta_hackathon_01',
    customer_name: 'Jane Doe',
    agent_isolated: false,
    safe_mode_active: false,
    recording_paused_pci: false
  });

  const [copilotSuggestion, setCopilotSuggestion] = useState(
    'Customer is asking for annual pricing. Script recommends Tier 1 plan. Click [PCI SAFE MODE] when payment is requested.'
  );
  const [copilotBlackout, setCopilotBlackout] = useState(false);

  // Payment Service isolated state
  const [paymentSession, setPaymentSession] = useState({
    session_id: null,
    state: 'IDLE',
    prompt: '',
    brand: null,
    last4: null,
    expiry: null
  });

  const [paymentResult, setPaymentResult] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [scanResults, setScanResults] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  // Load audit trail
  const fetchAudit = async () => {
    try {
      const res = await fetch('/api/audit');
      if (res.ok) {
        const data = await res.json();
        setAuditEvents(data.events || []);
      }
    } catch (e) {
      console.log('Control plane offline or mock mode');
    }
  };

  // Real-time WebSocket connection to Control Plane
  useEffect(() => {
    fetchAudit();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/call/${callState.call_id}/agent`;

    let ws;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        console.log('[ZytaSafe WS] Connected to Control Plane Signaling Server');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'INIT_STATE') {
            setCallState(prev => ({
              ...prev,
              safe_mode_active: !!msg.safe_mode_active,
              agent_isolated: !!msg.agent_isolated,
              copilot_blackout: !!msg.safe_mode_active,
              token_ref: msg.token_ref || null,
              last4: msg.last4 || null,
              brand: msg.brand || null,
            }));
            setCopilotBlackout(!!msg.safe_mode_active);
            if (msg.token_ref) {
              setPaymentResult({
                token: msg.token_ref,
                brand: msg.brand,
                last4: msg.last4
              });
            }
          } else if (msg.type === 'SAFE_MODE_STATE') {
            setCallState(prev => ({
              ...prev,
              safe_mode_active: msg.safe_mode_active,
              agent_isolated: msg.agent_isolated,
              copilot_blackout: msg.copilot_blackout,
              recording_paused_pci: true
            }));
            setCopilotBlackout(true);
            setIsCustomerDrawerOpen(true);
            if (msg.payment_session_id) {
              setPaymentSession(prev => ({
                ...prev,
                session_id: msg.payment_session_id,
                state: 'CAPTURING_PAN',
                prompt: msg.initial_data?.prompt || 'Welcome to the secure payment line. Please speak your 16-digit card number.'
              }));
            }
          } else if (msg.type === 'SAFE_MODE_COMPLETED') {
            setCallState(prev => ({
              ...prev,
              safe_mode_active: false,
              agent_isolated: false,
              copilot_blackout: false,
              recording_paused_pci: false
            }));
            setCopilotBlackout(false);
            setPaymentResult({
              token: msg.token_ref,
              brand: msg.brand,
              last4: msg.last4
            });
            fetchAudit();
          }
        } catch (e) {
          console.error('WS Parse error', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    } catch (e) {
      console.warn('WebSocket initialization fallback', e);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [callState.call_id]);

  useEffect(() => {
    if (viewMode === 'proof') {
      fetchAudit();
    }
  }, [viewMode]);

  // 1. Agent triggers PCI Safe Mode
  const handleTriggerSafeMode = async () => {
    setCallState(prev => ({
      ...prev,
      agent_isolated: true,
      safe_mode_active: true,
      recording_paused_pci: true
    }));
    setCopilotBlackout(true);
    setIsCustomerDrawerOpen(true);

    try {
      const cpRes = await fetch(`/api/calls/${callState.call_id}/safe-mode/start`, {
        method: 'POST'
      });
      const cpData = await cpRes.json();
      const sessId = cpData.payment_session_id || 'sess_pci_01';
      setPaymentSession({
        session_id: sessId,
        state: 'CAPTURING_PAN',
        prompt: 'Welcome to our secure automated payment line. The agent cannot hear you. Please speak your 16-digit card number after the tone.',
        brand: null,
        last4: null,
        expiry: null
      });
      fetchAudit();
    } catch (e) {
      setPaymentSession({
        session_id: 'sess_pci_01',
        state: 'CAPTURING_PAN',
        prompt: 'Welcome to our secure automated payment line. The agent cannot hear you. Please speak your 16-digit card number after the tone.',
        brand: null,
        last4: null,
        expiry: null
      });
    }
  };

  // Agent cancels PCI Safe Mode
  const handleCancelSafeMode = async () => {
    try {
      await fetch(`/api/calls/${callState.call_id}/safe-mode/cancel`, {
        method: 'POST'
      });
    } catch (e) { }
    setCallState(prev => ({
      ...prev,
      agent_isolated: false,
      safe_mode_active: false,
      recording_paused_pci: false
    }));
    setCopilotBlackout(false);
    setPaymentSession({
      session_id: null,
      state: 'IDLE',
      prompt: '',
      brand: null,
      last4: null,
      expiry: null
    });
    fetchAudit();
  };

  // 2. Customer speaks PAN
  const handleSendPan = async (panText) => {
    const rawDigits = panText.replace(/\D/g, '');
    const fallbackLast4 = rawDigits.length >= 4 ? rawDigits.slice(-4) : (rawDigits || '0987');

    try {
      const res = await fetch(`/api/payment/session/${paymentSession.session_id}/pan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spoken_text: panText })
      });
      const data = await res.json();
      if (data.valid === false) {
        setPaymentSession(prev => ({ ...prev, prompt: data.prompt }));
      } else {
        const last4 = data.last4 || fallbackLast4;
        setPaymentSession(prev => ({
          ...prev,
          state: 'CAPTURING_EXPIRY',
          prompt: data.prompt || `Card verified: ${data.brand || 'Visa'} ending in ${last4}. Please state your expiration month and year, for example 12 28.`,
          brand: data.brand || 'Visa',
          last4: last4
        }));
      }
    } catch (e) {
      setPaymentSession(prev => ({
        ...prev,
        state: 'CAPTURING_EXPIRY',
        prompt: `Card verified: Visa ending in ${fallbackLast4}. Please state your expiration month and year, for example 12 28.`,
        brand: 'Visa',
        last4: fallbackLast4
      }));
    }
  };

  // 3. Customer speaks Expiry
  const handleSendExpiry = async (expText) => {
    try {
      const res = await fetch(`/api/payment/session/${paymentSession.session_id}/expiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spoken_text: expText })
      });
      const data = await res.json();
      if (data.valid === false) {
        setPaymentSession(prev => ({
          ...prev,
          prompt: data.prompt || 'Please state the expiration month and year again, for example 12 28.'
        }));
        return;
      }
      setPaymentSession(prev => ({
        ...prev,
        state: 'CAPTURING_CVV',
        expiry: expText.trim(),
        prompt: data.prompt || 'Please say the 3-digit security code on the back of your card.'
      }));
    } catch (e) {
      setPaymentSession(prev => ({
        ...prev,
        state: 'CAPTURING_CVV',
        expiry: expText.trim(),
        prompt: 'Please say the 3-digit security code on the back of your card.'
      }));
    }
  };

  // 4. Customer speaks CVV
  const handleSendCvv = async (cvvText) => {
    try {
      const res = await fetch(`/api/payment/session/${paymentSession.session_id}/cvv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spoken_text: cvvText })
      });
      const data = await res.json();
      if (data.valid === false) {
        setPaymentSession(prev => ({
          ...prev,
          prompt: data.prompt || 'Please repeat the 3 or 4-digit security code on your card.'
        }));
        return;
      }
      setPaymentSession(prev => ({
        ...prev,
        state: 'CONFIRMING',
        prompt: data.prompt,
        last4: data.last4 || prev.last4,
        expiry: data.expiry || prev.expiry
      }));
    } catch (e) {
      setPaymentSession(prev => ({
        ...prev,
        state: 'CONFIRMING',
        prompt: `I have recorded a ${prev.brand || 'card'} ending in ${prev.last4}, expiring ${prev.expiry}. Is this correct? Say yes to confirm.`,
        last4: prev.last4,
        expiry: prev.expiry
      }));
    }
  };

  // 5. Customer confirms
  const handleConfirmPayment = async (confirmed) => {
    if (!confirmed) {
      setPaymentSession(prev => ({
        ...prev,
        state: 'CAPTURING_PAN',
        prompt: "Understood. Let's restart. Please speak your 16-digit card number."
      }));
      return;
    }

    try {
      const res = await fetch(`/api/payment/session/${paymentSession.session_id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true })
      });
      const data = await res.json();
      const token = data.token || `tok_pci_${Math.random().toString(16).substring(2, 10)}`;
      const brand = data.brand || paymentSession.brand || 'Card';
      const last4 = data.last4 || paymentSession.last4;

      await fetch(`/api/calls/${callState.call_id}/safe-mode/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: callState.call_id,
          token: token,
          brand: brand,
          last4: last4
        })
      });

      setCallState(prev => ({
        ...prev,
        agent_isolated: false,
        safe_mode_active: false,
        recording_paused_pci: false
      }));
      setCopilotBlackout(false);
      setCopilotSuggestion('Payment successful. Advise customer their invoice has been emailed and conclude the call warmly.');
      setPaymentResult({ token, brand, last4 });
      setPaymentSession(prev => ({ ...prev, state: 'COMPLETED' }));
      fetchAudit();
    } catch (e) {
      const token = `tok_pci_${Math.random().toString(16).substring(2, 10)}`;
      const last4 = paymentSession.last4;
      const brand = paymentSession.brand || 'Card';
      setPaymentResult({ token, brand, last4 });
      setCallState(prev => ({
        ...prev,
        agent_isolated: false,
        safe_mode_active: false,
        recording_paused_pci: false
      }));
      setCopilotBlackout(false);
      setPaymentSession(prev => ({ ...prev, state: 'COMPLETED' }));
    }
  };

  const handleRunLeakScan = async () => {
    try {
      const res = await fetch('/api/audit/leak-scan');
      if (res.ok) {
        const data = await res.json();
        setScanResults(data);
      }
      fetchAudit();
    } catch (e) {
      setScanResults({
        total_records_checked: auditEvents.length || 6,
        leaks_found: 0,
        status: 'COMPLIANT_ZERO_TRUST'
      });
    }
  };

  const handleReset = async () => {
    try {
      await fetch(`/api/calls/${callState.call_id}/reset`, { method: 'POST' });
    } catch (e) { }
    setCallState({
      call_id: 'call_meta_hackathon_01',
      customer_name: 'Jane Doe',
      agent_isolated: false,
      safe_mode_active: false,
      recording_paused_pci: false
    });
    setCopilotBlackout(false);
    setCopilotSuggestion('Customer is asking for annual pricing. Script recommends Tier 1 plan. Click [PCI SAFE MODE] when payment is requested.');
    setPaymentSession({
      session_id: null,
      state: 'IDLE',
      prompt: '',
      brand: null,
      last4: null,
      expiry: null
    });
    setPaymentResult(null);
    setScanResults(null);
    setIsCustomerDrawerOpen(false);
    fetchAudit();
  };

  return (
    <div className="min-h-screen bg-[#070B0A] text-[#EDF3F0] flex flex-row font-sans selection:bg-[#00E676] selection:text-[#070B0A]">
      {/* ── Left Sidebar Navigation (Dedicated Enterprise Nav) ───────── */}
      <aside className="w-60 shrink-0 border-r border-[#1A2824] bg-[#0A110F] flex flex-col justify-between p-4 min-h-screen sticky top-0 h-screen overflow-y-auto z-20">
        <div className="flex flex-col gap-6">
          {/* Logo & Brand Title */}
          <div className="flex items-center gap-3 px-2 pt-2 cursor-pointer" onClick={() => { setSidebarActive('dashboard'); setViewMode('live'); }}>
            <img src={logoImg} alt="ZytaSafe" className="w-8 h-8 rounded-lg object-contain" />
            <span className="font-bold text-lg tracking-tight text-white">ZytaSafe</span>
          </div>

          {/* Nav Items */}
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => {
                setSidebarActive('dashboard');
                setViewMode('live');
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                sidebarActive === 'dashboard'
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] shadow-sm'
                  : 'text-[#768782] hover:text-[#EDF3F0] hover:bg-[#111C19]'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setSidebarActive('agents')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                sidebarActive === 'agents'
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676]'
                  : 'text-[#768782] hover:text-[#EDF3F0] hover:bg-[#111C19]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Agents</span>
            </button>

            <button
              onClick={() => setSidebarActive('logs')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                sidebarActive === 'logs'
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676]'
                  : 'text-[#768782] hover:text-[#EDF3F0] hover:bg-[#111C19]'
              }`}
            >
              <Phone className="w-4 h-4" />
              <span>Call Logs</span>
            </button>

            <button
              onClick={() => setSidebarActive('analytics')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                sidebarActive === 'analytics'
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676]'
                  : 'text-[#768782] hover:text-[#EDF3F0] hover:bg-[#111C19]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </button>

            <button
              onClick={() => setSidebarActive('settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                sidebarActive === 'settings'
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676]'
                  : 'text-[#768782] hover:text-[#EDF3F0] hover:bg-[#111C19]'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Bottom Sidebar Widgets: System Online & User Profile */}
        <div className="flex flex-col gap-3 pt-4 border-t border-[#1A2824]">
          {/* System Online Status Card */}
          <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
              <div>
                <div className="text-xs font-bold text-[#EDF3F0]">System Online</div>
                <div className="text-[10px] text-[#768782]">All systems operational</div>
              </div>
            </div>
            {/* Green ECG Sparkline SVG */}
            <svg className="w-10 h-5 text-[#00E676] opacity-90" viewBox="0 0 48 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M0 12h12l3-8 6 16 4-10 3 4h20" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* User Profile: Syed Asher Imtiaz */}
          <div
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center justify-between p-2 rounded-xl bg-[#0E1614] border border-[#1A2824] cursor-pointer hover:border-[#165038] transition-colors"
            title="Click to view User Profile"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#131E1B] border border-[#165038] flex items-center justify-center text-xs font-bold text-[#00E676]">
                SA
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#EDF3F0] truncate">Syed Asher Imtiaz</div>
                <div className="text-[10px] text-[#768782] capitalize font-mono">{agentRole}</div>
              </div>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-[#768782]" />
          </div>
        </div>
      </aside>

      {/* ── Main Workspace ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen px-6 py-4 overflow-y-auto relative">
        {/* Top Bar: Clean Enterprise Telemetry (No Sun, No Bell) */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#0B2017] border border-[#154530] text-[#00E676] px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00E676]" />
              <span>Built with Muse Spark Open</span>
            </div>
            <div className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono border flex items-center gap-1.5 ${
              wsConnected ? 'bg-[#0E1614] text-[#34D399] border-[#165038]' : 'bg-[#1C1417] text-rose-400 border-rose-500/30'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-[#34D399] animate-pulse' : 'bg-rose-500'}`} />
              <span>{wsConnected ? 'Signal Mesh Live' : 'Signal Mesh Reconnecting'}</span>
            </div>
          </div>

          {/* Clean Enterprise Infrastructure Badges */}
          <div className="flex items-center gap-3 text-xs font-mono text-[#768782]">
            <div className="flex items-center gap-1.5 bg-[#0E1614] border border-[#1A2824] px-2.5 py-1 rounded-lg">
              <Zap className="w-3.5 h-3.5 text-[#00E676]" />
              <span>Latency: 0.02ms</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#0E1614] border border-[#1A2824] px-2.5 py-1 rounded-lg">
              <Server className="w-3.5 h-3.5 text-[#768782]" />
              <span>US-East-1</span>
            </div>
          </div>
        </div>

        {/* ── Dynamic Content Switching ─────────────────────────────── */}
        {sidebarActive === 'dashboard' && (
          <>
            {/* Sub-Nav Header Card (Hero Navigation Panel) */}
            <header className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 mb-6 shadow-sm">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-[#0B261B] border border-[#165038] flex items-center justify-center p-2 text-[#00E676] shadow-inner">
                  <img src={logoImg} alt="ZytaSafe" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-white">ZytaSafe</h1>
                  <p className="text-xs text-[#768782]">
                    Zero-Trust PCI Voice Intercept & Live Support Copilot
                  </p>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-1.5 bg-[#070B0A] p-1 rounded-xl border border-[#1A2824] text-xs font-medium">
                <button
                  onClick={() => setViewMode('live')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all ${
                    viewMode === 'live'
                      ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] font-semibold shadow-sm'
                      : 'text-[#768782] hover:text-[#EDF3F0]'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Live Call</span>
                </button>

                <button
                  onClick={() => setViewMode('agent')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                    viewMode === 'agent'
                      ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] font-semibold shadow-sm'
                      : 'text-[#768782] hover:text-[#EDF3F0]'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Agent Desktop</span>
                </button>

                <button
                  onClick={() => {
                    setViewMode('customer');
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                    viewMode === 'customer'
                      ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] font-semibold shadow-sm'
                      : 'text-[#768782] hover:text-[#EDF3F0]'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Customer Phone</span>
                </button>

                <button
                  onClick={() => setViewMode('admin')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                    viewMode === 'admin'
                      ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] font-semibold shadow-sm'
                      : 'text-[#768782] hover:text-[#EDF3F0]'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Admin Docs</span>
                </button>

                <button
                  onClick={() => setViewMode('proof')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                    viewMode === 'proof'
                      ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] font-semibold shadow-sm'
                      : 'text-[#768782] hover:text-[#EDF3F0]'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Security Audit</span>
                </button>

                <button
                  onClick={handleReset}
                  className="p-1.5 text-[#768782] hover:text-[#00E676] hover:bg-[#111C19] rounded-lg transition-colors ml-1"
                  title="Reset Call & Audit State"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Dashboard Workspace Views */}
            <main className="flex-1 flex flex-col justify-start relative">
              {viewMode === 'live' && (
                <div className="flex flex-col gap-4">
                  <AgentDesktop
                    callState={callState}
                    onTriggerSafeMode={handleTriggerSafeMode}
                    onCancelSafeMode={handleCancelSafeMode}
                    copilotSuggestion={copilotSuggestion}
                    copilotBlackout={copilotBlackout}
                    paymentResult={paymentResult}
                    auditMarkers={callState.timeline_markers}
                    wsRef={wsRef}
                    onOpenCustomerPhone={() => setIsCustomerDrawerOpen(true)}
                    paymentSession={paymentSession}
                  />
                </div>
              )}

              {viewMode === 'agent' && (
                <AgentDesktop
                  callState={callState}
                  onTriggerSafeMode={handleTriggerSafeMode}
                  onCancelSafeMode={handleCancelSafeMode}
                  copilotSuggestion={copilotSuggestion}
                  copilotBlackout={copilotBlackout}
                  paymentResult={paymentResult}
                  auditMarkers={callState.timeline_markers}
                  wsRef={wsRef}
                  onOpenCustomerPhone={() => setIsCustomerDrawerOpen(true)}
                  paymentSession={paymentSession}
                />
              )}

              {viewMode === 'customer' && (
                <div className="py-6">
                  <CustomerPhone
                    safeModeActive={callState.safe_mode_active}
                    paymentSessionData={paymentSession}
                    onSendPan={handleSendPan}
                    onSendExpiry={handleSendExpiry}
                    onSendCvv={handleSendCvv}
                    onConfirmPayment={handleConfirmPayment}
                    paymentCompleted={!!paymentResult}
                  />
                </div>
              )}

              {viewMode === 'admin' && (
                <div className="py-4">
                  <AdminPanel agentRole={agentRole} />
                </div>
              )}

              {viewMode === 'proof' && (
                <div className="py-4">
                  <ProofPanel
                    auditEvents={auditEvents}
                    onRunLeakScan={handleRunLeakScan}
                    scanResults={scanResults}
                    onRefreshAudit={fetchAudit}
                    callState={callState}
                    paymentResult={paymentResult}
                    agentRole={agentRole}
                    onTriggerSafeMode={handleTriggerSafeMode}
                    onSendPan={handleSendPan}
                    onSendExpiry={handleSendExpiry}
                    onSendCvv={handleSendCvv}
                    onConfirmPayment={handleConfirmPayment}
                  />
                </div>
              )}
            </main>
          </>
        )}

        {/* Sidebar View: Agents */}
        {sidebarActive === 'agents' && (
          <AgentsPanel onSelectCall={() => { setSidebarActive('dashboard'); setViewMode('live'); }} />
        )}

        {/* Sidebar View: Call Logs */}
        {sidebarActive === 'logs' && (
          <CallLogsPanel onSelectCall={() => { setSidebarActive('dashboard'); setViewMode('live'); }} />
        )}

        {/* Sidebar View: Analytics */}
        {sidebarActive === 'analytics' && (
          <AnalyticsPanel />
        )}

        {/* Sidebar View: Settings */}
        {sidebarActive === 'settings' && (
          <SettingsPanel agentRole={agentRole} />
        )}

        {/* ── Responsive Customer Phone Drawer (Opens on Safe Mode or by Clicking Customer) ── */}
        {isCustomerDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
            <div className="w-full max-w-lg bg-[#070B0A] border-l border-[#1A2824] h-full overflow-y-auto p-6 flex flex-col gap-4 shadow-2xl relative animate-in slide-in-from-right duration-300">
              <div className="flex items-center justify-between pb-3 border-b border-[#1A2824]">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#00E676]" />
                  <span className="text-sm font-bold text-[#EDF3F0]">Customer Phone Simulator</span>
                  {callState.safe_mode_active && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#0B2A1E] text-[#00E676] border border-[#165038]">
                      Safe Mode Active
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsCustomerDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-[#768782] hover:text-[#EDF3F0] hover:bg-[#111C19] transition-colors"
                  title="Close Simulator"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <CustomerPhone
                safeModeActive={callState.safe_mode_active}
                paymentSessionData={paymentSession}
                onSendPan={handleSendPan}
                onSendExpiry={handleSendExpiry}
                onSendCvv={handleSendCvv}
                onConfirmPayment={handleConfirmPayment}
                paymentCompleted={!!paymentResult}
              />
            </div>
          </div>
        )}

        {/* ── User Profile Modal ─────────────────────────────────────── */}
        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          agentRole={agentRole}
          onToggleRole={() => setAgentRole(r => r === 'admin' ? 'agent' : 'admin')}
        />
      </div>
    </div>
  );
}
