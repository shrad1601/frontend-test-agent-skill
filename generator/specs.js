// generator/specs.js

/**
 * Generates Playwright spec files from test case definitions using pure templates.
 * No LLM involved — each test case type maps directly to a fixed code block.
 */
export function generateSpecs(allCases, allData, _rawDir, baseURL, dryRun = false) {
  const allSpecs = {};

  for (const [feature, cases] of Object.entries(allCases)) {
    if (cases.length === 0) {
      console.log(`  Skipping ${feature} — no test cases`);
      continue;
    }

    console.log(`  Generating spec for: ${feature}`);

    if (dryRun) {
      console.log(`  [dry-run] Would generate spec for: ${feature}`);
      allSpecs[feature] = "// dry-run — spec not generated";
      continue;
    }

    const testBlocks = cases.map((tc) =>
      generateTestBlock(tc, allData[tc.id], baseURL)
    );
    allSpecs[feature] = buildSpecFile(feature, testBlocks, baseURL);
  }

  return allSpecs;
}

// ─── Spec file wrapper ────────────────────────────────────────────────────────

function buildSpecFile(feature, testBlocks, baseURL) {
  return `// Auto-generated characterization test spec — ${feature}
// Generated: ${new Date().toISOString()}
// Re-run "npm run generate" to regenerate.

import { test } from '@playwright/test';
import fs from 'fs';

const BASE_URL = ${JSON.stringify(baseURL)};
const RESULTS = [];

function record(id, description, observations) {
  RESULTS.push({ id, description, observations, timestamp: new Date().toISOString() });
}

test.afterAll(() => {
  fs.mkdirSync('tests/generated/reports', { recursive: true });
  fs.writeFileSync(
    'tests/generated/reports/results.json',
    JSON.stringify(RESULTS, null, 2)
  );
});

${testBlocks.join("\n\n")}
`;
}

// ─── Per-test block generator ─────────────────────────────────────────────────

function generateTestBlock(tc, testData, baseURL) {
  const urlExpr = tc.page.startsWith("http")
    ? JSON.stringify(tc.page)
    : `BASE_URL + ${JSON.stringify(tc.page)}`;

  const innerLines = buildInnerLines(tc, testData, urlExpr);

  return `test(${JSON.stringify(`${tc.id}: ${tc.description}`)}, async ({ page }) => {
  const consoleErrors = [];
  const networkErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));
  page.on('response', res => { if (res.status() >= 400) networkErrors.push({ url: res.url(), status: res.status() }); });

  const observations = {};
  try {
${innerLines}
  } catch (err) {
    observations.fatalError = err.message;
  }

  observations.consoleErrors = consoleErrors;
  observations.networkErrors = networkErrors;
  record(${JSON.stringify(tc.id)}, ${JSON.stringify(tc.description)}, observations);
});`;
}

function buildInnerLines(tc, testData, urlExpr) {
  const lines = [];

  // Always navigate first
  lines.push(`    await page.goto(${urlExpr}, { waitUntil: 'domcontentloaded' });`);
  lines.push(`    await page.waitForTimeout(500);`);
  lines.push(`    observations.url = page.url();`);
  lines.push(`    observations.title = await page.title();`);

  const action = (tc.action || "").toLowerCase();
  const isFormTest = Array.isArray(tc.formFields) && tc.formFields.length > 0;
  const isClickTest = action.includes("click button") && tc.observedSelector && !isFormTest;
  const isLinkTest = action.includes("click link") && tc.observedSelector;

  if (isFormTest) {
    const fillMap = buildFillMap(tc, testData);
    for (const [field, value] of Object.entries(fillMap)) {
      const safeName = field.replace(/\W/g, "_");
      lines.push(`    try {`);
      lines.push(`      await page.locator('[name="${field}"], #${field}').first().fill(${JSON.stringify(value)}, { timeout: 3000 });`);
      lines.push(`    } catch (e) { observations.fillError_${safeName} = e.message; }`);
    }

    // Submit
    const submitSel = tc.observedSelector
      ? `button, [type="submit"]`
      : `[type="submit"]`;
    const submitFilter = tc.observedSelector
      ? `, { hasText: ${JSON.stringify(tc.observedSelector)} }`
      : "";
    lines.push(`    try {`);
    lines.push(`      await page.locator(${JSON.stringify(submitSel)})${submitFilter ? `.filter(${submitFilter})` : ""}.or(page.locator('[type="submit"]')).first().click({ timeout: 3000 });`);
    lines.push(`      await page.waitForTimeout(1000);`);
    lines.push(`      observations.afterSubmitURL = page.url();`);
    lines.push(`    } catch (e) { observations.submitError = e.message; }`);
  } else if (isClickTest) {
    const btnText = tc.observedSelector;
    lines.push(`    try {`);
    lines.push(`      await page.getByRole('button', { name: ${JSON.stringify(btnText)} }).or(page.locator('input[type="submit"]')).first().click({ timeout: 3000 });`);
    lines.push(`      await page.waitForTimeout(500);`);
    lines.push(`      observations.afterClickURL = page.url();`);
    lines.push(`    } catch (e) { observations.clickError = e.message; }`);
  } else if (isLinkTest) {
    const linkText = tc.observedSelector;
    lines.push(`    try {`);
    lines.push(`      await page.getByRole('link', { name: ${JSON.stringify(linkText)} }).first().click({ timeout: 3000 });`);
    lines.push(`      await page.waitForTimeout(500);`);
    lines.push(`      observations.afterLinkURL = page.url();`);
    lines.push(`    } catch (e) { observations.linkError = e.message; }`);
  }

  return lines.join("\n");
}

