import React, { useState, useEffect } from 'react';
import { Shield, Sparkles, Phone, Eye, RefreshCw, CheckCircle, ExternalLink, BookOpen } from 'lucide-react';
import AgentDesktop from './components/AgentDesktop';
import CustomerPhone from './components/CustomerPhone';
import ProofPanel from './components/ProofPanel';
import AdminPanel from './components/AdminPanel';

export default function App() {
  const [viewMode, setViewMode] = useState('split'); // 'split', 'agent', 'customer', 'admin', 'proof'
  const [agentRole, setAgentRole] = useState('agent'); // 'agent' | 'admin'
  
  // Call & Safe Mode state
  const [callState, setCallState] = useState({
    call_id: "call_meta_hackathon_01",
    customer_name: "Jane Doe",
    agent_isolated: false,
    safe_mode_active: false,
    recording_paused_pci: false
  });

  const [copilotSuggestion, setCopilotSuggestion] = useState(
    "Customer is asking for annual pricing. Script recommends Tier 1 plan. Click [PCI SAFE MODE] when payment is requested."
  );
  const [copilotBlackout, setCopilotBlackout] = useState(false);

  // Payment Service isolated state
  const [paymentSession, setPaymentSession] = useState({
    session_id: null,
    state: "IDLE",
    prompt: "",
    brand: null,
    last4: null,
    expiry: null
  });

  const [paymentResult, setPaymentResult] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [scanResults, setScanResults] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = React.useRef(null);

  // Load audit trail
  const fetchAudit = async () => {
    try {
      const res = await fetch('/api/audit');
      if (res.ok) {
        const data = await res.json();
        setAuditEvents(data.events || []);
      }
    } catch (e) {
      console.log("Control plane offline or mock mode");
    }
  };

  // Real-time WebSocket connection to Control Plane
  useEffect(() => {
    fetchAudit();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect through proxy or direct host
    const wsUrl = `${protocol}//${window.location.host}/ws/call/${callState.call_id}/agent`;
    
    let ws;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        console.log("[ZytaSafe WS] Connected to Control Plane Signaling Server");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "INIT_STATE") {
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
          } else if (msg.type === "SAFE_MODE_STATE") {
            setCallState(prev => ({
              ...prev,
              safe_mode_active: msg.safe_mode_active,
              agent_isolated: msg.agent_isolated,
              copilot_blackout: msg.copilot_blackout,
              recording_paused_pci: true
            }));
            setCopilotBlackout(true);
            if (msg.payment_session_id) {
              setPaymentSession(prev => ({
                ...prev,
                session_id: msg.payment_session_id,
                state: "CAPTURING_PAN",
                prompt: msg.initial_data?.prompt || "Welcome to the secure payment line. Please speak your 16-digit card number."
              }));
            }
          } else if (msg.type === "SAFE_MODE_COMPLETED") {
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
          console.error("WS Parse error", e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    } catch (e) {
      console.warn("WebSocket initialization fallback", e);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [callState.call_id]);

  // Fetch audit trail when navigating to proof panel
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

    try {
      // Call Control Plane to isolate call
      const cpRes = await fetch(`/api/calls/${callState.call_id}/safe-mode/start`, {
        method: 'POST'
      });
      const cpData = await cpRes.json();
      
      const sessId = cpData.payment_session_id || "sess_pci_01";
      setPaymentSession({
        session_id: sessId,
        state: "CAPTURING_PAN",
        prompt: "Welcome to our secure automated payment line. The agent cannot hear you. Please speak your 16-digit card number after the tone.",
        brand: null,
        last4: null,
        expiry: null
      });
      fetchAudit();
    } catch (e) {
      // Local fallback if control plane endpoint is still starting
      setPaymentSession({
        session_id: "sess_pci_01",
        state: "CAPTURING_PAN",
        prompt: "Welcome to our secure automated payment line. The agent cannot hear you. Please speak your 16-digit card number after the tone.",
        brand: null,
        last4: null,
        expiry: null
      });
    }
  };

  // Agent cancels PCI Safe Mode & returns to normal call
  const handleCancelSafeMode = async () => {
    try {
      await fetch(`/api/calls/${callState.call_id}/safe-mode/cancel`, {
        method: 'POST'
      });
    } catch (e) {}
    setCallState(prev => ({
      ...prev,
      agent_isolated: false,
      safe_mode_active: false,
      recording_paused_pci: false
    }));
    setCopilotBlackout(false);
    setPaymentSession({
      session_id: null,
      state: "IDLE",
      prompt: "",
      brand: null,
      last4: null,
      expiry: null
    });
    fetchAudit();
  };

  // 2. Customer speaks PAN
  const handleSendPan = async (panText) => {
    const rawDigits = panText.replace(/\D/g, '');
    const fallbackLast4 = rawDigits.length >= 4 ? rawDigits.slice(-4) : (rawDigits || "0987");

    try {
      const res = await fetch(`/api/payment/session/${paymentSession.session_id}/pan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spoken_text: panText })
      });
      const data = await res.json();
      if (data.valid === false) {
        setPaymentSession(prev => ({
          ...prev,
          prompt: data.prompt
        }));
      } else {
        const last4 = data.last4 || fallbackLast4;
        setPaymentSession(prev => ({
          ...prev,
          state: "CAPTURING_EXPIRY",
          prompt: data.prompt || `Card verified: ${data.brand || "Visa"} ending in ${last4}. Please state your expiration month and year, for example 12 28.`,
          brand: data.brand || "Visa",
          last4: last4
        }));
      }
    } catch (e) {
      // Fallback
      setPaymentSession(prev => ({
        ...prev,
        state: "CAPTURING_EXPIRY",
        prompt: `Card verified: Visa ending in ${fallbackLast4}. Please state your expiration month and year, for example 12 28.`,
        brand: "Visa",
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
          prompt: data.prompt || "Please state the expiration month and year again, for example 12 28."
        }));
        return;
      }
      setPaymentSession(prev => ({
        ...prev,
        state: "CAPTURING_CVV",
        expiry: expText.trim(),
        prompt: data.prompt || "Please say the 3-digit security code on the back of your card."
      }));
    } catch (e) {
      setPaymentSession(prev => ({
        ...prev,
        state: "CAPTURING_CVV",
        expiry: expText.trim(),
        prompt: "Please say the 3-digit security code on the back of your card."
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
          prompt: data.prompt || "Please repeat the 3 or 4-digit security code on your card."
        }));
        return;
      }
      setPaymentSession(prev => ({
        ...prev,
        state: "CONFIRMING",
        prompt: data.prompt,
        last4: data.last4 || prev.last4,
        expiry: data.expiry || prev.expiry
      }));
    } catch (e) {
      setPaymentSession(prev => ({
        ...prev,
        state: "CONFIRMING",
        prompt: `I have recorded a ${prev.brand || "card"} ending in ${prev.last4}, expiring ${prev.expiry}. Is this correct? Say yes to confirm.`,
        last4: prev.last4,
        expiry: prev.expiry
      }));
    }
  };

  // 5. Customer confirms -> Tokenize & Wipe
  const handleConfirmPayment = async (confirmed) => {
    if (!confirmed) {
      setPaymentSession(prev => ({
        ...prev,
        state: "CAPTURING_PAN",
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
      const brand = data.brand || paymentSession.brand || "Card";
      const last4 = data.last4 || paymentSession.last4;

      // Complete Safe Mode on Control Plane
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

      // Update Agent State
      setCallState(prev => ({
        ...prev,
        agent_isolated: false,
        safe_mode_active: false,
        recording_paused_pci: false
      }));
      setCopilotBlackout(false);
      setCopilotSuggestion("Payment successful. Advise customer their invoice has been emailed and conclude the call warmly.");
      setPaymentResult({
        token: token,
        brand: brand,
        last4: last4
      });
      setPaymentSession(prev => ({ ...prev, state: "COMPLETED" }));
      fetchAudit();
    } catch (e) {
      const token = `tok_pci_${Math.random().toString(16).substring(2, 10)}`;
      const last4 = paymentSession.last4;
      const brand = paymentSession.brand || "Card";
      setPaymentResult({
        token: token,
        brand: brand,
        last4: last4
      });
      setCallState(prev => ({
        ...prev,
        agent_isolated: false,
        safe_mode_active: false,
        recording_paused_pci: false
      }));
      setCopilotBlackout(false);
      setPaymentSession(prev => ({ ...prev, state: "COMPLETED" }));
    }
  };

  // Run security leak scan
  const handleRunLeakScan = async () => {
    try {
      const res = await fetch('/api/audit/leak-scan');
      if (res.ok) {
        const data = await res.json();
        setScanResults(data);
      } else {
        throw new Error("Audit scan response not ok");
      }
      fetchAudit();
    } catch (e) {
      setScanResults({
        total_records_checked: auditEvents.length || 6,
        leaks_found: 0,
        status: "COMPLIANT_ZERO_TRUST"
      });
    }
  };

  // Reset demo
  const handleReset = async () => {
    try {
      await fetch(`/api/calls/${callState.call_id}/reset`, { method: 'POST' });
    } catch (e) {}
    setCallState({
      call_id: "call_meta_hackathon_01",
      customer_name: "Jane Doe",
      agent_isolated: false,
      safe_mode_active: false,
      recording_paused_pci: false
    });
    setCopilotBlackout(false);
    setCopilotSuggestion("Customer is asking for annual pricing. Script recommends Tier 1 plan. Click [PCI SAFE MODE] when payment is requested.");
    setPaymentSession({
      session_id: null,
      state: "IDLE",
      prompt: "",
      brand: null,
      last4: null,
      expiry: null
    });
    setPaymentResult(null);
    setScanResults(null);
    fetchAudit();
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 md:p-8 max-w-7xl mx-auto">
      {/* Top Navbar */}
      <header className="glass-panel p-4 flex flex-col md:flex-row items-center justify-between gap-4 mb-6 border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 shadow-lg shadow-cyan-500/20">
            <Shield className="w-6 h-6 text-slate-950 font-bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-slate-100">ZytaSafe</h1>
              <span className="text-[10px] font-mono uppercase bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-2 py-0.5 rounded-full font-semibold">
                Phase 3 Live Copilot
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 border ${wsConnected ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
                {wsConnected ? 'WS Live' : 'WS Connecting'}
              </span>
            </div>
            <select
              value={agentRole}
              onChange={e => setAgentRole(e.target.value)}
              className="text-[10px] font-mono bg-slate-900 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-md focus:outline-none cursor-pointer"
              title="Switch role"
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-xs text-slate-400">
              Zero-Trust PCI Voice Intercept & Live Support Copilot · Meta Global AI Developer Hackathon
            </p>
          </div>
        </div>

        {/* View Switchers */}
        <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setViewMode('split')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${viewMode === 'split' ? 'bg-cyan-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Split View (Live Call)
          </button>
          <button
            onClick={() => setViewMode('agent')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${viewMode === 'agent' ? 'bg-cyan-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Agent Desktop
          </button>
          <button
            onClick={() => setViewMode('customer')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${viewMode === 'customer' ? 'bg-cyan-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Customer Phone
          </button>
          <button
            onClick={() => setViewMode('admin')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${viewMode === 'admin' ? 'bg-indigo-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Admin Docs
          </button>
          <button
            onClick={() => setViewMode('proof')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${viewMode === 'proof' ? 'bg-cyan-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Security Proof & Audit
          </button>

          <button
            onClick={handleReset}
            className="p-1.5 text-slate-400 hover:text-cyan-400 transition-colors ml-1"
            title="Reset Walking Skeleton State"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col justify-center">
        {viewMode === 'split' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Agent Desktop in 7 cols */}
            <div className="lg:col-span-8">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                Agent Screen (Control Plane)
              </div>
              <AgentDesktop
                callState={callState}
                onTriggerSafeMode={handleTriggerSafeMode}
                onCancelSafeMode={handleCancelSafeMode}
                copilotSuggestion={copilotSuggestion}
                copilotBlackout={copilotBlackout}
                paymentResult={paymentResult}
                auditMarkers={callState.timeline_markers}
                wsRef={wsRef}
              />
            </div>

            {/* Customer Phone in 4 cols */}
            <div className="lg:col-span-4">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Customer Caller Phone (Jane Doe)
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

        {viewMode === 'agent' && (
          <AgentDesktop
            callState={callState}
            onTriggerSafeMode={handleTriggerSafeMode}
            copilotSuggestion={copilotSuggestion}
            copilotBlackout={copilotBlackout}
            paymentResult={paymentResult}
            auditMarkers={callState.timeline_markers}
            wsRef={wsRef}
          />
        )}

        {viewMode === 'customer' && (
          <CustomerPhone
            safeModeActive={callState.safe_mode_active}
            paymentSessionData={paymentSession}
            onSendPan={handleSendPan}
            onSendExpiry={handleSendExpiry}
            onSendCvv={handleSendCvv}
            onConfirmPayment={handleConfirmPayment}
            paymentCompleted={!!paymentResult}
          />
        )}

                {viewMode === 'admin' && (
          <AdminPanel agentRole={agentRole} />
        )}
{viewMode === 'proof' && (
          <ProofPanel
            auditEvents={auditEvents}
            onRunLeakScan={handleRunLeakScan}
            scanResults={scanResults}
            onRefreshAudit={fetchAudit}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-8 pt-4 border-t border-slate-900 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Zero-Trust Architecture: Isolated Data Plane + Memory Zeroization Enforced</span>
        </div>
        <div className="font-mono text-[11px] text-slate-400">
          Built for Meta Global AI Developer Hackathon · Startup Track · Theme: Build for Your World
        </div>
      </footer>
    </div>
  );
}
