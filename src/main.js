import BootScene from './scenes/BootScene.js';
import PondScene from './scenes/PondScene.js';
import UIScene from './scenes/UIScene.js';

const config = {
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
  // Pixel-art crisp rendering
  render: {
    pixelArt: false,
    antialias: true,
    roundPixels: false,
  },
};

const game = new Phaser.Game(config);

// Handle resize
window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
