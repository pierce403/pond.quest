import { chromium } from "playwright";

const DEFAULT_URL = "http://127.0.0.1:4174/";
const DEFAULT_SCREENSHOT = "artifacts/audio_flee_check.png";

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    screenshot: DEFAULT_SCREENSHOT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") {
      args.url = argv[++i];
      continue;
    }
    if (arg === "--screenshot") {
      args.screenshot = argv[++i];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

async function main() {
  const { url, screenshot } = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });

  await page.addInitScript(() => {
    localStorage.clear();
  });

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-type='fish'][data-species='koi']");
    await page.waitForFunction(() => {
      return Boolean(window.__pondQuestGame?.scene?.keys?.PondScene?.fishSystem);
    });

    const initialState = await page.evaluate(() => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      scene.audio.unlock();
      window.__audioCalls = [];
      const originalPlaySfx = scene.audio.playSfx.bind(scene.audio);
      scene.audio.playSfx = (key, opts = {}) => {
        window.__audioCalls.push(key);
        return originalPlaySfx(key, opts);
      };

      return {
        hasPlop: scene.cache.audio.has("sfx_plop"),
        hasSplash: scene.cache.audio.has("sfx_splash"),
        fishCount: scene.storage.getFish().length,
      };
    });

    await page.locator("[data-type='fish'][data-species='koi']").click();
    const placementPoint = await page.evaluate(() => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      const candidates = [
        [0.9, 0.9],
        [1.5, 1.1],
        [2.2, 1.3],
        [1.1, 2.2],
        [2.5, 2.0],
      ];
      for (const [x, y] of candidates) {
        if (!scene.fishSystem.canPlaceFishAt("koi", x, y)) continue;
        return {
          x: scene.gridOriginX + (x - y) * 48,
          y: scene.gridOriginY + (x + y) * 24,
        };
      }
      return null;
    });

    if (!placementPoint) {
      throw new Error("No open pond position found for audio verification.");
    }

    await page.mouse.click(placementPoint.x, placementPoint.y);
    await page.waitForTimeout(350);

    const placedFish = await page.evaluate(() => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      const fish = scene.storage.getFish();
      const latest = fish[fish.length - 1];
      return {
        fishCount: fish.length,
        fishId: latest?.id ?? null,
        fishX: latest?.x ?? null,
        fishY: latest?.y ?? null,
        audioCalls: [...window.__audioCalls],
      };
    });

    if (!placedFish.fishId) {
      throw new Error("Placement did not create a fish.");
    }

    const fishScreenPoint = await page.evaluate((fishId) => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      const fish = scene.storage.getFish().find((entry) => entry.id === fishId);
      if (!fish) return null;
      return {
        x: scene.gridOriginX + (fish.x - fish.y) * 48,
        y: scene.gridOriginY + (fish.x + fish.y) * 24,
      };
    }, placedFish.fishId);

    if (!fishScreenPoint) {
      throw new Error("Could not resolve placed fish screen position.");
    }

    const baseline = await page.evaluate((fishId) => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      const fish = scene.storage.getFish().find((entry) => entry.id === fishId);
      return {
        speed: fish ? Math.hypot(fish.vx ?? 0, fish.vy ?? 0) : 0,
        fleeTimer: fish?.fleeTimer ?? 0,
      };
    }, placedFish.fishId);

    await page.mouse.click(fishScreenPoint.x, fishScreenPoint.y);
    await page.waitForTimeout(140);

    const burst = await page.evaluate((fishId) => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      const fish = scene.storage.getFish().find((entry) => entry.id === fishId);
      return {
        speed: fish ? Math.hypot(fish.vx ?? 0, fish.vy ?? 0) : 0,
        fleeTimer: fish?.fleeTimer ?? 0,
        audioCalls: [...window.__audioCalls],
      };
    }, placedFish.fishId);

    await page.waitForFunction((fishId) => {
      const scene = window.__pondQuestGame?.scene?.keys?.PondScene;
      const fish = scene?.storage?.getFish?.().find((entry) => entry.id === fishId);
      return Boolean(fish) && (fish.fleeTimer ?? 0) <= 0.05;
    }, placedFish.fishId, { timeout: 15000 });

    const settled = await page.evaluate((fishId) => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      const fish = scene.storage.getFish().find((entry) => entry.id === fishId);
      return {
        speed: fish ? Math.hypot(fish.vx ?? 0, fish.vy ?? 0) : 0,
        fleeTimer: fish?.fleeTimer ?? 0,
      };
    }, placedFish.fishId);

    await page.screenshot({ path: screenshot, fullPage: true });

    console.log(`audio cache: plop=${initialState.hasPlop} splash=${initialState.hasSplash}`);
    console.log(`fish count: ${initialState.fishCount} -> ${placedFish.fishCount}`);
    console.log(`audio calls: ${burst.audioCalls.join(", ")}`);
    console.log(`speeds: baseline=${baseline.speed.toFixed(3)} burst=${burst.speed.toFixed(3)} settled=${settled.speed.toFixed(3)}`);
    console.log(`flee timers: burst=${burst.fleeTimer.toFixed(2)} settled=${settled.fleeTimer.toFixed(2)}`);
    console.log(`screenshot: ${screenshot}`);

    if (!initialState.hasPlop || !initialState.hasSplash) {
      throw new Error("Expected SFX files were not loaded into Phaser audio cache.");
    }
    if (placedFish.fishCount !== initialState.fishCount + 1) {
      throw new Error("Fish placement did not add exactly one fish.");
    }
    if (!placedFish.audioCalls.includes("sfx_plop")) {
      throw new Error("Fish placement did not trigger the plop SFX.");
    }
    if (!burst.audioCalls.includes("sfx_splash")) {
      throw new Error("Fish poke did not trigger the splash SFX.");
    }
    if (burst.fleeTimer <= 1.6) {
      throw new Error("Fish poke did not enter the stronger flee state.");
    }
    if (burst.speed <= baseline.speed * 1.25) {
      throw new Error("Fish speed did not spike enough after the poke.");
    }
    if (settled.fleeTimer > 0.05) {
      throw new Error("Fish flee timer did not decay back to idle.");
    }
    if (settled.speed >= burst.speed * 0.8) {
      throw new Error("Fish did not slow down enough after the flee burst.");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
