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

    // ── Fish sprites (AI-generated PNGs) ────────────────────────────────
    this.load.image('fish_koi',       'assets/images/fish_koi.png');
    this.load.image('fish_goldfish',  'assets/images/fish_goldfish.png');
    this.load.image('fish_shubunkin', 'assets/images/fish_shubunkin.png');

    // ── Audio assets (generated procedurally via Web Audio later) ──────
    // Placeholder: we'll generate ambient audio at runtime using Web Audio API
    // If real audio files exist in assets/audio/, load them here:
    // this.load.audio('ambient_water', 'assets/audio/water_loop.mp3');
    // this.load.audio('ambient_frogs', 'assets/audio/frogs_loop.mp3');
    // this.load.audio('sfx_splash', 'assets/audio/splash.mp3');

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

      // Water ambient: filtered white noise
      this._createNoiseBuffer(ctx, 'ambient_water', 4.0, { lowpass: 400, volume: 0.15 });
      // Splash SFX: short burst of filtered noise with decay
      this._createNoiseBuffer(ctx, 'sfx_splash', 0.3, { lowpass: 2000, volume: 0.5, decay: true });
    } catch (e) {
      console.warn('[BootScene] Web Audio not available:', e);
    }
  }

  _createNoiseBuffer(ctx, key, durationSec, opts = {}) {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * durationSec;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      let sample = Math.random() * 2 - 1;
      // Simple low-pass approximation via moving average
      if (i > 0 && opts.lowpass) {
        const alpha = opts.lowpass / sampleRate;
        sample = data[i - 1] + alpha * (sample - data[i - 1]);
      }
      // Decay envelope for SFX
      if (opts.decay) {
        sample *= Math.exp(-3 * i / length);
      }
      data[i] = sample * (opts.volume || 0.3);
    }

    // Convert AudioBuffer to a WAV blob Phaser can consume
    const wav = this._audioBufferToWav(buffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    this.load.audio(key, url);
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
