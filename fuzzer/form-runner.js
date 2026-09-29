// fuzzer/form-runner.js
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { loadEnv } from "../crawler/loadEnv.js";
import { generateFuzzSpec } from "./spec-generator.js";
import { generateFormFuzzReport } from "./reporter.js";
import config from "../config.js";

loadEnv();

const SPECS_DIR = "tests/generated/fuzz/specs";
const RESULTS_FILE = "tests/generated/fuzz/reports/fuzz_form_results.json";
const SCREENSHOTS_DIR = "tests/generated/fuzz/reports/screenshots";
const TEST_TIMEOUT = 10000;
const RAW_DIR = config.output.rawDir;

async function main() {
  console.log("\n🎭 Fuzz Frontend — Browser Form Fuzzer");
  console.log(`Base URL: ${config.baseURL}\n`);

  fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  fs.mkdirSync(SPECS_DIR, { recursive: true });

  console.log("Step 1 — Generating fuzz spec from crawl data...");
  if (!fs.existsSync(RAW_DIR) || fs.readdirSync(RAW_DIR).filter(f => f.endsWith(".json")).length === 0) {
    console.error("No crawl data found. Run a crawl first from the Configure tab.");
    process.exit(1);
  }

  const { formCases, formData } = generateFuzzSpec([], {}, RAW_DIR);
  console.log(`  Generated ${formCases.length} form fuzz test case(s)`);

  if (formCases.length === 0) {
    console.log("  No forms found in crawl data — nothing to fuzz.");
    fs.writeFileSync(RESULTS_FILE, JSON.stringify([], null, 2));
    console.log("\n✓ Done. No forms found on this site.");
    return;
  }

  const specFile = path.join(SPECS_DIR, "fuzz.spec.js");
  if (!fs.existsSync(specFile)) {
    console.error("Spec file not generated. Cannot proceed.");
    process.exit(1);
  }

  const specCode = fs.readFileSync(specFile, "utf-8");
  const testBlocks = extractTestBlocks(specCode);

  if (testBlocks.length === 0) {
    console.log("No test blocks found in fuzz spec — no forms to test.");
    fs.writeFileSync(RESULTS_FILE, JSON.stringify([], null, 2));
    return;
  }

  console.log(`\nStep 2 — Running ${testBlocks.length} frontend fuzz test(s)\n`);

  const browser = await chromium.launch({ headless: true });
  const allResults = [];

  for (const block of testBlocks) {
    const result = await runSingleTest(browser, block);
    allResults.push(result);
    const icon = result.anomaly ? "⚠" : "✓";
    const timeStr = result.durationMs != null ? ` (${result.durationMs}ms)` : "";
    console.log(`  ${icon} ${result.id} — ${result.status}${timeStr}${result.anomaly ? ` [${result.anomalyType}]` : ""}`);
  }

  await browser.close();

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));

  const anomalies = allResults.filter((r) => r.anomaly);
  console.log(`\n✓ Done. ${allResults.length} tests, ${anomalies.length} anomalies found`);
  console.log(`Results saved to ${RESULTS_FILE}`);

  // Step 3 — AI report
  console.log("\nStep 3 — Generating form fuzz report...");
  await generateFormFuzzReport(allResults);

  console.log("\n[frontend fuzz complete]");
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
    const idMatch = fullTitle.match(/^(TC-FUZZ-[A-Z0-9-]+)/);
    const id = idMatch ? idMatch[1] : `TC-FUZZ-FORM-${blocks.length + 1}`;
    const description = fullTitle.replace(/^TC-FUZZ-[A-Z0-9-]+[:\s]*/, "").trim();

    blocks.push({ id, description, code: bodyCode, fullTitle });
  }

  return blocks;
}

async function runSingleTest(browser, block) {
  const context = await browser.newContext();
  const page = await context.newPage();

  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(15000);

  const consoleErrors = [];
  const networkResponses = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message.slice(0, 300));
  });
  page.on("response", (response) => {
    networkResponses.push({
      url: response.url(),
      status: response.status()
    });
  });

  const recordedObservations = [];
  function record(id, description, obs) {
    recordedObservations.push({ id, description, observations: obs });
  }

  let status = "passed";
  let errorMessage = null;
  let screenshotPath = null;
  let anomaly = false;
  let anomalyType = null;
  let finalURL = null;
  let pageTitle = null;
  let pageH1 = null;

  const startTime = Date.now();

  try {
    await Promise.race([
      executeTestBody(page, block.code, record, config.baseURL),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Test timed out")), TEST_TIMEOUT)
      )
    ]);

    finalURL = page.url();
    try {
      pageTitle = await page.title();
      pageH1 = await page.locator("h1").first().textContent({ timeout: 1000 }).catch(() => null);
    } catch {
      // non-critical
    }

    const has5xx = networkResponses.some((r) => r.status >= 500);
    const hasStackTrace = await page.content().then(html =>
      /Traceback|stack trace|at \w+\.\w+\(|Exception in|Caused by:/i.test(html)
    ).catch(() => false);

    if (has5xx) {
      anomaly = true;
      anomalyType = "HTTP 5xx on form submission";
      status = "failed";
      errorMessage = `Server error: ${networkResponses.filter(r => r.status >= 500).map(r => `${r.status} ${r.url}`).join(", ")}`;
    } else if (hasStackTrace) {
      anomaly = true;
      anomalyType = "Stack trace / error detail leaked in response";
      status = "failed";
    } else if (consoleErrors.length > 0) {
      anomaly = true;
      anomalyType = "Console errors observed";
    }

  } catch (err) {
    status = err.message === "Test timed out" ? "error" : "failed";
    errorMessage = err.message.slice(0, 500);
    anomaly = true;
    anomalyType = status === "error" ? "Test timed out" : "Test crashed";

    try {
      screenshotPath = path.join(SCREENSHOTS_DIR, `${block.id}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    } catch {
      screenshotPath = null;
    }
  }

  const durationMs = Date.now() - startTime;

  await context.close();

  return {
    id: block.id,
    description: block.description,
    status,
    durationMs,
    anomaly,
    anomalyType,
    errorMessage,
    postSubmission: {
      finalURL,
      pageTitle,
      pageH1,
      statusCodesObserved: [...new Set(networkResponses.map(r => r.status))],
      networkResponses: networkResponses.slice(0, 20)
    },
    consoleErrors,
    observations: recordedObservations,
    screenshotPath,
    timestamp: new Date().toISOString()
  };
}

async function executeTestBody(page, code, record, baseURL) {
  const safeCode = code
    .replace(/waitUntil:\s*['"]networkidle['"]/g, "waitUntil: 'domcontentloaded'")
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
  console.error("Form fuzzer failed:", err);
  process.exit(1);
});