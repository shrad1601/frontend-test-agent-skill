// generator/grouper.js
import fs from "fs";
import path from "path";
import { llmCall } from "./llm.js";
import { loadEnv } from "../crawler/loadEnv.js";

loadEnv();

/**
 * Reads all raw page JSON files and asks the LLM to group them
 * into logical features (e.g. "Client CRUD", "Auth", "Dashboard").
 */
export async function groupPagesIntoFeatures(rawDir, dryRun = false) {
  if (!fs.existsSync(rawDir)) {
    throw new Error(`Raw dir not found: ${rawDir}. Run the crawler first.`);
  }

  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`No raw page files found in ${rawDir}.`);
  }

  const pageSummaries = files.map((file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf-8"));
    return {
      url: raw.url,
      title: raw.title,
      hasForms: raw.forms.length > 0,
      formFields: raw.forms.flatMap((f) => f.fields.map((field) => field.name)),
      buttons: raw.buttons.map((b) => b.text),
      apiCalls: raw.networkCallsObserved.map((c) => `${c.method} ${c.url}`),
      errorsObserved: raw.errorsObserved.length
    };
  });

  const prompt = buildPrompt(pageSummaries);

  if (dryRun) {
    console.log("--- GROUPER PROMPT ---");
    console.log(prompt);
    console.log("--- END GROUPER PROMPT ---\n");
    return [
      {
        feature: "dry-run",
        pages: pageSummaries.map((p) => p.url),
        description: "[dry-run - not generated]"
      }
    ];
  }

  const text = await llmCall(prompt, { maxTokens: 4000 });
  const groups = safeJsonParse(text);

  if (!Array.isArray(groups)) {
    throw new Error(`LLM returned unexpected grouper output: ${text}`);
  }

  return groups;
}

function buildPrompt(pageSummaries) {
  return `You are analyzing the pages of a web application to group them into logical features for test generation.

PAGE SUMMARIES:
${JSON.stringify(pageSummaries, null, 2)}

Group these pages into logical features. A feature is a set of pages that work together to support one area of functionality (e.g. "Client CRUD", "Authentication", "Dashboard").

Rules:
- Base grouping ONLY on the data provided, do not invent features not supported by the pages
- A page can only belong to one feature
- Route parameters like /clients/:id should be represented as the pattern, not the specific ID
- For simple apps, one feature group is fine

Respond with ONLY a JSON array (no markdown fences, no extra text) where each item has:
- "feature": short name e.g. "Client CRUD"
- "pages": array of URL patterns belonging to this feature
- "description": one sentence describing what this feature does`;
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