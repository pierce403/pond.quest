/**
 * UIScene — HUD overlay running as a parallel scene on top of PondScene.
 *
 * Displays:
 *   - Pond chemistry stats with color-coded status (green/amber/red)
 *   - Game time / day counter
 *   - Fish and plant counts
 *   - Subtle, non-intrusive design that doesn't obscure the pond
 *
 * Runs alongside PondScene via Phaser's scene.launch().
 */

export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  init(data) {
    this.storage = data.storage;
    this.ecosystem = data.ecosystem;
  }

  create() {
    const { width, height } = this.cameras.main;

    // ── Chemistry panel (top-right) ───────────────────────────────────────
    this._panelX = width - 220;
    this._panelY = 16;

    // Panel background
    this._panelBg = this.add.graphics();
    this._drawPanel();

    // Title
    this.add.text(this._panelX + 16, this._panelY + 10, '🧪 Water Chemistry', {
      fontSize: '13px',
      fontFamily: 'Georgia, serif',
      color: '#a8d8b9',
    });

    // Chemistry labels
    const labels = ['pH', 'NH₃', 'NO₂⁻', 'NO₃⁻', 'DO'];
    const labelNames = ['pH', 'Ammonia', 'Nitrite', 'Nitrate', 'Oxygen'];
    this._chemTexts = {};

    labels.forEach((label, i) => {
      const y = this._panelY + 36 + i * 22;

      // Label
      this.add.text(this._panelX + 16, y, labelNames[i], {
        fontSize: '11px',
        fontFamily: 'Georgia, serif',
        color: '#8aaa8e',
      });

      // Value (updated in update loop)
      this._chemTexts[label] = this.add.text(this._panelX + 170, y, '--', {
        fontSize: '11px',
        fontFamily: 'monospace',
        color: '#c8e8d0',
      }).setOrigin(1, 0);

      // Status dot
      this._chemTexts[label + '_dot'] = this.add.circle(this._panelX + 182, y + 6, 4, 0x52b788);
    });

    // ── Info bar (bottom-left) ──────────────────────────────────────────
    this._infoY = height - 40;
    this._dayText = this.add.text(16, this._infoY, 'Day 1', {
      fontSize: '12px',
      fontFamily: 'Georgia, serif',
      color: '#6b9b7e',
    });
    this._countText = this.add.text(16, this._infoY + 16, '', {
      fontSize: '11px',
      fontFamily: 'Georgia, serif',
      color: '#5a8a6e',
    });

    // ── Bacteria colonization bar (under chemistry) ─────────────────────
    const bactY = this._panelY + 36 + 5 * 22 + 8;
    this.add.text(this._panelX + 16, bactY, 'Bacteria', {
      fontSize: '10px',
      fontFamily: 'Georgia, serif',
      color: '#7a9a7e',
    });
    this._bactBarBg = this.add.graphics();
    this._bactBarBg.fillStyle(0x1a2a1a, 0.5);
    this._bactBarBg.fillRoundedRect(this._panelX + 80, bactY + 1, 100, 10, 5);
    this._bactBarFill = this.add.graphics();

    // ── Refresh timer ────────────────────────────────────────────────────
    this._refreshTimer = 0;

    // Handle resize
    this.scale.on('resize', (gameSize) => {
      this._panelX = gameSize.width - 220;
      this._infoY = gameSize.height - 40;
      this._drawPanel();
    });
  }

  update(time, delta) {
    // Throttle UI updates to ~4 fps for performance
    this._refreshTimer += delta;
    if (this._refreshTimer < 250) return;
    this._refreshTimer = 0;

    this._updateChemistry();
    this._updateInfo();
  }

  _drawPanel() {
    this._panelBg.clear();
    this._panelBg.fillStyle(0x0a1a0a, 0.65);
    this._panelBg.fillRoundedRect(this._panelX, this._panelY, 200, 190, 10);
    this._panelBg.lineStyle(1, 0x2a4a2a, 0.5);
    this._panelBg.strokeRoundedRect(this._panelX, this._panelY, 200, 190, 10);
  }

  _updateChemistry() {
    if (!this.ecosystem) return;
    const data = this.ecosystem.getAnnotatedChemistry();
    const statusColors = {
      ideal: 0x52b788,
      warning: 0xe9c46a,
      critical: 0xe76f51,
    };

    const formatMap = {
      'pH': { val: data.pH.toFixed(1), status: data.statuses.pH },
      'NH₃': { val: data.ammonia.toFixed(3) + ' ppm', status: data.statuses.ammonia },
      'NO₂⁻': { val: data.nitrite.toFixed(3) + ' ppm', status: data.statuses.nitrite },
      'NO₃⁻': { val: data.nitrate.toFixed(1) + ' ppm', status: data.statuses.nitrate },
      'DO': { val: data.dissolvedOxygen.toFixed(1) + ' mg/L', status: data.statuses.dissolvedOxygen },
    };

    for (const [key, info] of Object.entries(formatMap)) {
      if (this._chemTexts[key]) {
        this._chemTexts[key].setText(info.val);
        this._chemTexts[key].setColor(
          info.status === 'ideal' ? '#a8d8b9' :
          info.status === 'warning' ? '#e9c46a' : '#e76f51'
        );
      }
      if (this._chemTexts[key + '_dot']) {
        this._chemTexts[key + '_dot'].setFillStyle(statusColors[info.status] || 0x52b788);
      }
    }

    // Bacteria bar
    const bactLevel = data.bacteriaLevel || 0;
    const bactY = this._panelY + 36 + 5 * 22 + 8;
    this._bactBarFill.clear();
    this._bactBarFill.fillStyle(0x74c69d, 0.8);
    this._bactBarFill.fillRoundedRect(
      this._panelX + 80, bactY + 1,
      Math.max(0, 100 * bactLevel), 10, 5
    );
  }

  _updateInfo() {
    const gameTime = this.storage.getGameTime();
    const day = Math.floor(gameTime.totalMinutes / gameTime.dayLength) + 1;
    const fishCount = this.storage.getFish().length;
    const plantCount = this.storage.getPlants().length;

    this._dayText.setText(`Day ${day}`);
    this._countText.setText(`🐟 ${fishCount}  🌿 ${plantCount}`);
  }
}
