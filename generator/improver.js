// generator/improver.js
import fs from "fs";
import path from "path";
import { llmCall } from "./llm.js";
import { loadEnv } from "../crawler/loadEnv.js";
import config from "../config.js";

loadEnv();

const IMPROVED_SPECS_DIR = "tests/generated/improved";
const RUNNER_RESULTS_FILE = "tests/generated/reports/results.json";
const FUZZ_RESULTS_FILE = "tests/generated/fuzz/reports/fuzz_results.json";
const FUZZ_FORM_RESULTS_FILE = "tests/generated/fuzz/reports/fuzz_form_results.json";
const SPECS_DIR = "tests/generated/specs";

export async function improveTests(source = "runner") {
  fs.mkdirSync(IMPROVED_SPECS_DIR, { recursive: true });

  const failures = collectFailures(source);

  if (failures.length === 0) {
    console.log("  No failures or errors found — nothing to improve.");
    return { improved: 0, failures: 0 };
  }

  console.log(`  Found ${failures.length} failure(s) to improve from source: ${source}`);

  const originalSpecs = loadOriginalSpecs();
  const baseURL = config.baseURL;
  const isHashRouting = detectHashRouting(originalSpecs);

  const improvedTests = [];
  let counter = 1;

  for (const failure of failures) {
    console.log(`  Improving ${failure.id} (${failure.source})...`);
    const originalCode = findOriginalTestCode(failure.id, originalSpecs);
    const prompt = buildImprovementPrompt(failure, originalCode, baseURL, isHashRouting, counter);

    try {
      const text = await llmCall(prompt, { maxTokens: 4000 });
      const spec = extractSpecCode(text);

      if (spec) {
        improvedTests.push({
          originalId: failure.id,
          improvedId: `TC-IMP-${String(counter).padStart(3, "0")}`,
          source: failure.source,
          errorCategory: failure.errorCategory,
          spec,
          generatedAt: new Date().toISOString()
        });
        counter++;
      } else {
        console.warn(`  Could not extract valid test block for ${failure.id} — skipping`);
      }
    } catch (err) {
      console.error(`  Failed to improve ${failure.id}: ${err.message}`);
    }
  }

  if (improvedTests.length === 0) {
    console.log("  No improved tests were generated.");
    return { improved: 0, failures: failures.length };
  }

  const combinedSpec = buildCombinedSpec(improvedTests, baseURL);
  const specPath = path.join(IMPROVED_SPECS_DIR, "improved.spec.js");
  fs.writeFileSync(specPath, combinedSpec);
  console.log(`  Improved spec written to ${specPath}`);

  fs.writeFileSync(
    path.join(IMPROVED_SPECS_DIR, "improved_meta.json"),
    JSON.stringify(improvedTests.map((t) => ({
      originalId: t.originalId,
      improvedId: t.improvedId,
      source: t.source,
      errorCategory: t.errorCategory,
      generatedAt: t.generatedAt
    })), null, 2)
  );

  return { improved: improvedTests.length, failures: failures.length };
}

