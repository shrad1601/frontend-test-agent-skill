// generator/cases.js
import fs from "fs";
import path from "path";
import { llmCall } from "./llm.js";
import { loadEnv } from "../crawler/loadEnv.js";

loadEnv();

export async function generateTestCases(featureGroups, rawDir, dryRun = false) {
  const allCases = {};

  for (const group of featureGroups) {
    console.log(`  Generating test cases for: ${group.feature}`);

    const pages = gatherPageData(group.pages, rawDir);
    const prompt = buildPrompt(group, pages);

    if (dryRun) {
      console.log(`--- CASES PROMPT: ${group.feature} ---`);
      console.log(prompt);
      console.log(`--- END CASES PROMPT ---\n`);
      allCases[group.feature] = [];
      continue;
    }

    try {
      const text = await llmCall(prompt, { maxTokens: 3000 });
      const cases = safeJsonParse(text);
      if (!Array.isArray(cases)) throw new Error(`Unexpected response: ${text}`);
      allCases[group.feature] = cases;
    } catch (err) {
      console.error(`  Failed for ${group.feature}: ${err.message}`);
      allCases[group.feature] = [];
    }
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

// Caps how much per-page detail is shipped to the LLM. Sites with many
// pages that repeat the same widget (e.g. an "Add to basket" form on every
// product card) can otherwise balloon a single feature's prompt past the
// model's context window once dozens of pages are grouped together.
const MAX_LINKS_PER_PAGE = 15;

function dedupeBySignature(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique;
}

function buildPrompt(group, pages) {
  // Build a clean inventory of ONLY what was actually observed
  const pageInventory = pages.map((p) => {
    const links = p.linksTo.map((l) => ({
      text: l.trigger,
      target: l.target
    }));
    const uniqueLinks = dedupeBySignature(links);
    const truncatedLinkCount = uniqueLinks.length - MAX_LINKS_PER_PAGE;

    return {
      url: p.url,
      title: p.title,
      // Only real observed buttons with text (deduped — repeated identical
      // buttons on one page, e.g. multiple "Add to basket" widgets, add no
      // new information)
      buttonsObserved: dedupeBySignature(p.buttons.map((b) => b.text).filter(Boolean)),
      // Only real observed forms with actual field names (deduped by shape)
      formsObserved: dedupeBySignature(
        p.forms.map((f) => ({
          fields: f.fields.map((field) => ({
            name: field.name,
            label: field.label,
            type: field.type,
            required: field.required
          })),
          submitButton: f.submitButtonText
        }))
      ),
      // Only real observed links, deduped and capped per page
      linksObserved: truncatedLinkCount > 0
        ? [...uniqueLinks.slice(0, MAX_LINKS_PER_PAGE), `...and ${truncatedLinkCount} more link(s) observed`]
        : uniqueLinks,
      // Only real observed tables
      tablesObserved: p.tables.map((t) => ({
        columns: t.columns,
        rowCount: t.rowCount
      })),
      // Real API calls observed
      apiCallsObserved: p.networkCallsObserved.map((c) => ({
        method: c.method,
        url: c.url,
        status: c.status
      })),
      // Real errors observed during crawl
      errorsObserved: p.errorsObserved.map((e) => ({
        type: e.type,
        message: e.message.slice(0, 200)
      }))
    };
  });

  return `You are generating characterization test cases for the "${group.feature}" feature.

## CRITICAL RULE — NO HALLUCINATION

You must ONLY generate tests for things that were ACTUALLY OBSERVED during crawling.

DO NOT invent:
- Buttons that weren't observed (e.g. "Add to basket" if not in buttonsObserved)
- Forms that weren't observed
- API endpoints that weren't observed
- UI states that weren't observed
- Selectors that aren't in the crawl data

If a button or form doesn't appear in the observed data, do NOT test it.

## WHAT WAS ACTUALLY OBSERVED:
${JSON.stringify(pageInventory, null, 2)}

## TEST TYPES TO GENERATE (only from observed data):

1. **Navigation tests** — visit each observed URL, record what loads (title, URL, errors)
2. **Form tests** — only if forms were observed: submit with valid data, empty required fields
3. **Button tests** — only if buttons were observed: click each observed button, record what happens
4. **Error tests** — if errors were observed during crawl (console errors, 500s etc): reproduce and record
5. **Link tests** — follow observed links, record where they go

## OUTPUT FORMAT:
Respond with ONLY a JSON array (no markdown fences) where each item has:
- "id": e.g. "TC-CLIENT-001"
- "description": one sentence describing what is being tested
- "type": "happy-path" | "validation" | "edge-case" | "error-scenario"
- "page": the URL this test runs on
- "action": exactly what the test does
- "dataNeeded": what input data is needed or "none"
- "observedSelector": the actual CSS selector or button text from the crawl data that this test uses (or null if just navigating)
  ## LIMIT: Generate a maximum of 10 test cases. Prioritize the most interesting/varied ones.`;
}

function safeJsonParse(text) {
  if (!text) return null;
  // Strip any kind of code fences
  let cleaned = text
    .trim()
    .replace(/^```[\w]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
  
  // Find the JSON array start
  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd !== -1) {
    cleaned = cleaned.slice(arrayStart, arrayEnd + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}