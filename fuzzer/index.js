// fuzzer/index.js
import fs from "fs";
import path from "path";
import { loadEnv } from "../crawler/loadEnv.js";
import { extractEndpoints } from "./extract.js";
import { generateFuzzInputs } from "./inputs.js";
import { runFuzzTests } from "./runner.js";
import { generateFuzzReport } from "./reporter.js";
import config from "../config.js";

loadEnv();

const RAW_DIR = config.output.rawDir;

const OUTPUT = {
  cases: "tests/generated/fuzz/test-cases",
  data: "tests/generated/fuzz/test-data",
  reports: "tests/generated/fuzz/reports"
};

async function main() {
  console.log("\n🔥 Frontend Test Agent — Fuzzer");
  console.log(`Base URL: ${config.baseURL}\n`);

  // Create output directories
  Object.values(OUTPUT).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

  // Clear stale output — files only, not subdirectories
  Object.values(OUTPUT).forEach((dir) => {
    fs.readdirSync(dir).forEach((file) => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isFile()) {
        fs.unlinkSync(fullPath);
      }
    });
  });
  console.log("Cleared stale output from previous run\n");

  // Step 1 — Extract endpoints
  console.log("Step 1 — Extracting endpoints from crawl data...");
  const endpoints = extractEndpoints(RAW_DIR);

  if (endpoints.length === 0) {
    console.error("No endpoints found or inferred. Cannot proceed.");
    process.exit(1);
  }

  // Step 2 — Generate API fuzz inputs
  console.log("\nStep 2 — Generating fuzz test cases...");
  const { cases, data } = generateFuzzInputs(endpoints);
  console.log(`  Generated ${cases.length} API fuzz test case(s)`);

  // Save cases and data
  fs.writeFileSync(
    `${OUTPUT.cases}/fuzz.cases.json`,
    JSON.stringify({ feature: "API Fuzz", cases }, null, 2)
  );
  fs.writeFileSync(
    `${OUTPUT.data}/fuzz.data.json`,
    JSON.stringify({ feature: "API Fuzz", data }, null, 2)
  );

  // Step 3 — Run API fuzz tests
  console.log("\nStep 3 — Running API fuzz tests...");
  const results = await runFuzzTests(cases, data);

  const anomalies = results.filter((r) => r.anomaly);
  console.log(`\n  ${results.length} API tests run, ${anomalies.length} anomalies found`);

  // Save results
  fs.writeFileSync(
    `${OUTPUT.reports}/fuzz_results.json`,
    JSON.stringify(results, null, 2)
  );

  // Step 4 — Generate report
  console.log("\nStep 4 — Generating fuzz report...");
  await generateFuzzReport(results);

  console.log("\n✓ Fuzzing complete!");
  console.log(`  Cases    : ${OUTPUT.cases}/fuzz.cases.json`);
  console.log(`  Data     : ${OUTPUT.data}/fuzz.data.json`);
  console.log(`  Results  : ${OUTPUT.reports}/fuzz_results.json`);
  console.log(`  Report   : ${OUTPUT.reports}/fuzz_report.md`);
}

main().catch((err) => {
  console.error("Fuzzer failed:", err);
  process.exit(1);
});