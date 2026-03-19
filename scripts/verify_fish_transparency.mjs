import { chromium } from "playwright";

const DEFAULT_URL = "http://127.0.0.1:4174/fish_test.html";
const DEFAULT_SCREENSHOT = "artifacts/fish_transparency_check.png";
const MIN_BACKGROUND_COVERAGE = 0.64;
const COLOR_DISTANCE_TOLERANCE = 6;

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
    viewport: { width: 1600, height: 2200 },
    deviceScaleFactor: 1,
  });

  try {
    await page.goto(url, { waitUntil: "networkidle" });

    const results = await page.evaluate(
      async ({ colorDistanceTolerance }) => {
        const cards = [...document.querySelectorAll(".card")];
        const summaries = [];

        for (const card of cards) {
          const wrapper = card.querySelector("div");
          const img = card.querySelector("img");
          if (!wrapper || !img) {
            continue;
          }

          if (!img.complete) {
            await new Promise((resolve, reject) => {
              img.addEventListener("load", resolve, { once: true });
              img.addEventListener("error", reject, { once: true });
            });
          }

          const bg = getComputedStyle(wrapper).backgroundColor.match(/\d+/g).map(Number);
          const canvas = document.createElement("canvas");
          canvas.width = img.clientWidth;
          canvas.height = img.clientHeight;

          const context = canvas.getContext("2d");
          context.fillStyle = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`;
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(img, 0, 0, canvas.width, canvas.height);

          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let matches = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            const dr = pixels[index] - bg[0];
            const dg = pixels[index + 1] - bg[1];
            const db = pixels[index + 2] - bg[2];
            const distance = Math.sqrt(dr * dr + dg * dg + db * db);
            if (distance <= colorDistanceTolerance) {
              matches += 1;
            }
          }

          summaries.push({
            label: card.querySelector("span")?.textContent?.replace(/\s+/g, " ").trim() ?? "unknown",
            coverage: matches / (canvas.width * canvas.height),
          });
        }

        return summaries;
      },
      { colorDistanceTolerance: COLOR_DISTANCE_TOLERANCE }
    );

    await page.screenshot({ path: screenshot, fullPage: true });

    const failures = results.filter(({ coverage }) => coverage < MIN_BACKGROUND_COVERAGE);
    for (const result of results) {
      console.log(`${result.label}: background coverage ${(result.coverage * 100).toFixed(1)}%`);
    }
    console.log(`screenshot: ${screenshot}`);

    if (failures.length > 0) {
      throw new Error(
        `Transparency verification failed for ${failures
          .map(({ label }) => label)
          .join(", ")}`
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
