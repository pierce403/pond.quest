/**
 * AudioManager — handles ambient pond soundscape and SFX.
 *
 * Browser autoplay policy requires audio context to be resumed on first user interaction.
 * We defer all audio until that happens, then layer in ambient tracks.
 */

export default class AudioManager {
  constructor(scene) {
    this.scene = scene;
    this.ready = false;
    this.ambientVolume = 0.4;
    this.sfxVolume = 0.7;
    this._sounds = {};

    // Web Audio API context — shared with Phaser's internal system
    this._ctx = null;
  }

  /** Called after first user interaction to unlock audio */
  unlock() {
    if (this.ready) return;
    this.ready = true;
    this._startAmbient();
  }

  /** Start layered ambient loops once unlocked */
  _startAmbient() {
    const ambientLayers = [
      { key: 'ambient_water', delay: 0, volume: this.ambientVolume * 0.75 },
      { key: 'bgm_chill', delay: 600, volume: this.ambientVolume * 0.45 },
    ];

    ambientLayers.forEach(({ key, delay, volume }) => {
      if (this.scene.cache.audio.has(key)) {
        setTimeout(() => {
          const snd = this.scene.sound.add(key, {
            loop: true,
            volume,
          });
          snd.play();
          this._sounds[key] = snd;
        }, delay);
      }
    });
  }

  /** Play a one-shot SFX */
  playSfx(key, opts = {}) {
    if (!this.ready) return;
    if (!this.scene.cache.audio.has(key)) return;
    this.scene.sound.play(key, { volume: this.sfxVolume, ...opts });
  }

  /** Fade out all audio gracefully */
  fadeOut(duration = 1000) {
    Object.values(this._sounds).forEach(snd => {
      this.scene.tweens.add({
        targets: snd,
        volume: 0,
        duration,
        onComplete: () => snd.stop(),
      });
    });
  }

  setAmbientVolume(v) {
    this.ambientVolume = v;
    Object.values(this._sounds).forEach(snd => {
      if (snd.isPlaying) snd.setVolume(v);
    });
  }
}
