/**
 * BootScene — loads assets and shows a minimal loading bar.
 * Transitions to PondScene once everything is ready.
 *
 * Since we're generating all art procedurally (for now), this scene
 * primarily sets up the audio context and any future spritesheets.
 */

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // ── Loading bar ──────────────────────────────────────────────────────
    const { width, height } = this.cameras.main;
    const barW = 300, barH = 16;
    const barX = (width - barW) / 2;
    const barY = height / 2 + 20;

    // Title text
    this.add.text(width / 2, height / 2 - 40, 'Pond Quest', {
      fontSize: '32px',
      color: '#a8d8b9',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 8, 'preparing your pond…', {
      fontSize: '14px',
      color: '#6b9b7e',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    // Background bar
    const bg = this.add.graphics();
    bg.fillStyle(0x2a3a2a, 1);
    bg.fillRoundedRect(barX, barY, barW, barH, 8);

    // Progress fill
    const fill = this.add.graphics();
    this.load.on('progress', (pct) => {
      fill.clear();
      fill.fillStyle(0x52b788, 1);
      fill.fillRoundedRect(barX + 2, barY + 2, (barW - 4) * pct, barH - 4, 6);
    });

    // ── Fish sprites — 5 directional views per species (AI-generated PNGs) ─
    // Directions: e(right), ne(upper-right), n(away/back), se(lower-right), s(toward camera)
    // w/nw/sw are derived by flipping the corresponding base sprite
    const SPECIES = ['koi', 'goldfish', 'shubunkin'];
    const DIRS    = ['e', 'ne', 'n', 'se', 's'];
    for (const sp of SPECIES) {
      for (const dir of DIRS) {
        this.load.image(`fish_${sp}_${dir}`, `assets/images/fish_${sp}_${dir}.png`);
      }
      // Legacy key (used as fallback in FishSystem)
      this.load.image(`fish_${sp}`, `assets/images/fish_${sp}_e.png`);
    }

    // ── Audio assets ──────────────────────────────────────────────────────
    // Keep ambient layers procedural for now, but use real one-shot SFX.
    this.load.audio('sfx_plop', 'audio/sfx_plop.ogg');
    this.load.audio('sfx_splash', 'audio/sfx_splash.ogg');

    // ── Generate procedural audio ────────────────────────────────────────
    this._generateProceduralAudio();
  }

  /**
   * Generate simple ambient and SFX audio using Web Audio API.
   * These are short synthesized sounds — sufficient for a v1 prototype.
   */
  _generateProceduralAudio() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._createWaterLoop(ctx, 'ambient_water', 6.0);
      this._createChiptuneLoop(ctx, 'bgm_chill', 8.0);
    } catch (e) {
      console.warn('[BootScene] Web Audio not available:', e);
    }
  }

  _createClip(ctx, key, durationSec, writer) {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    writer(data, sampleRate, length);

    const wav = this._audioBufferToWav(buffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    this.load.audio(key, url);
  }

  _createWaterLoop(ctx, key, durationSec) {
    this._createClip(ctx, key, durationSec, (data, sampleRate, length) => {
      let filtered = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const noise = (Math.random() * 2 - 1) * 0.32;
        filtered += 0.018 * (noise - filtered);
        const ripple = Math.sin(Math.PI * 2 * 0.23 * t) * 0.05 + Math.sin(Math.PI * 2 * 0.41 * t) * 0.025;
        const edgeFade = Math.min(1, i / 4000, (length - i - 1) / 4000);
        data[i] = (filtered + ripple) * 0.32 * edgeFade;
      }
    });
  }

  _createSplashBuffer(ctx, key, durationSec) {
    this._createClip(ctx, key, durationSec, (data, sampleRate, length) => {
      let phase = 0;
      let filtered = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-9 * t / durationSec);
        const freq = 220 - 140 * (t / durationSec);
        phase += (Math.PI * 2 * freq) / sampleRate;
        const tone = Math.sin(phase) * 0.22;
        const noise = (Math.random() * 2 - 1) * 0.9;
        filtered += 0.08 * (noise - filtered);
        data[i] = (tone + filtered * 0.55) * env * 0.72;
      }
    });
  }

  _createPlopBuffer(ctx, key, durationSec) {
    this._createClip(ctx, key, durationSec, (data, sampleRate, length) => {
      let phase = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-8 * t / durationSec);
        const freq = 180 - 100 * (t / durationSec);
        phase += (Math.PI * 2 * freq) / sampleRate;
        const tone = Math.sin(phase);
        const bubble = Math.sin(phase * 0.5) * 0.4;
        const noise = (Math.random() * 2 - 1) * 0.15;
        data[i] = (tone * 0.68 + bubble * 0.18 + noise) * env * 0.7;
      }
    });
  }

  _createChiptuneLoop(ctx, key, durationSec) {
    const melody = [64, 67, 71, 72, 71, 67, 64, 62, 60, 62, 64, 67, 69, 67, 64, 62];
    const bass = [36, 36, 41, 41, 43, 43, 38, 38];
    const arps = [76, 79, 83, 79, 74, 77, 81, 77];
    const stepSec = durationSec / melody.length;
    const bassStepSec = durationSec / bass.length;
    const arpStepSec = durationSec / arps.length;

    this._createClip(ctx, key, durationSec, (data, sampleRate, length) => {
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        const melodyIdx = Math.floor(t / stepSec) % melody.length;
        const melodyLocal = (t % stepSec) / stepSec;
        const melodyFreq = this._midiToFreq(melody[melodyIdx]);
        const melodyEnv = melodyLocal < 0.12
          ? melodyLocal / 0.12
          : Math.max(0, 1 - (melodyLocal - 0.12) / 0.88) * 0.85;
        const melodyWave = Math.sign(Math.sin(Math.PI * 2 * melodyFreq * t)) * melodyEnv * 0.18;

        const bassIdx = Math.floor(t / bassStepSec) % bass.length;
        const bassLocal = (t % bassStepSec) / bassStepSec;
        const bassFreq = this._midiToFreq(bass[bassIdx]);
        const bassEnv = bassLocal < 0.08
          ? bassLocal / 0.08
          : Math.max(0, 1 - bassLocal) * 0.7;
        const bassWave = (2 / Math.PI) * Math.asin(Math.sin(Math.PI * 2 * bassFreq * t)) * bassEnv * 0.15;

        const arpIdx = Math.floor(t / arpStepSec) % arps.length;
        const arpLocal = (t % arpStepSec) / arpStepSec;
        const arpFreq = this._midiToFreq(arps[arpIdx]);
        const arpEnv = Math.max(0, 1 - arpLocal) * 0.38;
        const arpWave = Math.sign(Math.sin(Math.PI * 2 * arpFreq * t)) * arpEnv * 0.08;

        const edgeFade = Math.min(1, i / 3000, (length - i - 1) / 3000);
        data[i] = (melodyWave + bassWave + arpWave) * edgeFade;
      }
    });
  }

  _midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  /**
   * Encode an AudioBuffer as a WAV file (PCM 16-bit).
   */
  _audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitsPerSample = 16;
    const data = buffer.getChannelData(0);
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataLength = data.length * numChannels * bitsPerSample / 8;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // RIFF header
    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    this._writeString(view, 8, 'WAVE');
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    this._writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // PCM samples
    let offset = 44;
    for (let i = 0; i < data.length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return arrayBuffer;
  }

  _writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  create() {
    // Small delay so the loading bar is visible even if loading is instant
    this.time.delayedCall(400, () => {
      this.scene.start('PondScene');
    });
  }
}
