/**
 * Web Audio API Security Chime and Beep Synthesizer — Phase 4 Enhanced
 * Generates clear, audible audio tones for PCI Safe Mode transition, confirmation,
 * phone ringing, and realistic interactive recording timeline playback verification.
 */
class AudioSynthesizer {
  constructor() {
    this.ctx = null;
    this._humOsc = null;
    this._humGain = null;
    this._ringing = false;
    this._ringTimer = null;
    this._outgoingRinging = false;
    this._outgoingRingTimer = null;
    this._activeOscillators = [];
  }

  async _initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn("[AudioSynthesizer] AudioContext resume error:", e);
      }
    }
    return this.ctx;
  }

  /**
   * Loud, crisp security transition beep.
   * Plays a dual-tone sequence (880Hz -> 1320Hz) so it cannot be missed on laptop speakers.
   */
  async playSafeModeBeep() {
    try {
      const ctx = await this._initContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Tone 1: 880 Hz (A5) alert pulse
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.45, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.14);

      // Tone 2: 1320 Hz (E6) high confirmation pulse
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, now + 0.15);
      gain2.gain.setValueAtTime(0.5, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.38);
    } catch (e) {
      console.warn("[AudioSynthesizer] Error playing safe mode beep:", e);
    }
  }

  /**
   * Prompt beep: A clean, clear 1046.5Hz (C6) tone played after "Please speak ... after the tone"
   */
  async playPromptTone() {
    try {
      const ctx = await this._initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, now);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    } catch (e) {
      console.warn("[AudioSynthesizer] Error playing prompt tone:", e);
    }
  }

  /**
   * Harmonious 4-note ascending chime when tokenization succeeds.
   */
  async playTokenSuccessChime() {
    try {
      const ctx = await this._initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const tones = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      tones.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        const start = now + idx * 0.09;
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.35, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.45);
      });
    } catch (e) {
      console.warn("[AudioSynthesizer] Error playing success chime:", e);
    }
  }

  /**
   * System Notice Chime: Played during the recording notice segment ("Payment details withheld").
   */
  async playNoticeChime() {
    try {
      const ctx = await this._initContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.25);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}
  }

  /**
   * Phone Ringing: Classic telephone double-ring for incoming calls.
   */
  async playIncomingRing() {
    this.stopIncomingRing();
    try {
      const ctx = await this._initContext();
      if (!ctx) return;

      const ringPulse = () => {
        if (!this._ringing) return;
        const now = ctx.currentTime;
        [440, 480].forEach(freq => {
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
            gain.gain.setValueAtTime(0.08, now + 0.6);
            gain.gain.linearRampToValueAtTime(0.0001, now + 0.65);

            gain.gain.setValueAtTime(0.0001, now + 0.85);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.9);
            gain.gain.setValueAtTime(0.08, now + 1.5);
            gain.gain.linearRampToValueAtTime(0.0001, now + 1.55);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 1.6);
            this._activeOscillators.push(osc);
            osc.onended = () => {
              this._activeOscillators = this._activeOscillators.filter(o => o !== osc);
            };
          } catch (e) {}
        });
      };

      this._ringing = true;
      ringPulse();
      this._ringTimer = setInterval(ringPulse, 3200);
    } catch (e) {}
  }

  stopIncomingRing() {
    this._ringing = false;
    if (this._ringTimer) {
      clearInterval(this._ringTimer);
      this._ringTimer = null;
    }
    this._stopTrackedOscillators();
  }

  /**
   * Outgoing Ring: Soft ringback tone heard by the caller.
   */
  async playOutgoingRing() {
    this.stopOutgoingRing();
    try {
      const ctx = await this._initContext();
      if (!ctx) return;

      const ringPulse = () => {
        if (!this._outgoingRinging) return;
        const now = ctx.currentTime;
        [440, 480].forEach(freq => {
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.05, now + 0.04);
            gain.gain.setValueAtTime(0.05, now + 1.8);
            gain.gain.linearRampToValueAtTime(0.0001, now + 1.85);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 1.9);
            this._activeOscillators.push(osc);
            osc.onended = () => {
              this._activeOscillators = this._activeOscillators.filter(o => o !== osc);
            };
          } catch (e) {}
        });
      };

      this._outgoingRinging = true;
      ringPulse();
      this._outgoingRingTimer = setInterval(ringPulse, 4000);
    } catch (e) {}
  }

  stopOutgoingRing() {
    this._outgoingRinging = false;
    if (this._outgoingRingTimer) {
      clearInterval(this._outgoingRingTimer);
      this._outgoingRingTimer = null;
    }
    this._stopTrackedOscillators();
  }

  _stopTrackedOscillators() {
    if (this._activeOscillators && this._activeOscillators.length > 0) {
      this._activeOscillators.forEach(osc => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (e) {}
      });
      this._activeOscillators = [];
    }
  }

  stopAllAudio() {
    this.stopIncomingRing();
    this.stopOutgoingRing();
    this._stopTrackedOscillators();
  }

  /**
   * Neutralized: Artificial 220Hz electronic hum oscillator removed.
   * Real call recording audio is captured via MediaRecorder and played through HTML5 Audio.
   */
  async startRecordedAudioHum() {
    // Intentionally no-op to eliminate artificial electronic humming noise.
  }

  /**
   * Stop recording player hum (safe no-op).
   */
  stopRecordedAudioHum() {
    // Intentionally no-op
  }
}

export const soundFx = new AudioSynthesizer();