// ─── Fill map for form tests ──────────────────────────────────────────────────

/**
 * Builds a { fieldName: value } map for a form test case.
 * - validation / empty  → "" for all fields
 * - edge-case / long    → 256-char strings
 * - edge-case / special → XSS / SQLi payloads
 * - happy-path          → values from testData or inline fallbacks
 */
function buildFillMap(tc, testData) {
  const fields = tc.formFields || [];
  const map = {};

  if (tc.type === "validation") {
    for (const f of fields) map[f] = "";
    return map;
  }

  if (tc.type === "edge-case") {
    const isLong = tc.dataNeeded.includes("long");
    const isSpecial = tc.dataNeeded.includes("special");
    for (const f of fields) {
      const fn = f.toLowerCase();
      if (isLong) {
        map[f] = isEmailField(fn)
          ? "a".repeat(200) + "@test.co"
          : "A".repeat(256);
      } else if (isSpecial) {
        map[f] = isEmailField(fn)
          ? "test+<>\"'@example.com"
          : "<script>alert('xss')</script> ' OR 1=1 --";
      } else {
        map[f] = "edge-case-value";
      }
    }
    return map;
  }

  // happy-path: use testData first, then inline fallbacks
  for (const f of fields) {
    const fn = f.toLowerCase();

    if (testData) {
      // exact key match
      if (testData[f] !== undefined) {
        map[f] = String(testData[f]);
        continue;
      }
      // semantic match
      const match = Object.entries(testData).find(([k]) => {
        const kl = k.toLowerCase();
        return (
          (isEmailField(fn) && kl.includes("email")) ||
          (fn.includes("name") && kl.includes("name")) ||
          (fn.includes("phone") && kl.includes("phone")) ||
          (fn.includes("pass") && kl.includes("pass")) ||
          (fn.includes("address") && kl.includes("address")) ||
          (fn.includes("company") && kl.includes("company"))
        );
      });
      if (match) {
        map[f] = String(match[1]);
        continue;
      }
    }

    // inline fallbacks
    map[f] = inlineFallback(fn);
  }

  return map;
}

function isEmailField(fieldNameLower) {
  return fieldNameLower.includes("email") || fieldNameLower.includes("mail");
}

function inlineFallback(fn) {
  if (isEmailField(fn)) return "test@example.com";
  if (fn.includes("pass")) return "P@ssword1!";
  if (fn.includes("first") && fn.includes("name")) return "Test";
  if (fn.includes("last") && fn.includes("name")) return "User";
  if (fn.includes("name")) return "Test User";
  if (fn.includes("phone") || fn.includes("tel")) return "+1 555 0100";
  if (fn.includes("address") || fn.includes("street")) return "123 Test Street";
  if (fn.includes("city")) return "Testville";
  if (fn.includes("zip") || fn.includes("postal")) return "12345";
  if (fn.includes("country")) return "US";
  if (fn.includes("company") || fn.includes("org")) return "Test Company";
  if (fn.includes("message") || fn.includes("comment") || fn.includes("note")) return "Test message";
  if (fn.includes("url") || fn.includes("website")) return "https://example.com";
  return "test-value";
}