function collectFailures(source) {
  const failures = [];

  if (source === "runner" || source === "all") {
    if (fs.existsSync(RUNNER_RESULTS_FILE)) {
      const results = JSON.parse(fs.readFileSync(RUNNER_RESULTS_FILE, "utf-8"));
      for (const r of results) {
        if (r.status === "error" || r.status === "failed") {
          failures.push({
            id: r.id,
            source: "runner",
            description: r.description,
            status: r.status,
            errorMessage: r.errorMessage,
            consoleErrors: r.consoleErrors || [],
            networkErrors: r.networkErrors || [],
            errorCategory: categoriseFailure(r),
            retriedAndFailed: r.retriedAndFailed || false
          });
        }
      }
    } else if (source === "runner") {
      console.log("  No runner results found. Run tests first.");
    }
  }

  if (source === "fuzzer" || source === "all") {
    if (fs.existsSync(FUZZ_RESULTS_FILE)) {
      const results = JSON.parse(fs.readFileSync(FUZZ_RESULTS_FILE, "utf-8"));
      for (const r of results) {
        if (r.anomaly) {
          failures.push({
            id: r.id,
            source: "api-fuzzer",
            description: r.description,
            status: r.anomalyType,
            errorMessage: r.anomalyType,
            method: r.method,
            endpoint: r.endpoint,
            input: r.input,
            statusCode: r.statusCode,
            responseBody: r.responseBody,
            errorCategory: categoriseFailure(r),
            retriedAndFailed: false
          });
        }
      }
    }

    if (fs.existsSync(FUZZ_FORM_RESULTS_FILE)) {
      const results = JSON.parse(fs.readFileSync(FUZZ_FORM_RESULTS_FILE, "utf-8"));
      for (const r of results) {
        if (r.anomaly) {
          failures.push({
            id: r.id,
            source: "frontend-fuzzer",
            description: r.description,
            status: r.anomalyType,
            errorMessage: r.errorMessage || r.anomalyType,
            consoleErrors: r.consoleErrors || [],
            postSubmission: r.postSubmission,
            errorCategory: categoriseFailure(r),
            retriedAndFailed: false
          });
        }
      }
    }

    if (source === "fuzzer" && !fs.existsSync(FUZZ_RESULTS_FILE) && !fs.existsSync(FUZZ_FORM_RESULTS_FILE)) {
      console.log("  No fuzzer results found. Run the fuzzer first.");
    }
  }

  return failures;
}

function categoriseFailure(r) {
  const msg = (r.errorMessage || r.anomalyType || "").toLowerCase();
  const status = r.statusCode || r.networkErrors?.[0]?.status || 0;

  if (msg.includes("timed out") || msg.includes("timeout")) return "timeout";
  if (status >= 500 || msg.includes("500") || msg.includes("internal server error")) return "http-5xx";
  if (status >= 400 || msg.includes("400") || msg.includes("bad request")) return "http-4xx";
  if (msg.includes("err_name_not_resolved") || msg.includes("net::") || msg.includes("failed to fetch")) return "network";
  if (msg.includes("stack trace") || msg.includes("traceback")) return "stack-trace-leak";
  if (r.consoleErrors?.length > 0) return "console-errors";
  return "unknown";
}

function loadOriginalSpecs() {
  const specs = {};
  if (!fs.existsSync(SPECS_DIR)) return specs;
  for (const file of fs.readdirSync(SPECS_DIR).filter(f => f.endsWith(".spec.js"))) {
    specs[file] = fs.readFileSync(path.join(SPECS_DIR, file), "utf-8");
  }
  return specs;
}

function findOriginalTestCode(testId, originalSpecs) {
  for (const [, code] of Object.entries(originalSpecs)) {
    const regex = new RegExp(`test\\(['"\`]${testId}[^'"\`]*['"\`][^{]*\\{`);
    const match = regex.exec(code);
    if (match) {
      const startIdx = match.index + match[0].length;
      let depth = 1;
      let i = startIdx;
      while (i < code.length && depth > 0) {
        if (code[i] === "{") depth++;
        else if (code[i] === "}") depth--;
        i++;
      }
      return code.slice(match.index, i);
    }
  }
  return null;
}

function detectHashRouting(originalSpecs) {
  const allCode = Object.values(originalSpecs).join("\n");
  return allCode.includes("/#/") || allCode.includes("/#");
}

function buildImprovementPrompt(failure, originalCode, baseURL, isHashRouting, counter) {
  const improvementId = `TC-IMP-${String(counter).padStart(3, "0")}`;
  const categoryGuidance = getCategoryGuidance(failure);

  return `You are improving a failing characterization test for a web application.

## APPLICATION CONTEXT
- Base URL: ${baseURL}
- Routing: ${isHashRouting ? "SPA with hash routing (use /#/ prefix for paths)" : "Server-rendered (use plain paths, never add /#/)"}
- Testing approach: Characterization testing — observe and RECORD behavior, never assert correctness

## FAILING TEST
Test ID: ${failure.id}
Source: ${failure.source}
Description: ${failure.description}
Error category: ${failure.errorCategory}
${originalCode ? `\nOriginal test code:\n\`\`\`javascript\n${originalCode}\n\`\`\`` : "(original test code not available)"}

