import type StorageSystem from '../systems/StorageSystem';
import type EcosystemSystem from '../systems/EcosystemSystem';

/** DOM HUD stays readable and anchored through zoom, rotation, and text enlargement. */
export default class UIScene extends Phaser.Scene {
  storage!: StorageSystem;
  ecosystem!: EcosystemSystem;
  hud!: HTMLElement;
  timer = 0;
  constructor() { super({ key: 'UIScene' }); }
  init(data: { storage: StorageSystem; ecosystem: EcosystemSystem }) {
    this.storage = data.storage;
    this.ecosystem = data.ecosystem;
  }
  create() {
    this.hud = document.createElement('div');
    this.hud.id = 'pond-hud';
    this.hud.innerHTML = `
      <section class="pond-clock" aria-label="Pond time">
        <h1>Pond Quest</h1>
        <div id="pond-time"></div>
        <div id="pond-counts" class="muted"></div>
        <div class="time-controls" aria-label="Simulation controls">
          <button id="pond-pause" aria-label="Pause simulation" aria-pressed="false">Pause</button>
          <button data-speed="1" aria-pressed="true" title="One pond day in 2.4 minutes">1×</button>
          <button data-speed="5" aria-pressed="false">5×</button>
          <button data-speed="20" aria-pressed="false">20×</button>
        </div>
      </section>
      <details class="water-panel" ${window.innerWidth > 600 ? 'open' : ''}>
        <summary><span>Water balance</span><span id="water-status"></span></summary>
        <div class="water-readings">
          <div class="water-vitals"><span>Oxygen <strong id="water-oxygen"></strong></span><span>pH <strong id="water-ph"></strong></span><span id="water-temperature"></span></div>
          <dl>
            <div><dt title="NH₃-N: toxic un-ionized portion of total ammonia, calculated from pH and temperature">Free ammonia</dt><dd id="water-ammonia"></dd></div>
            <div><dt title="NH₃-N + NH₄-N">Total ammonia</dt><dd id="water-tan"></dd></div>
            <div><dt>Nitrite</dt><dd id="water-nitrite"></dd></div>
            <div><dt>Nitrate</dt><dd id="water-nitrate"></dd></div>
            <div><dt title="Buffering capacity, as CaCO₃">Alkalinity</dt><dd id="water-alkalinity"></dd></div>
          </dl>
          <p class="units-note">Nitrogen readings in mg N/L · alkalinity in mg/L as CaCO₃</p>
          <div class="bacteria-label"><span>Biofilter establishing</span><span id="bacteria-percent"></span></div>
          <meter id="bacteria-meter" min="0" max="1" aria-label="Biofilter maturity"></meter>
          <p id="water-guidance"></p>
        </div>
      </details>`;
    document.getElementById('game-container')!.appendChild(this.hud);
    this.hud.querySelector('#pond-pause')!.addEventListener('click', () => {
      this.ecosystem.paused = !this.ecosystem.paused;
      this.storage.flush();
      this.refresh();
    });
    this.hud.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(button => {
      button.addEventListener('click', () => { this.ecosystem.setSpeed(Number(button.dataset.speed)); this.refresh(); });
    });
    this.events.once('shutdown', () => this.hud.remove());
    this.refresh();
  }
  update(_time: number, delta: number) {
    this.timer += delta;
    if (this.timer < 250) return;
    this.timer = 0;
    this.refresh();
  }
  private set(id: string, text: string, status?: string) {
    const el = this.hud.querySelector<HTMLElement>(`#${id}`)!;
    if (el.textContent !== text) el.textContent = text;
    if (status) el.dataset.status = status;
  }
  refresh() {
    const c = this.ecosystem.getAnnotatedChemistry();
    const minutes = Math.floor(this.storage.getGameTime().totalMinutes);
    const clock = (minutes + 480) % 1440;
    const time = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`;
    this.set('pond-time', `Day ${Math.floor(minutes / 1440) + 1} · ${time} · ${c.light > 0 ? 'Daylight' : 'Night'}`);
    this.set('pond-counts', `${this.storage.getFish().length} fish · ${this.storage.getPlants().length} plants`);
    this.set('water-oxygen', `${c.dissolvedOxygen.toFixed(1)} mg/L`, c.statuses.dissolvedOxygen);
    this.set('water-ph', c.pH.toFixed(1), c.statuses.pH);
    this.set('water-temperature', `${c.temperature.toFixed(1)} °C`);
    this.set('water-ammonia', c.freeAmmonia.toFixed(3), c.statuses.ammonia);
    this.set('water-tan', c.ammonia.toFixed(3));
    this.set('water-nitrite', c.nitrite.toFixed(3), c.statuses.nitrite);
    this.set('water-nitrate', c.nitrate.toFixed(2), c.statuses.nitrate);
    this.set('water-alkalinity', c.alkalinity.toFixed(1), c.statuses.alkalinity);
    const levels = Object.values(c.statuses);
    const severity = levels.includes('critical') ? 'critical' : levels.includes('warning') ? 'warning' : 'ideal';
    this.set('water-status', severity === 'critical' ? 'Needs care' : severity === 'warning' ? 'Watch' : 'Balanced', severity);
    const bacteria = Math.min(c.bacteriaLevel, c.nitriteBacteriaLevel);
    this.set('bacteria-percent', `${Math.round(bacteria * 100)}%`);
    (this.hud.querySelector('#bacteria-meter') as HTMLMeterElement).value = bacteria;
    this.set('water-guidance', c.dissolvedOxygen < 5 ? 'Low oxygen. Reduce stocking and thin dense surface cover.' :
      c.alkalinity < 20 ? 'Buffer depleted. Nitrification slows and pH can fall.' :
      c.freeAmmonia > 0.02 || c.nitrite > 0.25 ? 'Give the biofilter time to establish; avoid adding more fish.' :
      c.nitrate > 20 ? 'Plants take up nitrogen. Removing plant growth exports it from the pond.' :
      c.light < 0.01 ? 'Night: plants and fish use oxygen. The lowest level is usually near dawn.' :
      `Surface shade ${Math.round(c.coverage * 100)}% · oxygen ${Math.round(c.dissolvedOxygen / c.saturation * 100)}% of saturation.`);
    const pause = this.hud.querySelector<HTMLButtonElement>('#pond-pause')!;
    pause.textContent = this.ecosystem.paused ? 'Resume' : 'Pause';
    pause.setAttribute('aria-pressed', String(this.ecosystem.paused));
    pause.setAttribute('aria-label', this.ecosystem.paused ? 'Resume simulation' : 'Pause simulation');
    this.hud.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === this.ecosystem.speed)));
  }
}
