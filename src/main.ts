import Phaser from 'phaser';
import { sdk } from '@farcaster/miniapp-sdk';
import BootScene from './scenes/BootScene';
import PondScene from './scenes/PondScene';
import UIScene from './scenes/UIScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a2a1a',
  parent: 'game-container',
  scene: [BootScene, PondScene, UIScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: false,
    antialias: true,
    roundPixels: false,
  },
};

const game = new Phaser.Game(config);

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});

// Farcaster Mini App requirement: signal that the app is ready (hides the startup splash screen)
const initFarcaster = async () => {
  try {
    await sdk.actions.ready();
    console.log('[Farcaster] Mini App Ready');
  } catch (e) {
    console.warn('[Farcaster] SDK not initialized (likely running outside of Farcaster client)', e);
  }
};

initFarcaster();