## WHAT WENT WRONG
${formatFailureDetails(failure)}

## WHY IT LIKELY FAILED
${categoryGuidance.diagnosis}

## YOUR GOAL
Write an improved test with ID ${improvementId} that:
${categoryGuidance.instructions}

## STRICT RULES — FOLLOW EXACTLY

### Allowed Playwright APIs (use ONLY these):
- page.goto(url, { waitUntil: 'domcontentloaded' })
- page.waitForLoadState('domcontentloaded')
- page.waitForTimeout(ms)
- page.locator(selector).fill(value, { timeout: 3000 })   ← ALWAYS use locator().fill(), never page.fill()
- page.locator(selector).click({ timeout: 3000 })          ← ALWAYS use locator().click(), never page.click()
- page.locator(selector).first().fill(value, { timeout: 3000 })
- page.locator(selector).first().click({ timeout: 3000 })
- page.locator(selector).count()
- page.locator(selector).isVisible()
- page.locator(selector).textContent()
- page.locator(selector).inputValue()
- page.url()
- page.title()

### Strictly forbidden:
- page.fill() — use page.locator().fill() instead
- page.click() — use page.locator().click() instead
- page.waitForNetworkIdle()
- page.waitForResponse()
- page.waitForSelector()
- page.context().waitForEvent()
- expect()
- page.$eval()
- waitUntil: 'networkidle'

### Wrap ALL locator interactions in try/catch:
\`\`\`javascript
try {
  await page.locator('selector').first().fill('value', { timeout: 3000 });
} catch (err) {
  observations.fillError = err.message;
}
\`\`\`

### Required test structure:
\`\`\`javascript
test('${improvementId}: <description>', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    // improved test logic here
    // wrap ALL actions in try/catch
    // record observations, never assert
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('${improvementId}', '<description>', observations);
});
\`\`\`

### Navigation:
${isHashRouting
    ? `await page.goto(\`${baseURL}/#\${path}\`, { waitUntil: 'domcontentloaded' });`
    : `await page.goto(\`${baseURL}\${path}\`, { waitUntil: 'domcontentloaded' });`
  }

## OUTPUT
Respond with ONLY the test() block.
Start with \`test('\` and end with \`});\`
No imports, no file structure, no explanation, no markdown fences.
The response MUST end with \`});\` — do not truncate.`;
}

function getCategoryGuidance(failure) {
  switch (failure.errorCategory) {
    case "timeout":
      return {
        diagnosis: `The test timed out waiting for the page or element. This usually means the page never finished loading, likely due to a failing API call that blocks rendering. ${failure.retriedAndFailed ? "This was retried and failed again — it is a consistent issue, not a fluke." : ""}`,
        instructions: `- Uses waitUntil: 'domcontentloaded' instead of 'networkidle'
- Adds waitForTimeout(500) after navigation instead of waiting for network
- Listens to page responses to capture which API calls returned errors
- Records the final URL and page title even if the page partially loaded
- Wraps every action in try/catch`
      };
    case "http-5xx":
      return {
        diagnosis: `The server returned a 5xx error for ${failure.endpoint || "an endpoint"}. This indicates a server-side bug.`,
        instructions: `- Directly targets the failing endpoint: ${failure.endpoint || "the observed endpoint"}
- Tests multiple input variations to characterize which inputs trigger the 500
- Records the full response body to capture any leaked error details
- Also tests the list endpoint to see if the crash is isolated to the :id endpoint
- Records response time`
      };
    case "http-4xx":
      return {
        diagnosis: `The server returned a 4xx error. This may indicate missing auth, wrong input format, or a missing resource.`,
        instructions: `- Records the exact response body to understand what the server expects
- Tests with different input formats
- Records whether the error is consistent or intermittent`
      };
    case "network":
      return {
        diagnosis: `A network error occurred. The page may be referencing an external resource that is unavailable.`,
        instructions: `- Navigates to the page and records ALL network errors
- Identifies which specific resources are failing to load
- Records whether the page is still functional despite the errors`
      };
    case "stack-trace-leak":
      return {
        diagnosis: `The server leaked a stack trace or internal error details. This is a security concern.`,
        instructions: `- Captures the full response body to document what is leaked
- Tests with multiple boundary inputs to see how consistently the leak occurs
- Records the HTTP status code alongside the leaked content`
      };
    case "console-errors":
      return {
        diagnosis: `JavaScript console errors were observed on the page.`,
        instructions: `- Captures all console errors
- Navigates through the page's key interactions to trigger errors
- Records whether errors appear on load or only after user interaction`
      };
    default:
      return {
        diagnosis: `An unexpected error occurred during the test.`,
        instructions: `- Adds more defensive error handling around each step
- Records more detailed observations about the page state
- Uses shorter timeouts to fail fast`
      };
  }
}

