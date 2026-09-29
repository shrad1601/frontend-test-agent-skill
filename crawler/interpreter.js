// crawler/interpreter.js
import fs from "fs";
import path from "path";
import { llmCall } from "../generator/llm.js";
import { loadEnv } from "./loadEnv.js";
import config from "../config.js";

loadEnv();

const DRY_RUN = process.argv.includes("--dry-run");
const SITE_MAP_FILE = "tests/generated/site-maps/site_map.json";

const { output, baseURL } = config;

async function main() {
  const rawDir = output.rawDir;

  if (!fs.existsSync(rawDir)) {
    console.error(`No raw crawl data found at ${rawDir}. Run "npm run crawl" first.`);
    process.exit(1);
  }

  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error(`No raw page files found in ${rawDir}.`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("=== DRY RUN MODE - no API calls will be made ===\n");
  }

  // ---- Per-page interpretation ----
  const pages = [];

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf-8"));
    console.log(`Interpreting ${raw.url} ...`);

    const prompt = buildPagePrompt(raw);

    if (DRY_RUN) {
      printPrompt(`PAGE PROMPT: ${raw.url}`, prompt);
      pages.push({
        ...raw,
        inferredPurpose: null,
        confidence: null,
        testingNotes: "[dry-run - not generated]"
      });
      continue;
    }

    try {
      const text = await llmCall(prompt, { maxTokens: 500 });
      const parsed = safeJsonParse(text);
      pages.push({
        ...raw,
        inferredPurpose: parsed?.inferredPurpose ?? null,
        confidence: parsed?.confidence ?? null,
        testingNotes: parsed?.testingNotes ?? null
      });
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
      pages.push({
        ...raw,
        inferredPurpose: null,
        confidence: null,
        testingNotes: `[interpretation failed: ${err.message}]`
      });
    }
  }

  // ---- Workflow inference ----
  let workflows = [];
  const workflowPrompt = buildWorkflowPrompt(pages);

  if (DRY_RUN) {
    printPrompt("WORKFLOW PROMPT", workflowPrompt);
  } else {
    console.log("Inferring workflows ...");
    try {
      const text = await llmCall(workflowPrompt, { maxTokens: 1000 });
      workflows = safeJsonParse(text) ?? [];
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
    }
  }

  // ---- Write site_map.json ----
  const siteMap = {
    baseURL,
    crawlDate: new Date().toISOString(),
    dryRun: DRY_RUN,
    pages,
    workflows
  };

  fs.mkdirSync(path.dirname(SITE_MAP_FILE), { recursive: true });
  fs.writeFileSync(SITE_MAP_FILE, JSON.stringify(siteMap, null, 2));

  console.log(`\nDone. Wrote ${SITE_MAP_FILE}`);
  if (DRY_RUN) {
    console.log("(dry run - pages have placeholder values, no API calls were made)");
  }
}

function buildPagePrompt(raw) {
  return `You are analyzing one page of a web application, captured by an automated crawler. Your job is characterization testing: describe what this page currently does, based ONLY on the facts provided below. Do not invent forms, buttons, or behavior that isn't present in the data.

PAGE FACTS:
${JSON.stringify(raw, null, 2)}

Respond with ONLY a JSON object (no markdown fences, no extra text) with exactly these keys:
- "inferredPurpose": one sentence describing what this page is for. Use null if you cannot tell from the data.
- "confidence": a number from 0 to 1 indicating how confident you are in inferredPurpose.
- "testingNotes": a short sentence suggesting what's worth testing on this page for characterization testing (capturing current behavior, including edge cases and potential inconsistencies - not whether it's "correct").`;
}

function buildWorkflowPrompt(pages) {
  const summary = pages.map((p) => ({
    url: p.url,
    inferredPurpose: p.inferredPurpose,
    linksTo: p.linksTo,
    forms: p.forms.map((f) => ({
      fields: f.fields.map((field) => field.name),
      submitButtonText: f.submitButtonText
    })),
    buttons: p.buttons.map((b) => b.text)
  }));

  return `You are analyzing the navigation structure of a web application, captured by an automated crawler. Below is a summary of each page: its URL, inferred purpose, links to other pages, forms, and buttons.

Based ONLY on this information, identify the main user workflows (e.g. "Create Client", "Edit Client", "Delete Client"). Do not invent steps not supported by the data.

PAGE SUMMARIES:
${JSON.stringify(summary, null, 2)}

Respond with ONLY a JSON array (no markdown fences, no extra text) where each item has exactly these keys:
- "name": short name for the workflow, e.g. "Create Client"
- "steps": array of short strings describing the sequence of pages/actions, e.g. ["/ - click '+ Add Client'", "/clients/new - fill form and click 'Save'"]`;
}

function safeJsonParse(text) {
  if (!text) return null;
  let cleaned = text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function printPrompt(label, prompt) {
  console.log(`--- ${label} ---`);
  console.log(prompt);
  console.log(`--- END ${label} ---\n`);
}

main().catch((err) => {
  console.error("Interpreter failed:", err);
  process.exit(1);
});