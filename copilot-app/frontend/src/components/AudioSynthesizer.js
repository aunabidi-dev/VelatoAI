/**
 * Web Audio API Security Chime and Beep Synthesizer
 * Generates clear, audible audio tones for PCI Safe Mode transition and confirmation.
 */
class AudioSynthesizer {
  constructor() {
    this.ctx = null;
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
}

export const soundFx = new AudioSynthesizer();
