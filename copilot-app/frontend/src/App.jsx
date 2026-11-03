import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Users, Phone, BarChart3, Settings,
  Shield, Activity, BookOpen, ShieldCheck, RefreshCw, X, ChevronDown,
  User, Sparkles, Volume2, MicOff, Server, Zap, CheckCircle2,
  ExternalLink, PhoneCall, Terminal
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
        const ch = new BroadcastChannel('zytasafe_call_mesh');
        ch.postMessage(payload);
        ch.close();
      }
    } catch (e) {}
  };

  // Inter-window real-time signaling mesh
  useEffect(() => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return;
    const channel = new BroadcastChannel('zytasafe_call_mesh');

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
          console.log(`[ZytaSafe WS] Signal Mesh connected as ${role}`);

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
                console.log('[ZytaSafe WS] Incoming call event received on agent desk:', msg);
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
          console.log(`[ZytaSafe WS] Signal disconnected. Auto-reconnecting in 1s...`);
          clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(connect, 1000);
        };

        ws.onerror = (err) => {
          console.warn('[ZytaSafe WS] Socket error, reconnecting...', err);
          if (ws) ws.close();
        };
      } catch (e) {
        console.warn('[ZytaSafe WS] Connection init error, retrying in 1.5s', e);
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
      } catch (err) {}
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
    if (webRtcSessionRef.current) {
      webRtcSessionRef.current.restoreAudioAfterSafeMode();
    }
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
      if (webRtcSessionRef.current) {
        webRtcSessionRef.current.restoreAudioAfterSafeMode();
      }
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
      if (webRtcSessionRef.current) {
        webRtcSessionRef.current.restoreAudioAfterSafeMode();
      }
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
    } catch (e) {}

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
    } catch (e) {}

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
    } catch (e) {}

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

  // ── STANDALONE CUSTOMER CALLER MODE (When opened in a 2nd browser window) ──
  if (isCustomerStandalone) {
    return (
      <div className="min-h-screen bg-[#070B0A] text-[#EDF3F0] flex flex-col items-center justify-center p-4 selection:bg-[#00E676] selection:text-[#070B0A]">
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
    <div className="min-h-screen bg-[#070B0A] text-[#EDF3F0] flex flex-row font-sans selection:bg-[#00E676] selection:text-[#070B0A]">
      {/* ── Left Sidebar Navigation (Dedicated Enterprise Nav) ───────── */}
      <aside className="w-60 shrink-0 border-r border-[#1A2824] bg-[#0A110F] flex flex-col justify-between p-4 min-h-screen sticky top-0 h-screen overflow-y-auto z-20">
        <div className="flex flex-col gap-6">
          {/* Logo & Brand Title */}
          <div
            className="flex items-center gap-3 px-2 pt-2 cursor-pointer"
            onClick={() => { setSidebarActive('dashboard'); setViewMode('live'); }}
          >
            <img src={logoImg} alt="ZytaSafe" className="w-8 h-8 rounded-lg object-contain" />
            <div>
              <span className="font-bold text-base tracking-tight text-white block">ZytaSafe</span>
              <span className="text-[10px] text-[#768782] font-mono">Zero-Trust Voice Intercept</span>
            </div>
          </div>

          {/* Functional Navigation Items */}
          <nav className="flex flex-col gap-1.5">
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
              <PhoneCall className="w-4 h-4" />
              <span>Live CRM Call</span>
            </button>

            <button
              onClick={() => {
                setSidebarActive('knowledge');
                setViewMode('knowledge');
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                sidebarActive === 'knowledge'
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] shadow-sm'
                  : 'text-[#768782] hover:text-[#EDF3F0] hover:bg-[#111C19]'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Knowledge Base</span>
            </button>

            <button
              onClick={() => {
                setSidebarActive('audit');
                setViewMode('proof');
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                sidebarActive === 'audit'
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] shadow-sm'
                  : 'text-[#768782] hover:text-[#EDF3F0] hover:bg-[#111C19]'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Security Audit</span>
            </button>

            <button
              onClick={() => {
                setSidebarActive('reviewer');
                setViewMode('reviewer');
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                sidebarActive === 'reviewer'
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] shadow-sm'
                  : 'text-[#768782] hover:text-[#EDF3F0] hover:bg-[#111C19]'
              }`}
            >
              <Terminal className="w-4 h-4 text-[#00E676]" />
              <span>Meta Reviewer Portal</span>
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
            <svg className="w-10 h-5 text-[#00E676] opacity-90" viewBox="0 0 48 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M0 12h12l3-8 6 16 4-10 3 4h20" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* User Profile */}
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
                <div className="text-[10px] text-[#768782] capitalize font-mono">
                  Role: <span className="text-[#00E676]">{agentRole}</span>
                </div>
              </div>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-[#768782]" />
          </div>
        </div>
      </aside>

      {/* ── Main Workspace ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen px-6 py-4 overflow-y-auto relative">
        {/* Top Header Bar: Telemetry, Quick Role Toggle, & Launch Customer Window */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#1A2824]">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="bg-[#0B2017] border border-[#154530] text-[#00E676] px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00E676]" />
              <span>Built with Muse Spark Open (Baseten)</span>
            </div>
            <div className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono border flex items-center gap-1.5 ${
              wsConnected ? 'bg-[#0E1614] text-[#34D399] border-[#165038]' : 'bg-[#1C1417] text-rose-400 border-rose-500/30'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-[#34D399] animate-pulse' : 'bg-rose-500'}`} />
              <span>{wsConnected ? 'Signal Mesh Live' : 'Signal Mesh Reconnecting'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Quick Role Switcher (Admin vs Agent) */}
            <div className="flex items-center gap-1 bg-[#0E1614] border border-[#1A2824] p-1 rounded-xl">
              <span className="text-[10px] font-mono text-[#768782] px-2 uppercase">Role:</span>
              <button
                onClick={() => setAgentRole('agent')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  agentRole === 'agent'
                    ? 'bg-[#0B2A1E] text-[#00E676] border border-[#165038]'
                    : 'text-[#768782] hover:text-[#EDF3F0]'
                }`}
                title="Agent: Read-only access to docs, answers live calls"
              >
                <User className="w-3.5 h-3.5" />
                <span>Agent</span>
              </button>
              <button
                onClick={() => setAgentRole('admin')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  agentRole === 'admin'
                    ? 'bg-[#0B2A1E] text-[#00E676] border border-[#165038]'
                    : 'text-[#768782] hover:text-[#EDF3F0]'
                }`}
                title="Admin: Full upload, delete, and audit privileges"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            </div>

            {/* Launch Customer Window (Side-by-Side Browser Calling) */}
            <button
              onClick={() => window.open('/?mode=customer', 'ZytaSafe Customer Caller', 'width=460,height=820')}
              className="flex items-center gap-2 bg-[#0B261B] hover:bg-[#123829] border border-[#165038] text-[#00E676] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm"
              title="Open standalone Customer Caller in a separate window to test 2-window calling"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Launch Customer Window</span>
              <ExternalLink className="w-3 h-3 text-[#768782]" />
            </button>
          </div>
        </div>

        {/* ── Sub-Nav Header Card ──────────────────────────────────────── */}
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

          {/* Sub Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#070B0A] p-1 rounded-xl border border-[#1A2824] text-xs font-medium">
            <button
              onClick={() => { setSidebarActive('dashboard'); setViewMode('live'); }}
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
              onClick={() => setIsCustomerDrawerOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                isCustomerDrawerOpen
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] font-semibold shadow-sm'
                  : 'text-[#768782] hover:text-[#EDF3F0]'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Customer Phone</span>
            </button>

            <button
              onClick={() => { setSidebarActive('knowledge'); setViewMode('knowledge'); }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                viewMode === 'knowledge'
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] font-semibold shadow-sm'
                  : 'text-[#768782] hover:text-[#EDF3F0]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Knowledge Base</span>
            </button>

            <button
              onClick={() => { setSidebarActive('audit'); setViewMode('proof'); }}
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
              onClick={() => { setSidebarActive('reviewer'); setViewMode('reviewer'); }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                viewMode === 'reviewer'
                  ? 'bg-[#0B2A1E] border border-[#165038] text-[#00E676] font-semibold shadow-sm'
                  : 'text-[#768782] hover:text-[#EDF3F0]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Meta Reviewer</span>
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
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#0A110F] h-full shadow-2xl border-l border-[#1A2824] flex flex-col p-5 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#1A2824] mb-4">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#00E676]" />
                <h3 className="text-sm font-bold text-white">Customer Phone Simulator</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsCustomerDrawerOpen(false);
                    window.open('/?mode=customer', 'ZytaSafe Customer Caller', 'width=460,height=820');
                  }}
                  className="p-1.5 text-[#768782] hover:text-[#00E676] rounded-lg transition-colors"
                  title="Pop out to new window"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsCustomerDrawerOpen(false)}
                  className="p-1.5 text-[#768782] hover:text-white rounded-lg transition-colors"
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
        />
      )}
    </div>
  );
}