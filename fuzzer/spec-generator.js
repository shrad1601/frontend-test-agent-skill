// fuzzer/spec-generator.js
import fs from "fs";
import path from "path";
import config from "../config.js";

const SPECS_DIR = "tests/generated/fuzz/specs";

/**
 * Generates a Playwright spec file for form-based fuzz testing.
 * Reads forms from crawl data and fills them with fuzz inputs.
 */
export function generateFuzzSpec(cases, data, rawDir) {
  fs.mkdirSync(SPECS_DIR, { recursive: true });

  const forms = extractFormsFromCrawl(rawDir);
  const formCases = generateFormFuzzCases(forms);

  const allCases = [...cases, ...formCases.cases];
  const allData = { ...data, ...formCases.data };

  const specContent = buildSpec(allCases, allData, formCases.formsWithIds, config.baseURL);

  const specPath = path.join(SPECS_DIR, "fuzz.spec.js");
  fs.writeFileSync(specPath, specContent);
  console.log(`  Fuzz spec written to ${specPath}`);

  return { formCases: formCases.cases, formData: formCases.data };
}

/**
 * Extracts form definitions from raw crawl data.
 */
function extractFormsFromCrawl(rawDir) {
  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"));
  const forms = [];

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf-8"));
    for (const form of raw.forms || []) {
      if (form.fields?.length > 0) {
        forms.push({
          pageURL: raw.url,
          fields: form.fields,
          submitButton: form.submitButtonText,
          apiCall: raw.networkCallsObserved?.find(
            (c) => c.method === "POST" || c.method === "PUT"
          )?.url || null
        });
      }
    }
  }

  return forms;
}

/**
 * Generates fuzz test cases for each form found.
 * Also returns formsWithIds so buildSpec can match each form to its own cases.
 */
function generateFormFuzzCases(forms) {
  const cases = [];
  const data = {};
  const formsWithIds = [];
  let counter = 100;

  for (const form of forms) {
    const baseId = `TC-FUZZ-FORM-${String(counter).padStart(3, "0")}`;
    counter++;

    const fieldNames = form.fields.map((f) => f.name).filter(Boolean);

    const testSets = [
      {
        id: `${baseId}-A`,
        description: `Submit form on ${form.pageURL} with valid data`,
        type: "happy-path",
        input: generateValidFormData(form.fields)
      },
      {
        id: `${baseId}-B`,
        description: `Submit form on ${form.pageURL} with all fields empty`,
        type: "boundary",
        input: emptyFormData(fieldNames)
      },
      {
        id: `${baseId}-C`,
        description: `Submit form on ${form.pageURL} with very long strings`,
        type: "boundary",
        input: longStringFormData(fieldNames)
      },
      {
        id: `${baseId}-D`,
        description: `Submit form on ${form.pageURL} with special characters`,
        type: "edge-case",
        input: specialCharFormData(fieldNames)
      },
      {
        id: `${baseId}-E`,
        description: `Submit form on ${form.pageURL} with only required fields filled`,
        type: "edge-case",
        input: requiredOnlyFormData(form.fields)
      }
    ];

    for (const t of testSets) {
      cases.push({
        id: t.id,
        description: t.description,
        type: t.type,
        page: form.pageURL,
        method: "FORM",
        endpoint: form.apiCall || "unknown",
        fields: form.fields,
        submitButton: form.submitButton
      });
      data[t.id] = t.input;
    }

    // Attach baseId to form so buildSpec can filter correctly
    formsWithIds.push({ ...form, baseId });
  }

  return { cases, data, formsWithIds };
}

/**
 * Builds the Playwright spec file content.
 */
