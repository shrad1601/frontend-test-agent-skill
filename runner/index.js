// runner/index.js
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { loadEnv } from "../crawler/loadEnv.js";
import config from "../config.js";

loadEnv();

const SPECS_DIR = "tests/generated/specs";
const REPORTS_DIR = "tests/generated/reports";
const SCREENSHOTS_DIR = "tests/generated/reports/screenshots";
const RESULTS_FILE = "tests/generated/reports/results.json";

const TEST_TIMEOUT = 8000;

const customSpecsDir = (() => {
  const idx = process.argv.indexOf("--specs-dir");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const ACTIVE_SPECS_DIR = customSpecsDir || SPECS_DIR;
const ACTIVE_RESULTS_FILE = customSpecsDir
  ? path.join(customSpecsDir, "improved_run_results.json")
  : RESULTS_FILE;

async function main() {
  console.log("\nFrontend Test Agent — Runner");
  console.log(`Base URL: ${config.baseURL}`);
  if (customSpecsDir) console.log(`Specs dir: ${customSpecsDir} (improved mode)`);
  console.log();

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  if (!fs.existsSync(ACTIVE_SPECS_DIR)) {
    console.error(`No specs found at ${ACTIVE_SPECS_DIR}. Run the generator first.`);
    process.exit(1);
  }

  const specFiles = fs.readdirSync(ACTIVE_SPECS_DIR).filter((f) => f.endsWith(".spec.js"));
  if (specFiles.length === 0) {
    console.error(`No spec files found in ${ACTIVE_SPECS_DIR}.`);
    process.exit(1);
  }

  console.log(`Found ${specFiles.length} spec file(s)\n`);

  const allResults = [];
  const browser = await chromium.launch({ headless: true });

  for (const specFile of specFiles) {
    console.log(`Running: ${specFile}`);
    const specPath = path.resolve(ACTIVE_SPECS_DIR, specFile);
    const specResults = await runSpec(browser, specPath, specFile);
    allResults.push(...specResults);

    const passed = specResults.filter((r) => r.status === "passed").length;
    const failed = specResults.filter((r) => r.status === "failed").length;
    const errored = specResults.filter((r) => r.status === "error").length;
    console.log(`  ${passed} passed, ${failed} failed, ${errored} errored\n`);
  }

  await browser.close();

  fs.writeFileSync(ACTIVE_RESULTS_FILE, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to ${ACTIVE_RESULTS_FILE}`);

  const total = allResults.length;
  const passed = allResults.filter((r) => r.status === "passed").length;
  const failed = allResults.filter((r) => r.status === "failed").length;
  const errored = allResults.filter((r) => r.status === "error").length;
  const retried = allResults.filter((r) => r.retried).length;

  console.log(`\nSummary:`);
  console.log(`  Total  : ${total}`);
  console.log(`  Passed : ${passed}`);
  console.log(`  Failed : ${failed}`);
  console.log(`  Errored: ${errored}`);
  if (retried > 0) console.log(`  Retried: ${retried} (passed on retry)`);

  // Auto-generate AI report for improved runs
  if (customSpecsDir) {
    try {
      const { generateImprovedReport } = await import("./reporter.js");
      console.log("\nGenerating improved test report...");
      await generateImprovedReport(false);
    } catch (err) {
      console.error(`Report generation failed: ${err.message}`);
    }
  }
}

async function runSpec(browser, specPath, specFile) {
  const results = [];
  const specCode = fs.readFileSync(specPath, "utf-8");
  const testBlocks = extractTestBlocks(specCode);

  if (testBlocks.length === 0) {
    console.log(`  No test blocks found in ${specFile}`);
    return results;
  }

  console.log(`  Found ${testBlocks.length} test(s)`);

  for (const block of testBlocks) {
    let result = await runSingleTest(browser, block, specFile);

    if (result.status === "error" || result.status === "failed") {
      console.log(`    Retrying ${result.id}...`);
      const retryResult = await runSingleTest(browser, block, specFile);
      if (retryResult.status === "passed") {
        retryResult.retried = true;
        retryResult.firstAttemptError = result.errorMessage;
        result = retryResult;
      } else {
        result.retriedAndFailed = true;
      }
    }

    results.push(result);
    const icon = result.status === "passed" ? "✓" : result.status === "failed" ? "✗" : "⚠";
    const retryNote = result.retried ? " (passed on retry)" : result.retriedAndFailed ? " (failed after retry)" : "";
    console.log(`  ${icon} ${result.id} — ${result.status}${retryNote}`);
  }

  return results;
}

function extractTestBlocks(specCode) {
  const blocks = [];
  const testRegex = /test\(['"`](.*?)['"`],\s*async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>\s*\{/g;
  let match;

  while ((match = testRegex.exec(specCode)) !== null) {
    const fullTitle = match[1];
    const startIdx = match.index + match[0].length;

    let depth = 1;
    let i = startIdx;
    while (i < specCode.length && depth > 0) {
      if (specCode[i] === "{") depth++;
      else if (specCode[i] === "}") depth--;
      i++;
    }

    const bodyCode = specCode.slice(startIdx, i - 1);
    const idMatch = fullTitle.match(/^(TC-[A-Z]+-\d+)/);
    const id = idMatch ? idMatch[1] : `TC-${blocks.length + 1}`;
    // fullTitle is extracted via raw text regex, not JS-evaluated, so an
    // escaped quote (\') added to keep the generated source syntactically
    // valid still shows its backslash here — strip it for display.
    const description = fullTitle.replace(/^TC-[A-Z]+-\d+[:\s]*/, "").replace(/\\'/g, "'").trim();

    blocks.push({ id, description, code: bodyCode, fullTitle });
  }

  return blocks;
}

async function runSingleTest(browser, block, specFile) {
  const context = await browser.newContext();
  const page = await context.newPage();

  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(15000);

  const consoleErrors = [];
  const networkErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message.slice(0, 300));
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkErrors.push({ url: response.url(), status: response.status() });
    }
  });

  const recordedObservations = [];
  function record(id, description, obs) {
    recordedObservations.push({ id, description, observations: obs });
  }

  let status = "passed";
  let errorMessage = null;
  let screenshotPath = null;

  try {
    await Promise.race([
      executeTestBody(page, block.code, record, config.baseURL),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Test timed out")), TEST_TIMEOUT)
      )
    ]);

    if (status === "passed" && networkErrors.some((e) => e.status >= 500)) {
      status = "failed";
      errorMessage = `Observed ${networkErrors.filter(e => e.status >= 500).length} HTTP 500 error(s): ${networkErrors.filter(e => e.status >= 500).map(e => e.url).join(", ")}`;
    }

  } catch (err) {
    status = err.message === "Test timed out" ? "error" : "failed";
    errorMessage = err.message.slice(0, 500);

    try {
      screenshotPath = path.join(SCREENSHOTS_DIR, `${block.id}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    } catch {
      screenshotPath = null;
    }
  }

  await context.close();

  return {
    id: block.id,
    description: block.description,
    specFile,
    status,
    errorMessage,
    consoleErrors,
    networkErrors,
    observations: recordedObservations,
    screenshotPath,
    timestamp: new Date().toISOString()
  };
}

async function executeTestBody(page, code, record, baseURL) {
  const safeCode = code
    .replace(/waitUntil:\s*['"]networkidle['"]/g, "waitUntil: 'domcontentloaded'")
    .replace(
      /await page\.fill\((['"`][^'"`]+['"`]),\s*(['"`][^'"`]*['"`])\)/g,
      `await page.locator($1).first().fill($2, { timeout: 3000 })`
    )
    .replace(
      /await page\.click\((['"`][^'"`]+['"`])\);/g,
      `try { await page.locator($1).first().click({ timeout: 3000 }); } catch(e) { observations.clickError = e.message; }`
    )
    .replace(
      /await page\.fill\(([^,]+),\s*([^)]+)\);/g,
      `try { await page.locator($1).first().fill($2, { timeout: 3000 }); } catch(e) { observations.fillError = e.message; }`
    );

  const wrappedCode = `
    return (async () => {
      const BASE_URL = ${JSON.stringify(baseURL)};
      ${safeCode}
    })();
  `;

  const fn = new Function("page", "record", wrappedCode);
  await fn(page, record);
}

main().catch((err) => {
  console.error("Runner failed:", err);
  process.exit(1);
});