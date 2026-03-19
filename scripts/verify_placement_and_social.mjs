import { chromium } from "playwright";

const DEFAULT_URL = "http://127.0.0.1:4174/";
const DEFAULT_SCREENSHOT = "artifacts/placement_social_check.png";

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
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-tray-card='1']");
    await page.waitForFunction(() => {
      return Boolean(window.__pondQuestGame?.scene?.keys?.PondScene?.storage);
    });

    const trayMetrics = await page.locator("#inventory-tray").evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      viewportWidth: window.innerWidth,
    }));

    const countsBefore = await page.evaluate(() => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      return {
        fish: scene.storage.getFish().length,
        plants: scene.storage.getPlants().length,
      };
    });

    await page.locator("[data-type='fish'][data-species='goldfish']").click();
    await page.mouse.click(18, 20);
    const invalidClickState = await page.evaluate(() => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      return {
        fish: scene.storage.getFish().length,
        selection: scene._placementSelection,
      };
    });

    await page.locator("[data-type='fish'][data-species='koi']").click();
    const koiArmed = await page.locator("[data-type='fish'][data-species='koi']").evaluate((el) => el.dataset.active);

    const fishPoint = await page.evaluate(() => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      const candidates = [
        [0.55, 0.7],
        [1.15, 0.95],
        [1.9, 1.2],
        [2.7, 1.6],
        [1.1, 2.4],
        [2.6, 2.5],
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

    if (!fishPoint) {
      throw new Error("No open point found for fish placement.");
    }

    await page.mouse.click(fishPoint.x, fishPoint.y);
    await page.waitForTimeout(200);

    const fishPlacementState = await page.evaluate(() => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      return {
        fish: scene.storage.getFish().length,
        selection: scene._placementSelection,
      };
    });

    await page.locator("[data-type='plant'][data-species='lotus']").click();
    const plantPoint = await page.evaluate(() => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      for (let tileY = 0; tileY < scene.gridH; tileY += 1) {
        for (let tileX = 0; tileX < scene.gridW; tileX += 1) {
          const slot = scene.plantSystem.findPlacementSlot(tileX, tileY, 1, 1);
          if (!slot) continue;
          return {
            x: scene.gridOriginX + (tileX - tileY) * 48 + (slot.subX - slot.subY) * 12,
            y: scene.gridOriginY + (tileX + tileY) * 24 + (slot.subX + slot.subY) * 6,
          };
        }
      }
      return null;
    });

    if (!plantPoint) {
      throw new Error("No open point found for plant placement.");
    }

    await page.mouse.click(plantPoint.x, plantPoint.y);
    await page.waitForTimeout(200);

    const plantPlacementState = await page.evaluate(() => {
      const scene = window.__pondQuestGame.scene.keys.PondScene;
      return {
        plants: scene.storage.getPlants().length,
        selection: scene._placementSelection,
      };
    });

    const socialImages = await page.evaluate(async () => {
      const urls = ["/og-image.png", "/embed-image.png"];
      const results = [];
      for (const url of urls) {
        const img = new Image();
        img.src = `${url}?ts=${Date.now()}`;
        await img.decode();
        results.push({
          url,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      }
      return results;
    });

    await page.screenshot({ path: screenshot, fullPage: true });

    console.log(`tray width: ${trayMetrics.width.toFixed(0)} / viewport ${trayMetrics.viewportWidth}`);
    console.log(`invalid fish click preserved count: ${invalidClickState.fish === countsBefore.fish}`);
    console.log(`koi armed state: ${koiArmed}`);
    console.log(`fish after placement: ${fishPlacementState.fish}`);
    console.log(`plants after placement: ${plantPlacementState.plants}`);
    for (const image of socialImages) {
      console.log(`${image.url}: ${image.width}x${image.height}`);
    }
    console.log(`screenshot: ${screenshot}`);

    if (trayMetrics.width > trayMetrics.viewportWidth) {
      throw new Error("Inventory tray overflows the mobile viewport.");
    }
    if (invalidClickState.fish !== countsBefore.fish) {
      throw new Error("Fish placement succeeded outside the pond.");
    }
    if (invalidClickState.selection?.species !== "goldfish") {
      throw new Error("Invalid placement should keep the selected place button armed.");
    }
    if (koiArmed !== "1") {
      throw new Error("Selected place button did not light up.");
    }
    if (fishPlacementState.fish !== countsBefore.fish + 1) {
      throw new Error("Fish placement did not add exactly one fish.");
    }
    if (fishPlacementState.selection !== null) {
      throw new Error("Fish placement did not clear the armed place state.");
    }
    if (plantPlacementState.plants !== countsBefore.plants + 1) {
      throw new Error("Plant placement did not add exactly one plant.");
    }
    if (plantPlacementState.selection !== null) {
      throw new Error("Plant placement did not clear the armed place state.");
    }
    for (const image of socialImages) {
      if (image.width < 1200 || image.height < 630) {
        throw new Error(`${image.url} is undersized.`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