function buildSpec(apiCases, allData, formsWithIds, baseURL) {
  const isHashRouting = baseURL.includes("localhost") && !baseURL.includes("toscrape");

  const formTestBlocks = formsWithIds.map((form) => {
    // Only include test cases that belong to this specific form
    const formCases = Object.entries(allData)
      .filter(([id]) => id.startsWith(form.baseId))
      .filter(([, d]) => d !== null);

    return formCases.map(([id, inputData]) => {
      const fillLines = Object.entries(inputData).map(([field, value]) => {
        const fieldDef = form.fields.find((f) => f.name === field);
        const selector = fieldDef?.name
          ? `[name="${fieldDef.name}"]`
          : `#${field}`;
        return `    try { await page.locator('${selector}').first().fill(${JSON.stringify(String(value))}, { timeout: 3000 }); } catch(e) { observations.fillErrors = observations.fillErrors || []; observations.fillErrors.push(e.message); }`;
      }).join("\n");

      const navURL = isHashRouting
        ? `${baseURL}/#${form.pageURL}`
        : `${baseURL}${form.pageURL}`;

      const description = allData[id]
        ? `Form fuzz test on ${form.pageURL}`
        : id;

      return `
test('${id}: ${description}', async ({ page }) => {
  const consoleErrors = [];
  const networkErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));
  page.on('response', res => { if (res.status() >= 400) networkErrors.push({ url: res.url(), status: res.status() }); });

  const observations = {};
  try {
    await page.goto('${navURL}', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    observations.initialURL = page.url();
    observations.initialTitle = await page.title();

${fillLines}

    ${form.submitButton
      ? `try { await page.locator('button:has-text("${form.submitButton}"), input[type="submit"]').first().click({ timeout: 3000 }); } catch(e) { observations.submitError = e.message; }`
      : "// no submit button found"}

    await page.waitForTimeout(1000);
    observations.finalURL = page.url();
    observations.finalTitle = await page.title();

  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  observations.networkErrors = networkErrors;
  record('${id}', '${id}', observations);
});`;
    }).join("\n");
  }).join("\n");

  return `// fuzz.spec.js — Auto-generated fuzz test script
// Tests both API endpoints and form inputs with boundary/edge-case data
import { test } from '@playwright/test';
import fs from 'fs';

const BASE_URL = '${baseURL}';
const RESULTS = [];

function record(id, description, observations) {
  RESULTS.push({ id, description, observations, timestamp: new Date().toISOString() });
}

test.afterAll(() => {
  fs.mkdirSync('tests/generated/fuzz/reports', { recursive: true });
  fs.writeFileSync(
    'tests/generated/fuzz/reports/fuzz_spec_results.json',
    JSON.stringify(RESULTS, null, 2)
  );
});

// ============================================================
// FORM FUZZ TESTS — fills forms with boundary/edge-case inputs
// ============================================================
${formTestBlocks}
`;
}

// ---- Form data generators ----

function generateValidFormData(fields) {
  const data = {};
  for (const field of fields) {
    if (!field.name) continue;
    if (field.name === "id") continue;
    if (field.type === "email" || field.name?.includes("email")) {
      data[field.name] = "fuzz@example.com";
    } else if (field.name?.includes("name")) {
      data[field.name] = "Fuzz Test User";
    } else if (field.type === "number") {
      data[field.name] = "42";
    } else {
      data[field.name] = "fuzz-valid-value";
    }
  }
  return data;
}

function emptyFormData(fieldNames) {
  const data = {};
  for (const name of fieldNames) {
    if (name === "id") continue;
    data[name] = "";
  }
  return data;
}

function longStringFormData(fieldNames) {
  const data = {};
  for (const name of fieldNames) {
    if (name === "id") continue;
    data[name] = "A".repeat(500);
  }
  return data;
}

function specialCharFormData(fieldNames) {
  const data = {};
  for (const name of fieldNames) {
    if (name === "id") continue;
    data[name] = "<script>alert('xss')</script>; DROP TABLE clients;--";
  }
  return data;
}

function requiredOnlyFormData(fields) {
  const data = {};
  for (const field of fields) {
    if (!field.name || field.name === "id") continue;
    if (field.required) {
      data[field.name] = field.type === "email" ? "required@example.com" : "required-value";
    } else {
      data[field.name] = "";
    }
  }
  return data;
}