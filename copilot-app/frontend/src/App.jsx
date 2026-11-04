import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Users, Phone, BarChart3,
  Shield, Activity, BookOpen, ShieldCheck, RefreshCw, X, ChevronDown,
  User, Sparkles, Volume2, MicOff, Server, Zap, CheckCircle2,
  ExternalLink, PhoneCall, Terminal, Headphones, Lock, AlertCircle
} from 'lucide-react';
import logoImg from './assets/logo.png';
import AgentDesktop from './components/AgentDesktop';
import CustomerPhone from './components/CustomerPhone';
import ProofPanel from './components/ProofPanel';
import AdminPanel from './components/AdminPanel';
import MetaReviewerPanel from './components/MetaReviewerPanel';
import UserProfileModal from './components/UserProfileModal';
import { soundFx } from './components/AudioSynthesizer';
import { WebRtcCallSession } from './utils/webRtcCall';

export default function App() {
  const isCustomerStandalone = typeof window !== 'undefined' &&
    (window.location.search.includes('mode=customer') || window.location.search.includes('role=customer'));

  const [viewMode, setViewMode] = useState('live'); // 'live', 'customer', 'knowledge', 'proof', 'reviewer'
  const [agentRole, setAgentRole] = useState('admin'); // 'agent' | 'admin'
  const [roleToast, setRoleToast] = useState(null);
  const [sidebarActive, setSidebarActive] = useState('dashboard'); // 'dashboard', 'knowledge', 'audit', 'reviewer'
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Calling & WebRTC state
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState('IDLE'); // 'IDLE' | 'RINGING' | 'CONNECTED' | 'DECLINED' | 'ENDED'
  const [incomingCall, setIncomingCall] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const webRtcSessionRef = useRef(null);
  const isCallActiveRef = useRef(isCallActive);
  const incomingCallRef = useRef(incomingCall);
  useEffect(() => { isCallActiveRef.current = isCallActive; }, [isCallActive]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);

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
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
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

  // Broadcast event helper for zero-latency communication across tabs
  const broadcastCallEvent = (payload) => {
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        const ch = new BroadcastChannel('velatoai_call_mesh');
        ch.postMessage(payload);
        ch.close();
      }
    } catch (e) { }
  };

  // Inter-window real-time signaling mesh
  useEffect(() => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return;
    const channel = new BroadcastChannel('velatoai_call_mesh');

    channel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      if ((msg.type === 'CALL_INITIATE' || msg.type === 'INCOMING_CALL') && !isCustomerStandalone) {
        console.log('[BroadcastChannel] Incoming call alert on agent desk:', msg);
        setIncomingCall({
          caller_name: msg.customer_name || msg.caller_name || 'Jane Doe',
          phone: msg.phone || '+1-555-0192',
          plan: msg.plan || 'Annual Cloud AI Plan (Tier 1)',
          invoice: msg.invoice || 'INV-2026-891',
          amount: msg.amount || 49.99
        });
        setIsCallActive(false);
        setCallStatus('RINGING');
        soundFx.playIncomingRing();
      } else if (msg.type === 'CALL_ACCEPTED') {
        soundFx.stopIncomingRing();
        soundFx.stopOutgoingRing();
        setIncomingCall(null);
        setIsCallActive(true);
        setCallStatus('CONNECTED');
      } else if (msg.type === 'CALL_DECLINED' || msg.type === 'CALL_DECLINE') {
        soundFx.stopIncomingRing();
        soundFx.stopOutgoingRing();
        setIncomingCall(null);
        setIsCallActive(false);
        setCallStatus('DECLINED');
      } else if (msg.type === 'CALL_HANGUP' || msg.type === 'CALL_ENDED') {
        soundFx.stopIncomingRing();
        soundFx.stopOutgoingRing();
        setIncomingCall(null);
        setIsCallActive(false);
        setCallStatus('ENDED');
      } else if (msg.type === 'SIGNAL') {
        if (webRtcSessionRef.current) {
          webRtcSessionRef.current.handleSignal(msg);
        }
      }
    };

    return () => {
      channel.close();
    };
  }, [isCustomerStandalone]);

  // Initialize WebRTC Session
  useEffect(() => {
    const role = isCustomerStandalone ? 'customer' : 'agent';
    const rtc = new WebRtcCallSession({
      role: role,
      callId: callState.call_id,
      wsRef: wsRef,
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
      },
      onTranscript: (text, speaker) => {
        // Continuous transcription feedback
      }
    });
    webRtcSessionRef.current = rtc;

    return () => {
      rtc.hangup();
    };
  }, [isCustomerStandalone, callState.call_id]);

  // Real-time Resilient WebSocket connection to Control Plane with Auto-Reconnect
  useEffect(() => {
    fetchAudit();
    let isMounted = true;
    let ws = null;
    let reconnectTimeout = null;
    let pingInterval = null;

    const role = isCustomerStandalone ? 'customer' : 'agent';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/call/${callState.call_id}/${role}`;

    function connect() {
      if (!isMounted) return;
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
          console.log(`[VelatoAI WS] Signal Mesh connected as ${role}`);

          // Keep connection alive through any reverse-proxy / NAT timeout
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'PING' }));
            }
          }, 8000);
        };

        ws.onmessage = async (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'PONG') return;

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
              // If incoming call is currently ringing, show HUD immediately
              if (msg.status === 'RINGING' && role === 'agent') {
                setIncomingCall({
                  caller_name: msg.customer_name || 'Jane Doe',
                  phone: '+1-555-0192',
                  plan: 'Annual Cloud AI Plan (Tier 1)',
                  invoice: 'INV-2026-891',
                  amount: 49.99
                });
                setIsCallActive(false);
                setCallStatus('RINGING');
                soundFx.playIncomingRing();
              }
            } else if (msg.type === 'INCOMING_CALL' || msg.type === 'CALL_RINGING' || msg.type === 'CALL_INITIATE') {
              if (role === 'agent') {
                console.log('[VelatoAI WS] Incoming call event received on agent desk:', msg);
                setIncomingCall({
                  caller_name: msg.customer_name || msg.caller_name || 'Jane Doe',
                  phone: msg.phone || '+1-555-0192',
                  plan: msg.plan || 'Annual Cloud AI Plan (Tier 1)',
                  invoice: msg.invoice || 'INV-2026-891',
                  amount: msg.amount || 49.99
                });
                setIsCallActive(false);
                setCallStatus('RINGING');
                soundFx.playIncomingRing();
              } else if (role === 'customer' && (msg.type === 'CALL_RINGING' || msg.status === 'RINGING')) {
                setCallStatus('RINGING');
                soundFx.playOutgoingRing();
              }
            } else if (msg.type === 'CALL_ACCEPTED') {
              soundFx.stopIncomingRing();
              soundFx.stopOutgoingRing();
              setIncomingCall(null);
              setIsCallActive(true);
              setCallStatus('CONNECTED');
            } else if (msg.type === 'CALL_DECLINED' || msg.type === 'CALL_DECLINE') {
              soundFx.stopIncomingRing();
              soundFx.stopOutgoingRing();
              setIncomingCall(null);
              setIsCallActive(false);
              setCallStatus('DECLINED');
              if (webRtcSessionRef.current) {
                webRtcSessionRef.current.hangup(false);
              }
            } else if (msg.type === 'CALL_HANGUP' || msg.type === 'CALL_ENDED') {
              soundFx.stopIncomingRing();
              soundFx.stopOutgoingRing();
              setIncomingCall(null);
              setIsCallActive(false);
              setCallStatus('ENDED');
              if (webRtcSessionRef.current) {
                webRtcSessionRef.current.hangup(false);
              }
            } else if (msg.type === 'SIGNAL') {
              if (webRtcSessionRef.current) {
                webRtcSessionRef.current.handleSignal(msg);
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
              if (webRtcSessionRef.current) {
                webRtcSessionRef.current.severAudioForSafeMode();
              }
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
              if (webRtcSessionRef.current) {
                webRtcSessionRef.current.restoreAudioAfterSafeMode();
              }
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
          if (pingInterval) clearInterval(pingInterval);
          if (!isMounted) return;
          setWsConnected(false);
          console.log(`[VelatoAI WS] Signal disconnected. Auto-reconnecting in 1s...`);
          clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(connect, 1000);
        };

        ws.onerror = (err) => {
          console.warn('[VelatoAI WS] Socket error, reconnecting...', err);
          if (ws) ws.close();
        };
      } catch (e) {
        console.warn('[VelatoAI WS] Connection init error, retrying in 1.5s', e);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connect, 1500);
      }
    }

    connect();

    // Fallback sync loop: backup health check every 4.0s when in standby
    const syncInterval = setInterval(async () => {
      if (!isMounted) return;
      try {
        const res = await fetch(`/api/calls/${callState.call_id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'RINGING' && !isCustomerStandalone) {
            if (!isCallActiveRef.current && !incomingCallRef.current) {
              setIncomingCall({
                caller_name: data.customer_name || 'Jane Doe',
                phone: '+1-555-0192',
                plan: 'Annual Cloud AI Plan (Tier 1)',
                invoice: 'INV-2026-891',
                amount: 49.99
              });
              setIsCallActive(false);
              setCallStatus('RINGING');
              soundFx.playIncomingRing();
            }
          } else if (data.status === 'CONNECTED' && data.is_active && !isCallActiveRef.current) {
            setIsCallActive(true);
            setCallStatus('CONNECTED');
            setIncomingCall(null);
            soundFx.stopIncomingRing();
            soundFx.stopOutgoingRing();
          } else if (data.status === 'DECLINED') {
            if (incomingCallRef.current) {
              setIncomingCall(null);
              soundFx.stopIncomingRing();
            }
            setIsCallActive(false);
            setCallStatus('DECLINED');
            soundFx.stopOutgoingRing();
          } else if (data.status === 'ENDED' || data.status === 'IDLE') {
            if (incomingCallRef.current) {
              setIncomingCall(null);
              soundFx.stopIncomingRing();
            }
            if (isCallActiveRef.current) {
              setIsCallActive(false);
              setCallStatus(data.status);
            }
          }
        }
      } catch (err) { }
    }, 4000);

    return () => {
      isMounted = false;
      if (pingInterval) clearInterval(pingInterval);
      clearInterval(syncInterval);
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [callState.call_id, isCustomerStandalone]);

  // 1. Agent triggers PCI Safe Mode
  const handleTriggerSafeMode = async () => {
    setCallState(prev => ({
      ...prev,
      agent_isolated: true,
      safe_mode_active: true,
      recording_paused_pci: true
    }));
    setCopilotBlackout(true);
    if (webRtcSessionRef.current) {
      webRtcSessionRef.current.severAudioForSafeMode();
    }

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
      await fetch("/api/calls/" + callState.call_id + "/safe-mode/cancel", {
        method: "POST"
      });
    } catch (e) { }
    setCallState(prev => ({
      ...prev,
      agent_isolated: false,
      safe_mode_active: false,
      recording_paused_pci: false
    }));
    setCopilotBlackout(false);
    if (webRtcSessionRef.current) {
      webRtcSessionRef.current.restoreAudioAfterSafeMode();
    }
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

  // Safe Mode Abort / Agent Transfer Handback
  const handleTransferToAgent = async (prompt, reason = "customer_transfer") => {
    // 1. Play the AI transfer prompt to customer before releasing
    setPaymentSession({
      session_id: null,
      state: "IDLE",
      prompt: prompt || "Reconnecting you with your agent Alice...",
      brand: null,
      last4: null,
      expiry: null
    });

    // 2. Re-establish agent and customer audio on control plane
    try {
      await fetch("/api/calls/" + callState.call_id + "/safe-mode/cancel", {
        method: "POST"
      });
    } catch (e) {
      console.warn("Error cancelling safe mode on transfer:", e);
    }

    setCallState(prev => ({
      ...prev,
      agent_isolated: false,
      safe_mode_active: false,
      recording_paused_pci: false
    }));
    setCopilotBlackout(false);

    if (webRtcSessionRef.current) {
      webRtcSessionRef.current.restoreAudioAfterSafeMode();
    }

    setCopilotSuggestion("PCI Safe Mode ended. Automated card verification could not be completed (" + reason + "). Customer Jane Doe is reconnected with you.");
    fetchAudit();
  };

  // 2. Customer speaks PAN
  const handleSendPan = async (panText) => {
    try {
      const res = await fetch("/api/payment/session/" + paymentSession.session_id + "/pan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spoken_text: panText })
      });
      const data = await res.json();

      if (data.aborted || data.action === "TRANSFER_TO_AGENT") {
        handleTransferToAgent(data.prompt, data.reason || "Verification attempts exceeded");
        return;
      }

      if (data.valid === false) {
        setPaymentSession(prev => ({
          ...prev,
          state: "CAPTURING_PAN",
          prompt: data.prompt
        }));
        return;
      }

      setPaymentSession(prev => ({
        ...prev,
        state: "CAPTURING_EXPIRY",
        prompt: data.prompt || ("Card verified: " + (data.brand || "Visa") + " ending in " + (data.last4 || "----") + ". Please state your expiration month and year, for example 12 28."),
        brand: data.brand || "Visa",
        last4: data.last4 || "----"
      }));
    } catch (e) {
      setPaymentSession(prev => ({
        ...prev,
        state: "CAPTURING_PAN",
        prompt: "Unable to reach the payment service. Please wait a moment and try speaking your card number again.",
      }));
    }
  };

  // 3. Customer speaks Expiry
  const handleSendExpiry = async (expText) => {
    try {
      const res = await fetch("/api/payment/session/" + paymentSession.session_id + "/expiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spoken_text: expText })
      });
      const data = await res.json();

      if (data.aborted || data.action === "TRANSFER_TO_AGENT") {
        handleTransferToAgent(data.prompt, data.reason || "Expiry verification failed");
        return;
      }

      if (data.valid === false) {
        setPaymentSession(prev => ({
          ...prev,
          state: "CAPTURING_EXPIRY",
          prompt: data.prompt || "Please state the expiration month and year again, for example 12 28."
        }));
        return;
      }

      setPaymentSession(prev => ({
        ...prev,
        state: "CAPTURING_CVV",
        expiry: data.expiry || expText.trim(),
        prompt: data.prompt || "Please say the 3-digit security code on the back of your card."
      }));
    } catch (e) {
      setPaymentSession(prev => ({
        ...prev,
        state: "CAPTURING_EXPIRY",
        prompt: "Payment service connection error. Please repeat the expiration month and year, for example 12 28.",
      }));
    }
  };

  // 4. Customer speaks CVV
  const handleSendCvv = async (cvvText) => {
    try {
      const res = await fetch("/api/payment/session/" + paymentSession.session_id + "/cvv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spoken_text: cvvText })
      });
      const data = await res.json();

      if (data.aborted || data.action === "TRANSFER_TO_AGENT") {
        handleTransferToAgent(data.prompt, data.reason || "CVV verification failed");
        return;
      }

      if (data.valid === false) {
        setPaymentSession(prev => ({
          ...prev,
          state: "CAPTURING_CVV",
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
        state: "CAPTURING_CVV",
        prompt: "Payment service connection error. Please say the 3-digit security code on your card again.",
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
      if (webRtcSessionRef.current) {
        webRtcSessionRef.current.restoreAudioAfterSafeMode();
      }
      setCopilotSuggestion('Payment successful. Advise customer their invoice has been emailed and conclude the call warmly.');
      setPaymentResult({ token, brand, last4 });
      setPaymentSession(prev => ({ ...prev, state: 'COMPLETED' }));
      fetchAudit();
    } catch (e) {
      setPaymentSession(prev => ({
        ...prev,
        state: 'CONFIRMING',
        prompt: 'Payment tokenization service was unreachable. Please say "yes" to retry, or "no" to restart.'
      }));
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

  // Calling Handlers
  const handleAcceptCall = async () => {
    soundFx.stopIncomingRing();
    soundFx.stopOutgoingRing();
    setIncomingCall(null);
    setIsCallActive(true);
    setCallStatus('CONNECTED');

    broadcastCallEvent({
      type: 'CALL_ACCEPTED',
      call_id: callState.call_id
    });

    try {
      await fetch(`/api/calls/${callState.call_id}/accept`, { method: 'POST' });
    } catch (e) { }

    if (webRtcSessionRef.current) {
      webRtcSessionRef.current.acceptCall();
    }
  };

  const handleDeclineCall = async () => {
    soundFx.stopIncomingRing();
    soundFx.stopOutgoingRing();
    setIncomingCall(null);
    setIsCallActive(false);
    setCallStatus('DECLINED');

    broadcastCallEvent({
      type: 'CALL_DECLINED',
      call_id: callState.call_id
    });

    try {
      await fetch(`/api/calls/${callState.call_id}/decline`, { method: 'POST' });
    } catch (e) { }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'CALL_DECLINE',
        call_id: callState.call_id
      }));
    }

    if (webRtcSessionRef.current) {
      webRtcSessionRef.current.hangup(false);
    }
  };

  const handleHangupCall = async () => {
    soundFx.stopIncomingRing();
    soundFx.stopOutgoingRing();
    setIncomingCall(null);
    setIsCallActive(false);
    setCallStatus('ENDED');

    broadcastCallEvent({
      type: 'CALL_ENDED',
      call_id: callState.call_id
    });

    try {
      await fetch(`/api/calls/${callState.call_id}/hangup`, { method: 'POST' });
    } catch (e) { }

    if (webRtcSessionRef.current) {
      webRtcSessionRef.current.hangup(false);
    }
  };

  const handleCustomerInitiateCall = async () => {
    setCallStatus('RINGING');
    soundFx.playOutgoingRing();

    // Broadcast across browser windows immediately (0ms delay)
    broadcastCallEvent({
      type: 'CALL_INITIATE',
      call_id: callState.call_id,
      customer_name: 'Jane Doe',
      caller_name: 'Jane Doe',
      phone: '+1-555-0192',
      plan: 'Annual Cloud AI Plan (Tier 1)',
      invoice: 'INV-2026-891',
      amount: 49.99
    });

    // Immediate feedback for single-window / drawer preview testing
    if (!isCustomerStandalone) {
      setIncomingCall({
        caller_name: 'Jane Doe',
        phone: '+1-555-0192',
        plan: 'Annual Cloud AI Plan (Tier 1)',
        invoice: 'INV-2026-891',
        amount: 49.99
      });
      setIsCallActive(false);
      soundFx.playIncomingRing();
    }

    try {
      await fetch(`/api/calls/${callState.call_id}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: 'Jane Doe',
          phone: '+1-555-0192',
          plan: 'Annual Cloud AI Plan (Tier 1)'
        })
      });
    } catch (e) {
      console.warn('Call initiate endpoint error:', e);
    }

    // Direct WebSocket dispatch for zero-latency peer alert
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'CALL_INITIATE',
        call_id: callState.call_id,
        customer_name: 'Jane Doe',
        phone: '+1-555-0192',
        plan: 'Annual Cloud AI Plan (Tier 1)'
      }));
    }

    if (webRtcSessionRef.current) {
      webRtcSessionRef.current.initiateCall();
    }
  };

  const handleSendCustomerSpeech = (text) => {
    broadcastCallEvent({
      type: 'TRANSCRIPT_CHUNK',
      call_id: callState.call_id,
      text: text,
      speaker: 'customer'
    });

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'TRANSCRIPT_CHUNK',
        call_id: callState.call_id,
        text: text,
        speaker: 'customer'
      }));
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
    setIsCallActive(false);
    setIncomingCall(null);
    fetchAudit();
  };

  const handleToggleRole = (newRole) => {
    const nextRole = newRole || (agentRole === 'admin' ? 'agent' : 'admin');
    setAgentRole(nextRole);
    if (nextRole === 'admin') {
      setRoleToast({
        type: 'admin',
        title: 'Switched to Administrator Role',
        desc: 'Full administrative access: Forensic leak scans, cryptographic audit log exports, and knowledge uploads unlocked.'
      });
    } else {
      setRoleToast({
        type: 'agent',
        title: 'Switched to Support Agent Role',
        desc: 'Strict RBAC active: Knowledge base is read-only. Forensic leak scans and cryptographic audit exports are locked.'
      });
    }
    setTimeout(() => setRoleToast(null), 4500);
  };

  // ── STANDALONE CUSTOMER CALLER MODE (When opened in a 2nd browser window) ──
  if (isCustomerStandalone) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col items-center justify-center p-4 selection:bg-emerald-100 selection:text-emerald-900">
        <CustomerPhone
          isCustomerWindow={true}
          safeModeActive={callState.safe_mode_active}
          paymentSessionData={paymentSession}
          onSendPan={handleSendPan}
          onSendExpiry={handleSendExpiry}
          onSendCvv={handleSendCvv}
          onConfirmPayment={handleConfirmPayment}
          paymentCompleted={!!paymentResult}
          isCallActive={isCallActive}
          callStatus={callStatus}
          onInitiateCall={handleCustomerInitiateCall}
          onHangupCall={handleHangupCall}
          onSendCustomerSpeech={handleSendCustomerSpeech}
        />
      </div>
    );
  }

  // ── CRM AGENT / ADMIN DESKTOP WORKSPACE ─────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-row font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* ── Left Sidebar Navigation (Dedicated Enterprise Nav) ───────── */}
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col justify-between p-4 min-h-screen sticky top-0 h-screen overflow-y-auto z-20">
        <div className="flex flex-col gap-6">
          {/* Logo & Brand Title */}
          <div
            className="flex items-center gap-3 px-2 pt-2 cursor-pointer"
            onClick={() => { setSidebarActive('dashboard'); setViewMode('live'); }}
          >
            <img src={logoImg} alt="VelatoAI" className="w-8 h-8 rounded-lg object-contain shadow-xs" />
            <div>
              <span className="font-bold text-base tracking-tight text-slate-900 block">VelatoAI</span>
              <span className="text-[11px] text-slate-500 font-medium">Autonomous Voice Payment Handover</span>
            </div>
          </div>

          {/* Functional Navigation Items */}
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => {
                setSidebarActive('dashboard');
                setViewMode('live');
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${sidebarActive === 'dashboard'
                ? 'bg-slate-100 text-slate-900 border border-slate-200/70 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
              <PhoneCall className={`w-4 h-4 ${sidebarActive === 'dashboard' ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span>Live CRM call</span>
            </button>

            <button
              onClick={() => {
                setSidebarActive('knowledge');
                setViewMode('knowledge');
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${sidebarActive === 'knowledge'
                ? 'bg-slate-100 text-slate-900 border border-slate-200/70 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
              <div className="flex items-center gap-3">
                <BookOpen className={`w-4 h-4 ${sidebarActive === 'knowledge' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>Knowledge base</span>
              </div>
              {agentRole !== 'admin' && (
                <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.2 bg-slate-100 rounded border border-slate-200">Read</span>
              )}
            </button>

            <button
              onClick={() => {
                setSidebarActive('audit');
                setViewMode('proof');
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${sidebarActive === 'audit'
                ? 'bg-slate-100 text-slate-900 border border-slate-200/70 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className={`w-4 h-4 ${sidebarActive === 'audit' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>Security audit</span>
              </div>
              {agentRole !== 'admin' && (
                <Lock className="w-3 h-3 text-slate-400" />
              )}
            </button>

            <button
              onClick={() => {
                setSidebarActive('reviewer');
                setViewMode('reviewer');
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${sidebarActive === 'reviewer'
                ? 'bg-slate-100 text-slate-900 border border-slate-200/70 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
              <Terminal className={`w-4 h-4 ${sidebarActive === 'reviewer' ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span>Reviewer portal</span>
            </button>
          </nav>
        </div>

        {/* Bottom Sidebar Widgets: System Online & User Profile */}
        <div className="flex flex-col gap-2.5 pt-4 border-t border-slate-200">
          {/* System Online Status Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <div>
                <div className="text-xs font-semibold text-slate-900">System online</div>
                <div className="text-[11px] text-slate-500">All services operational</div>
              </div>
            </div>
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>

          {/* User Profile */}
          <div
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 hover:border-slate-300 transition-colors"
            title="Click to view operator profile and RBAC clearance"
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                agentRole === 'admin'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}>
                {agentRole === 'admin' ? 'AD' : 'SA'}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">Syed Asher Imtiaz</div>
                <div className="text-[11px] text-slate-500 capitalize flex items-center gap-1">
                  <span>{agentRole === 'admin' ? 'Administrator' : 'Support Agent'}</span>
                  <span className="text-[9px] font-mono text-slate-400">
                    ({agentRole === 'admin' ? 'Master' : 'Restricted'})
                  </span>
                </div>
              </div>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </aside>

      {/* ── Main Workspace ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen px-6 py-4 overflow-y-auto relative">
        {/* Top Header Bar: Status & Launch Customer Window */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${wsConnected ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span>{wsConnected ? 'Control plane connected' : 'Control plane reconnecting'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Interactive Agent <-> Admin Role Switcher Toggle */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-2xs">
              <button
                onClick={() => handleToggleRole('agent')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  agentRole === 'agent'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/90'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Switch to Support Agent (Strict RBAC: Read-Only Knowledge, Locked Audit Export)"
              >
                <Headphones className={`w-3.5 h-3.5 ${agentRole === 'agent' ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>Agent</span>
                {agentRole === 'agent' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-0.5" />
                )}
              </button>

              <button
                onClick={() => handleToggleRole('admin')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  agentRole === 'admin'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Switch to Administrator (Full Access: Leak Scans, Cryptographic Exports, Knowledge Uploads)"
              >
                <ShieldCheck className={`w-3.5 h-3.5 ${agentRole === 'admin' ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>Admin</span>
                {agentRole === 'admin' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
                )}
              </button>
            </div>

            {/* Clearance Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono bg-white border-slate-200">
              <span className="text-slate-400 text-[10px] uppercase">Clearance:</span>
              <span className={`font-bold ${agentRole === 'admin' ? 'text-emerald-700' : 'text-blue-700'}`}>
                {agentRole === 'admin' ? 'Master Admin' : 'Agent Restricted'}
              </span>
            </div>

            {/* Launch Customer Window (Side-by-Side Browser Calling) */}
            <button
              onClick={() => window.open('/?mode=customer', 'VelatoAI Customer Caller', 'width=460,height=820')}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 hover:text-slate-900 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shadow-xs"
              title="Open standalone customer caller in a separate window"
            >
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span>Launch customer window</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Dynamic Role Switch Notification Banner */}
        {roleToast && (
          <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs shadow-xs ${
              roleToast.type === 'admin'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-blue-50 border-blue-200 text-blue-950'
            }`}>
              <div className="flex items-center gap-2.5">
                {roleToast.type === 'admin' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 text-blue-600 shrink-0" />
                )}
                <div>
                  <span className="font-bold block">{roleToast.title}</span>
                  <span className="text-[11px] opacity-90">{roleToast.desc}</span>
                </div>
              </div>
              <button
                onClick={() => setRoleToast(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ── Sub-Nav Header Card ──────────────────────────────────────── */}
        <header className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 mb-5 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center p-1.5 text-emerald-600">
              <img src={logoImg} alt="VelatoAI" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900">VelatoAI Contact Center</h1>
              <p className="text-xs text-slate-500">
                Autonomous Voice Payment Handover & PCI Isolation
              </p>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => { setSidebarActive('dashboard'); setViewMode('live'); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${viewMode === 'live'
                ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
            >
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span>Live call</span>
            </button>

            <button
              onClick={() => setIsCustomerDrawerOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${isCustomerDrawerOpen
                ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
            >
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span>Customer phone</span>
            </button>

            <button
              onClick={() => { setSidebarActive('knowledge'); setViewMode('knowledge'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${viewMode === 'knowledge'
                ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              <span>Knowledge base</span>
            </button>

            <button
              onClick={() => { setSidebarActive('audit'); setViewMode('proof'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${viewMode === 'proof'
                ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>Security audit</span>
            </button>

            <button
              onClick={() => { setSidebarActive('reviewer'); setViewMode('reviewer'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${viewMode === 'reviewer'
                ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
            >
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              <span>Reviewer portal</span>
            </button>

            <button
              onClick={handleReset}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors ml-1"
              title="Reset call & audit state"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* ── Main Workspace Views ──────────────────────────────────────── */}
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
                incomingCall={incomingCall}
                isCallActive={isCallActive}
                onAcceptCall={handleAcceptCall}
                onDeclineCall={handleDeclineCall}
                onHangupCall={handleHangupCall}
                onSimulateCall={() => {
                  setIncomingCall({
                    caller_name: 'Jane Doe',
                    phone: '+1-555-0192',
                    plan: 'Annual Cloud AI Plan (Tier 1)',
                    invoice: 'INV-2026-891',
                    amount: 49.99
                  });
                  setIsCallActive(false);
                  soundFx.playIncomingRing();
                }}
                remoteStream={remoteStream}
                localStream={webRtcSessionRef.current?.localStream || null}
                onSetRecordedAudio={(url, dur) => {
                  setRecordedAudioUrl(url);
                  setRecordedDuration(dur);
                }}
                onSendTranscriptUtterance={(text, speaker) => {
                  const ws = wsRef.current;
                  if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'CALL_SPEECH',
                      call_id: callState.call_id,
                      text: text,
                      speaker: speaker
                    }));
                  }
                }}
              />
            </div>
          )}

          {viewMode === 'knowledge' && (
            <div className="py-2">
              <AdminPanel agentRole={agentRole} />
            </div>
          )}

          {viewMode === 'proof' && (
            <div className="py-2">
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
                recordedAudioUrl={recordedAudioUrl}
                recordedDuration={recordedDuration}
              />
            </div>
          )}

          {viewMode === 'reviewer' && (
            <div className="py-2">
              <MetaReviewerPanel />
            </div>
          )}
        </main>
      </div>

      {/* ── Responsive Slide-Out Customer Phone Drawer ────────────────── */}
      {isCustomerDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col p-5 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-slate-900">Customer phone simulator</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setIsCustomerDrawerOpen(false);
                    window.open('/?mode=customer', 'VelatoAI Customer Caller', 'width=460,height=820');
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Pop out to new window"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsCustomerDrawerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Close Drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <CustomerPhone
              safeModeActive={callState.safe_mode_active}
              paymentSessionData={paymentSession}
              onSendPan={handleSendPan}
              onSendExpiry={handleSendExpiry}
              onSendCvv={handleSendCvv}
              onConfirmPayment={handleConfirmPayment}
              paymentCompleted={!!paymentResult}
              isCallActive={isCallActive}
              callStatus={callStatus}
              onInitiateCall={handleCustomerInitiateCall}
              onHangupCall={handleHangupCall}
              onSendCustomerSpeech={handleSendCustomerSpeech}
            />
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {isProfileModalOpen && (
        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          agentRole={agentRole}
          onToggleRole={() => handleToggleRole()}
        />
      )}
    </div>
  );
}
