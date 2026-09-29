// generator/cases.js
import fs from "fs";
import path from "path";

// How many links per page we include (sites with huge navs can have 100+ identical links)
const MAX_LINKS_PER_PAGE = 15;

/**
 * Builds test case definitions purely from crawl data — no LLM needed.
 * Every button, form, error, and API failure observed during crawl becomes a test case.
 */
export function generateTestCases(featureGroups, rawDir, dryRun = false) {
  const allCases = {};
  const counters = {};

  function nextId(prefix) {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `TC-${prefix}-${String(counters[prefix]).padStart(3, "0")}`;
  }

  for (const group of featureGroups) {
    if (dryRun) {
      console.log(`  [dry-run] Would generate cases for: ${group.feature}`);
      allCases[group.feature] = [];
      continue;
    }

    console.log(`  Generating test cases for: ${group.feature}`);
    const pages = gatherPageData(group.pages, rawDir);
    allCases[group.feature] = buildCasesForPages(pages, nextId);
    console.log(`    → ${allCases[group.feature].length} case(s)`);
  }

  return allCases;
}

function gatherPageData(urlPatterns, rawDir) {
  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"));
  const pages = [];
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf-8"));
    const matches = urlPatterns.some((pattern) => {
      const regex = new RegExp("^" + pattern.replace(/:[^/]+/g, "[^/]+") + "$");
      return regex.test(raw.url);
    });
    if (matches) pages.push(raw);
  }
  return pages;
}

function dedupeBySignature(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCasesForPages(pages, nextId) {
  const cases = [];

  for (const page of pages) {
    // 1. Navigation — always record what loads
    cases.push({
      id: nextId("NAV"),
      description: `Load ${page.url} and record page state`,
      type: "happy-path",
      page: page.url,
      action: "navigate and observe",
      dataNeeded: "none",
      observedSelector: null,
      formFields: null,
    });

    // 2. Button click tests — one per unique observed button text
    const buttonTexts = dedupeBySignature(
      page.buttons.map((b) => b.text).filter(Boolean)
    );
    for (const text of buttonTexts) {
      cases.push({
        id: nextId("CLICK"),
        description: `Click "${text}" on ${page.url}`,
        type: "happy-path",
        page: page.url,
        action: `click button "${text}"`,
        dataNeeded: "none",
        observedSelector: text,
        formFields: null,
      });
    }

    // 3. Form tests — happy-path, validation, and two edge cases per unique form
    const forms = dedupeBySignature(
      page.forms.map((f) => ({
        fields: f.fields
          .filter((fld) => fld.name)
          .map((fld) => ({
            name: fld.name,
            type: fld.type || "text",
            required: !!fld.required,
          })),
        submitButton: f.submitButtonText || null,
      }))
    );

    for (const form of forms) {
      if (form.fields.length === 0) continue;

      const fieldNames = form.fields.map((f) => f.name);
      const dataDesc = fieldNames.join(", ");
      const hasRequired = form.fields.some((f) => f.required);

      // Happy path — fill every field with valid data and submit
      cases.push({
        id: nextId("FORM"),
        description: `Submit form on ${page.url} with valid data`,
        type: "happy-path",
        page: page.url,
        action: "fill all fields with valid data and submit",
        dataNeeded: dataDesc,
        observedSelector: form.submitButton,
        formFields: fieldNames,
      });

      // Validation — leave required fields empty
      if (hasRequired) {
        cases.push({
          id: nextId("FORM"),
          description: `Submit form on ${page.url} with empty required fields`,
          type: "validation",
          page: page.url,
          action: "leave all required fields empty and submit",
          dataNeeded: "empty",
          observedSelector: form.submitButton,
          formFields: fieldNames,
        });
      }

      // Edge case — boundary-length strings (256 chars)
      cases.push({
        id: nextId("FORM"),
        description: `Submit form on ${page.url} with 256-char boundary inputs`,
        type: "edge-case",
        page: page.url,
        action: "fill fields with 256-char strings and submit",
        dataNeeded: "long strings",
        observedSelector: form.submitButton,
        formFields: fieldNames,
      });

      // Edge case — special characters (XSS / SQLi probe)
      cases.push({
        id: nextId("FORM"),
        description: `Submit form on ${page.url} with special characters`,
        type: "edge-case",
        page: page.url,
        action: "fill fields with special characters and submit",
        dataNeeded: "special characters",
        observedSelector: form.submitButton,
        formFields: fieldNames,
      });
    }

    // 4. Links — follow unique observed links, record destination
    const links = dedupeBySignature(
      (page.linksTo || [])
        .filter((l) => l.target && l.trigger)
        .map((l) => ({ text: l.trigger, target: l.target }))
        .slice(0, MAX_LINKS_PER_PAGE)
    );
    for (const link of links) {
      cases.push({
        id: nextId("LINK"),
        description: `Follow link "${link.text}" from ${page.url}`,
        type: "happy-path",
        page: page.url,
        action: `click link "${link.text}" and record destination`,
        dataNeeded: "none",
        observedSelector: link.text,
        formFields: null,
        linkTarget: link.target,
      });
    }

    // 5. Error reproduction — if errors were observed during crawl
    const errors = page.errorsObserved || [];
    if (errors.length > 0) {
      cases.push({
        id: nextId("ERR"),
        description: `Observe ${errors.length} error(s) on ${page.url}`,
        type: "error-scenario",
        page: page.url,
        action: "navigate and capture all console and network errors",
        dataNeeded: "none",
        observedSelector: null,
        formFields: null,
      });
    }

    // 6. API error tests — 4xx/5xx observed in network calls
    const apiErrors = dedupeBySignature(
      (page.networkCallsObserved || [])
        .filter((c) => c.status >= 400)
        .map((c) => ({ method: c.method, url: c.url, status: c.status }))
    );
    for (const call of apiErrors) {
      cases.push({
        id: nextId("API"),
        description: `Observe ${call.status} from ${call.method} ${call.url}`,
        type: "error-scenario",
        page: page.url,
        action: `navigate to trigger ${call.method} ${call.url} and record ${call.status} response`,
        dataNeeded: "none",
        observedSelector: null,
        formFields: null,
      });
    }
  }

  return cases;
}
