// generator/specs.js
import { llmCall } from "./llm.js";
import { loadEnv } from "../crawler/loadEnv.js";

loadEnv();

/**
 * Pulls the JS out of an LLM response, tolerating conversational preambles
 * ("Here's the spec file...") that some providers add before the code
 * fence — a plain start/end fence strip misses those and leaves prose in
 * the .spec.js file.
 */
function extractSpecCode(text) {
  const fenced = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

/**
 * Test titles and record() descriptions often quote an observed name
 * (e.g. "Add to basket", a book title). The LLM usually reaches for double
 * quotes since the surrounding string is single-quoted, but that's a style
 * choice, not a guarantee — an apostrophe left unescaped inside a
 * single-quoted test('...') title breaks the runner's regex-based test
 * extraction with a raw syntax error. Escape defensively rather than
 * relying on the model to always get this right.
 */
function escapeInnerSingleQuotes(content) {
  return content.replace(/\\'/g, "'").replace(/'/g, "\\'");
}

function sanitizeQuoting(spec) {
  let fixed = spec.replace(
    /test\('(.*?)',(\s*async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>\s*\{)/g,
    (_, title, rest) => `test('${escapeInnerSingleQuotes(title)}',${rest}`
  );
  fixed = fixed.replace(
    /record\('([^']*)',\s*'(.*?)',(\s*observations\s*\);)/g,
    (_, id, desc, rest) => `record('${id}', '${escapeInnerSingleQuotes(desc)}',${rest}`
  );
  return fixed;
}

/**
 * Generates Playwright spec files for each feature.
 */
export async function generateSpecs(allCases, allData, rawDir, baseURL, dryRun = false) {
  const allSpecs = {};

  for (const [feature, cases] of Object.entries(allCases)) {
    if (cases.length === 0) {
      console.log(`  Skipping ${feature} — no test cases`);
      continue;
    }

    console.log(`  Generating spec for: ${feature}`);

    const casesWithData = cases.map((tc) => ({
      ...tc,
      testData: allData[tc.id] || null
    }));

    const prompt = buildPrompt(feature, casesWithData, baseURL);

    if (dryRun) {
      console.log(`--- SPECS PROMPT: ${feature} ---`);
      console.log(prompt);
      console.log(`--- END SPECS PROMPT ---\n`);
      allSpecs[feature] = "// dry-run - spec not generated";
      continue;
    }

    try {
      const text = await llmCall(prompt, { maxTokens: 4000 });
      allSpecs[feature] = sanitizeQuoting(extractSpecCode(text));
    } catch (err) {
      console.error(`  Failed for ${feature}: ${err.message}`);
      allSpecs[feature] = `// Generation failed: ${err.message}`;
    }
  }

  return allSpecs;
}

function buildPrompt(feature, casesWithData, baseURL) {
  // Detect if this is a hash-routing SPA by checking if any page URLs
  // in the test cases look like hash routes
  const isHashRouting = casesWithData.some(
    (tc) => tc.page && tc.page.startsWith("/") && !tc.page.startsWith("//")
  ) && !baseURL.includes("toscrape") && !baseURL.includes("github") && !baseURL.includes("wikipedia");

  const navPattern = isHashRouting
    ? `await page.goto(\`\${BASE_URL}/#\${path}\`, { waitUntil: 'networkidle' });`
    : `await page.goto(\`\${BASE_URL}\${path}\`, { waitUntil: 'networkidle' });`;

  return `You are writing a Playwright characterization test spec for the "${feature}" feature.

## BASE URL: ${baseURL}

## CRITICAL RULES — READ CAREFULLY

### This is CHARACTERIZATION testing:
- Observe and RECORD current behavior
- Do NOT assert correctness
- Tests should NEVER throw or fail intentionally
- Always wrap actions in try/catch and record what happened

### ALLOWED Playwright APIs (use ONLY these):
- page.goto(url, { waitUntil: 'networkidle' })
- page.waitForLoadState('networkidle')
- page.waitForTimeout(ms)
- page.fill(selector, value)
- page.click(selector)
- page.locator(selector).count()
- page.locator(selector).isVisible()
- page.locator(selector).textContent()
- page.locator(selector).inputValue()
- page.url()
- page.title()

### STRICTLY FORBIDDEN (these cause crashes/hangs — never use):
- page.waitForNetworkIdle() — does NOT exist
- page.waitForResponse() — hangs forever
- page.context().waitForEvent() — hangs forever
- browserContext.waitForEvent() — hangs forever
- expect() — no assertions in characterization tests
- page.$eval() — use page.locator() instead

### Navigation pattern:
${isHashRouting
  ? `This is a hash-routing SPA. Use: ${navPattern}`
  : `This is a normal server-rendered website. Use: ${navPattern}
NEVER add /#/ to URLs — this site does NOT use hash routing.`
}

### Console error capture (use EXACTLY this pattern at the top of every test):
\`\`\`javascript
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));
\`\`\`
### SELECTOR RULE:
Each test case has an "observedSelector" field — use ONLY that selector for interactions.
If observedSelector is null, the test should ONLY navigate and observe (no clicking).
NEVER invent selectors. If you don't have an observedSelector, don't click anything.

### Standard test structure (follow this EXACTLY):
\`\`\`javascript
test('TC-XXX-001: description', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto('${baseURL}/actual-path', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    observations.url = page.url();
    observations.title = await page.title();
    // record any other observations
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-XXX-001', 'description', observations);
});
\`\`\`

## TEST CASES WITH DATA:
${JSON.stringify(casesWithData, null, 2)}

Write the complete Playwright spec file now. Use this exact file structure:

import { test } from '@playwright/test';
import fs from 'fs';

const BASE_URL = '${baseURL}';
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

// One test() block per test case — follow the standard structure above exactly
// Use FULL URLs like '${baseURL}/catalogue/...' — never add /#/ to non-SPA sites`;
}