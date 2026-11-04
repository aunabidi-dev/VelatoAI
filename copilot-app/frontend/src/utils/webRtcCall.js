/**
 * WebRTC Browser-to-Browser Real-Time Audio Calling & Live STT Streamer
 * Provides zero-carrier, peer-to-peer audio streaming between Customer and Agent windows,
 * plus continuous Speech-to-Text microphone capture.
 */

export class WebRtcCallSession {
  constructor({ role = 'customer', callId = 'call_meta_hackathon_01', wsRef = null, onRemoteStream = null, onTranscript = null, onAudioLevel = null }) {
    this.role = role;
    this.callId = callId;
    this.wsRef = wsRef;
    this.onRemoteStream = onRemoteStream;
    this.onTranscript = onTranscript;
    this.onAudioLevel = onAudioLevel;

    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.levelTimer = null;
    this.recognition = null;
    this.isMuted = false;
    this.isConnected = false;
    this.pendingCandidates = [];

    // Public STUN servers for demo peer discovery across local or LAN tabs
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };

    // Direct browser mesh channel for immediate peer discovery
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      this.channel = new BroadcastChannel('velatoai_call_mesh');
      this.channel.onmessage = (event) => {
        const msg = event.data;
        if (!msg) return;
        if (msg.type === 'SIGNAL') {
          this.handleSignal(msg);
        }
      };
    }
  }

  /**
   * Acquire local microphone audio stream with volume analyser
   */
  async initLocalMicrophone() {
    try {
      if (this.localStream) return this.localStream;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      this.localStream = stream;

      // Set up Web Audio Analyser for live VU equalizer
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
          const source = this.audioContext.createMediaStreamSource(stream);
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 64;
          source.connect(this.analyser);

          const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
          this.levelTimer = setInterval(() => {
            if (this.analyser && this.onAudioLevel) {
              this.analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const avg = sum / dataArray.length;
              const level = Math.min(100, Math.round((avg / 128) * 100));
              this.onAudioLevel(level);
            }
          }, 100);
        }
      } catch (e) {
        console.warn("[WebRTC] AudioContext analyser fallback:", e);
      }

      return stream;
    } catch (e) {
      console.warn("[WebRTC] getUserMedia audio permission not granted, running in fallback audio mode:", e);
      return null;
    }
  }

  /**
   * Start continuous browser speech recognition on the microphone
   */
  startLiveSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.log("[STT] Web Speech API not supported in this browser, relying on demo text stream");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const lastIdx = event.results.length - 1;
        const transcriptText = event.results[lastIdx][0].transcript.trim();
        if (transcriptText && this.onTranscript) {
          this.onTranscript(transcriptText, this.role);
          // Also broadcast over WebSocket for live backend processing
          this.sendWs({
            type: "TRANSCRIPT_CHUNK",
            call_id: this.callId,
            text: transcriptText,
            speaker: this.role
          });
        }
      };

      recognition.onerror = (e) => {
        // Silently restart on no-speech
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn("[STT] Speech recognition event:", e.error);
        }
      };

      recognition.onend = () => {
        if (this.isConnected && !this.isMuted) {
          try { recognition.start(); } catch (e) {}
        }
      };

      recognition.start();
      this.recognition = recognition;
    } catch (e) {
      console.warn("[STT] Could not start speech recognition:", e);
    }
  }

  stopLiveSpeechRecognition() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.recognition = null;
    }
  }

  /**
   * Setup PeerConnection
   */
  _createPeerConnection() {
    if (this.peerConnection) return this.peerConnection;

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnection = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendWs({
          type: "SIGNAL",
          signalType: "CANDIDATE",
          call_id: this.callId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    pc.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        this.isConnected = true;
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.isConnected = false;
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE failed. Attempting ICE restart...`);
        try { pc.restartIce(); } catch (e) {}
      }
    };

    return pc;
  }

  async _flushPendingCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    while (this.pendingCandidates.length > 0) {
      const cand = this.pendingCandidates.shift();
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.warn("[WebRTC] Flush candidate error:", err);
      }
    }
  }

  /**
   * Customer initiates call by creating SDP Offer
   */
  async initiateCall() {
    await this.initLocalMicrophone();
    const pc = this._createPeerConnection();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    this.sendWs({
      type: "CALL_INITIATE",
      call_id: this.callId,
      customer_name: "Jane Doe",
      phone: "+1-555-0192",
      plan: "Annual Cloud AI (Tier 1)"
    });

    this.sendWs({
      type: "SIGNAL",
      signalType: "OFFER",
      call_id: this.callId,
      sdp: offer.sdp
    });

    this.startLiveSpeechRecognition();
  }

  /**
   * Agent accepts incoming call by answering the SDP Offer
   */
  async acceptCall(offerSdp) {
    await this.initLocalMicrophone();
    const pc = this._createPeerConnection();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    if (offerSdp && !pc.remoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offerSdp }));
      await this._flushPendingCandidates();
    }

    if (pc.remoteDescription) {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.sendWs({
        type: "CALL_ACCEPT",
        call_id: this.callId
      });

      this.sendWs({
        type: "SIGNAL",
        signalType: "ANSWER",
        call_id: this.callId,
        sdp: answer.sdp
      });
    }

    this.isConnected = true;
    this.startLiveSpeechRecognition();
  }

  /**
   * Handle incoming WebRTC signaling message
   */
  async handleSignal(msg) {
    const pc = this.peerConnection || this._createPeerConnection();
    const { signalType, sdp, candidate } = msg;

    try {
      if (signalType === "OFFER" && this.role === 'agent') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
        await this._flushPendingCandidates();
      } else if (signalType === "ANSWER" && this.role === 'customer') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
        await this._flushPendingCandidates();
        this.isConnected = true;
      } else if (signalType === "CANDIDATE" && candidate) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          this.pendingCandidates.push(candidate);
        }
      }
    } catch (e) {
      console.warn("[WebRTC] Signal handling error:", e);
    }
  }

  /**
   * Mute or Sever audio during PCI Safe Mode
   */
  severAudioForSafeMode() {
    this.isMuted = true;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => { t.enabled = false; });
    }
    this.stopLiveSpeechRecognition();
  }

  /**
   * Restore audio after Safe Mode completes
   */
  restoreAudioAfterSafeMode() {
    this.isMuted = false;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => { t.enabled = true; });
    }
    this.startLiveSpeechRecognition();
  }

  /**
   * Hang up and clean up
   * @param {boolean} sendNetworkSignal - whether to emit CALL_HANGUP back to network (false if reacting to an incoming hangup)
   */
  hangup(sendNetworkSignal = true) {
    if (this._isCleaningUp) return;
    this._isCleaningUp = true;
    this.isConnected = false;
    this.stopLiveSpeechRecognition();

    if (this.levelTimer) {
      clearInterval(this.levelTimer);
      this.levelTimer = null;
    }

    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }

    if (this.channel) {
      try { this.channel.close(); } catch (e) {}
      this.channel = null;
    }

    if (sendNetworkSignal) {
      this.sendWs({
        type: "CALL_HANGUP",
        call_id: this.callId
      });
    }

    setTimeout(() => {
      this._isCleaningUp = false;
    }, 500);
  }

  sendWs(data) {
    // 1. Post to BroadcastChannel for 0ms cross-window transmission
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        const ch = new BroadcastChannel('velatoai_call_mesh');
        ch.postMessage(data);
        ch.close();
      }
    } catch (e) {}

    // 2. Send over WebSocket
    const ws = this.wsRef?.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
}