function formatFailureDetails(failure) {
  const lines = [];
  if (failure.errorMessage) lines.push(`Error message: ${failure.errorMessage}`);
  if (failure.statusCode) lines.push(`HTTP status: ${failure.statusCode}`);
  if (failure.method && failure.endpoint) lines.push(`Endpoint: ${failure.method} ${failure.endpoint}`);
  if (failure.input) lines.push(`Input that triggered it: ${JSON.stringify(failure.input)}`);
  if (failure.responseBody) lines.push(`Response body: ${failure.responseBody.slice(0, 300)}`);
  if (failure.consoleErrors?.length > 0) lines.push(`Console errors:\n${failure.consoleErrors.slice(0, 3).map(e => `  - ${e}`).join("\n")}`);
  if (failure.networkErrors?.length > 0) lines.push(`Network errors:\n${failure.networkErrors.slice(0, 3).map(e => `  - ${e.status} ${e.url}`).join("\n")}`);
  if (failure.postSubmission) lines.push(`Post-submission state: final URL = ${failure.postSubmission.finalURL}, status codes = ${failure.postSubmission.statusCodesObserved?.join(", ")}`);
  return lines.join("\n");
}

function extractSpecCode(text) {
  const clean = text
    .trim()
    .replace(/^```(javascript|js)?/i, "")
    .replace(/```$/, "")
    .trim();

  const testMatch = /test\s*\(/.exec(clean);
  if (!testMatch) return null;

  const startIdx = testMatch.index;
  let depth = 0;
  let i = startIdx;
  let started = false;

  while (i < clean.length) {
    const char = clean[i];
    if (char === "{") { depth++; started = true; }
    else if (char === "}") {
      depth--;
      if (started && depth === 0) {
        let j = i + 1;
        while (j < clean.length && (clean[j] === " " || clean[j] === "\n" || clean[j] === "\r")) j++;
        if (clean[j] === ")" && clean[j + 1] === ";") {
          i = j + 2;
          break;
        }
      }
    }
    i++;
  }

  let extracted = clean.slice(startIdx, i).trim();

  // If truncated, patch the closing braces
  if (!extracted.endsWith(");")) {
    let openDepth = 0;
    for (const ch of extracted) {
      if (ch === "{") openDepth++;
      else if (ch === "}") openDepth--;
    }
    for (let d = 0; d < openDepth - 1; d++) extracted += "\n  }";
    extracted += "\n});";
  }

  if (!extracted.includes("async")) return null;
  return extracted;
}

function buildCombinedSpec(improvedTests, baseURL) {
  const testBlocks = improvedTests.map((t) => t.spec).join("\n\n");

  return `// improved.spec.js — Auto-generated improved tests targeting observed failures
// Generated: ${new Date().toISOString()}
// Original failures addressed: ${improvedTests.map(t => t.originalId).join(", ")}

import { test } from '@playwright/test';
import fs from 'fs';

const BASE_URL = '${baseURL}';
const RESULTS = [];

function record(id, description, observations) {
  RESULTS.push({ id, description, observations, timestamp: new Date().toISOString() });
}

test.afterAll(() => {
  fs.mkdirSync('tests/generated/improved', { recursive: true });
  fs.writeFileSync(
    'tests/generated/improved/improved_results.json',
    JSON.stringify(RESULTS, null, 2)
  );
});

${testBlocks}
`;
}