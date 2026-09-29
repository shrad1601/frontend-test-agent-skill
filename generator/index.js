// generator/index.js
import fs from "fs";
import path from "path";
import { loadEnv } from "../crawler/loadEnv.js";
import { groupPagesIntoFeatures } from "./grouper.js";
import { generateTestCases } from "./cases.js";
import { generateTestData } from "./data.js";
import { generateSpecs } from "./specs.js";
import { getProvider } from "./llm.js";
import config from "../config.js";

loadEnv();

const DRY_RUN = process.argv.includes("--dry-run");
const IMPROVE_MODE = process.argv.includes("--improve");
const RAW_DIR = config.output.rawDir;
const BASE_URL = config.baseURL;

const IMPROVE_SOURCE = (() => {
  const idx = process.argv.indexOf("--source");
  return idx !== -1 ? process.argv[idx + 1] : "runner";
})();

const OUTPUT = {
  cases: "tests/generated/test-cases",
  data: "tests/generated/test-data",
  specs: "tests/generated/specs",
  reports: "tests/generated/reports"
};

async function main() {
  if (IMPROVE_MODE) {
    console.log("\nFrontend Test Agent — Test Improver");
    console.log(`Provider: ${getProvider().toUpperCase()}`);
    console.log(`Source: ${IMPROVE_SOURCE}`);
    console.log("Analysing failures...\n");

    const { improveTests } = await import("./improver.js");
    const { improved, failures } = await improveTests(IMPROVE_SOURCE);

    if (failures === 0) {
      console.log("No failures found to improve.");
    } else {
      console.log(`\nDone. Improved ${improved}/${failures} failing test(s).`);
      console.log("Improved specs: tests/generated/improved/improved.spec.js");
    }

    console.log("\n[improve complete]");
    return;
  }

  console.log(`\nFrontend Test Agent — Generator`);
  console.log(`Provider: ${getProvider().toUpperCase()}`);
  console.log(`Mode: ${DRY_RUN ? "dry-run" : "live"}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Raw data: ${RAW_DIR}\n`);

  if (!fs.existsSync(RAW_DIR)) {
    console.error(`No crawl data found at ${RAW_DIR}. Run "npm run crawl" first.`);
    process.exit(1);
  }

  Object.values(OUTPUT).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

  [OUTPUT.cases, OUTPUT.data, OUTPUT.specs].forEach((dir) => {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach((file) => {
        fs.unlinkSync(path.join(dir, file));
      });
    }
  });
  console.log("Cleared stale output from previous run\n");

  console.log("Step 1 — Grouping pages into features...");
  const featureGroups = await groupPagesIntoFeatures(RAW_DIR, DRY_RUN);
  console.log(`  Found ${featureGroups.length} feature(s): ${featureGroups.map((g) => g.feature).join(", ")}\n`);

  console.log("Step 2 — Generating test cases...");
  const allCases = await generateTestCases(featureGroups, RAW_DIR, DRY_RUN);
  const totalCases = Object.values(allCases).reduce((n, c) => n + c.length, 0);
  console.log(`  Generated ${totalCases} test case(s)\n`);

  for (const [feature, cases] of Object.entries(allCases)) {
    const filename = featureToFilename(feature) + ".cases.json";
    fs.writeFileSync(
      path.join(OUTPUT.cases, filename),
      JSON.stringify({ feature, cases }, null, 2)
    );
  }

  console.log("Step 3 — Generating test data...");
  const allData = generateTestData(allCases, RAW_DIR);
  console.log(`  Generated data for ${Object.keys(allData).length} test case(s)\n`);

  for (const [feature, cases] of Object.entries(allCases)) {
    const featureData = {};
    cases.forEach((tc) => {
      if (allData[tc.id]) featureData[tc.id] = allData[tc.id];
    });
    const filename = featureToFilename(feature) + ".data.json";
    fs.writeFileSync(
      path.join(OUTPUT.data, filename),
      JSON.stringify({ feature, data: featureData }, null, 2)
    );
  }

  console.log("Step 4 — Generating Playwright specs...");
  const allSpecs = await generateSpecs(allCases, allData, RAW_DIR, BASE_URL, DRY_RUN);
  console.log(`  Generated ${Object.keys(allSpecs).length} spec file(s)\n`);

  for (const [feature, spec] of Object.entries(allSpecs)) {
    const filename = featureToFilename(feature) + ".spec.js";
    fs.writeFileSync(path.join(OUTPUT.specs, filename), spec);
  }

  console.log("Generation complete!\n");
  console.log("Output:");
  console.log(`  Test cases : ${OUTPUT.cases}/`);
  console.log(`  Test data  : ${OUTPUT.data}/`);
  console.log(`  Specs      : ${OUTPUT.specs}/`);

  if (DRY_RUN) {
    console.log("\n(dry-run — no API calls were made, files contain placeholders)");
  }
}

function featureToFilename(feature) {
  return feature.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

main().catch((err) => {
  console.error("Generator failed:", err);
  process.exit(1);
});