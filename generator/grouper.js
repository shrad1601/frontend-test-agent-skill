// generator/grouper.js
import fs from "fs";
import path from "path";

/**
 * Groups crawled pages into logical feature buckets by URL prefix.
 * No LLM needed — URL structure already encodes the feature hierarchy.
 */
export function groupPagesIntoFeatures(rawDir, dryRun = false) {
  if (!fs.existsSync(rawDir)) {
    throw new Error(`Raw dir not found: ${rawDir}. Run the crawler first.`);
  }

  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`No raw page files found in ${rawDir}.`);
  }

  const urlToFile = {};
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf-8"));
    urlToFile[raw.url] = raw;
  }

  const groups = {};

  for (const url of Object.keys(urlToFile)) {
    const key = featureKey(url);
    if (!groups[key]) {
      groups[key] = { feature: toFeatureName(key), pages: [], description: `Pages under /${key}` };
    }
    groups[key].pages.push(url);
  }

  return Object.values(groups);
}

function featureKey(url) {
  const segments = url.replace(/^\//, "").split("/").filter(Boolean);
  if (segments.length === 0) return "home";
  // Normalise numeric ID segments — treat /clients/42 same as /clients/:id
  const first = segments[0].replace(/^\d+$/, ":id");
  return first;
}

function toFeatureName(key) {
  if (key === "home") return "Home";
  return key
    .replace(/[-_]/g, " ")
    .replace(/:id$/, "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "Home";
}
