// runner/reporter.js
import fs from "fs";
import { loadEnv } from "../crawler/loadEnv.js";
import { llmCall } from "../generator/llm.js";

loadEnv();

const RESULTS_FILE = "tests/generated/reports/results.json";
const REPORT_FILE = "tests/generated/reports/bug_report.md";
const IMPROVED_RESULTS_FILE = "tests/generated/improved/improved_run_results.json";
const IMPROVED_REPORT_FILE = "tests/generated/improved/improved_report.md";

export async function generateReport(dryRun = false) {
  if (!fs.existsSync(RESULTS_FILE)) {
    throw new Error(`No results found at ${RESULTS_FILE}. Run the tests first.`);
  }
  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
  return buildReport(results, dryRun, REPORT_FILE, "Characterization Test Report", []);
}

export async function generateImprovedReport(dryRun = false) {
  if (!fs.existsSync(IMPROVED_RESULTS_FILE)) {
    throw new Error(`No improved results found at ${IMPROVED_RESULTS_FILE}. Run improved tests first.`);
  }
  const results = JSON.parse(fs.readFileSync(IMPROVED_RESULTS_FILE, "utf-8"));
  const metaFile = "tests/generated/improved/improved_meta.json";
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf-8")) : [];
  return buildReport(results, dryRun, IMPROVED_REPORT_FILE, "Improved Test Run Report", meta);
}

async function buildReport(results, dryRun, reportFile, title, meta = []) {
  const total = results.length;
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const errored = results.filter((r) => r.status === "error").length;

  const hardErrors = results.filter(
    (r) => r.status === "error" || r.networkErrors?.some((e) => e.status >= 500)
  );
  const failures = results.filter((r) => r.status === "failed");
  const withConsoleErrors = results.filter((r) => r.consoleErrors?.length > 0);

  let analysis = "[analysis not generated]";

  if (!dryRun && (hardErrors.length > 0 || failures.length > 0 || withConsoleErrors.length > 0)) {
    const prompt = meta.length > 0
      ? buildImprovedAnalysisPrompt(results, hardErrors, withConsoleErrors, meta)
      : buildAnalysisPrompt(results, hardErrors, withConsoleErrors);
    try {
      analysis = await llmCall(prompt, { maxTokens: 2000 });
    } catch (err) {
      analysis = `[analysis failed: ${err.message}]`;
    }
  }

  const metaSection = meta.length > 0 ? `
## Improvement Map
| Original Test | Improved Test | Error Category | Source |
|---|---|---|---|
${meta.map((m) => `| ${m.originalId} | ${m.improvedId} | ${m.errorCategory} | ${m.source} |`).join("\n")}

---
` : "";

  const report = `# ${title}
Generated: ${new Date().toLocaleString()}

## Summary
| Metric | Count |
|--------|-------|
| Total Tests | ${total} |
| Passed | ${passed} |
| Failed | ${failed} |
| Errored/Timed Out | ${errored} |
| With Console Errors | ${withConsoleErrors.length} |

---
${metaSection}
## Hard Errors (${hardErrors.length})
${hardErrors.length === 0 ? "_None_" : hardErrors.map((r) => `
### ${r.id} — ${r.description}
- **Status:** ${r.status}
- **Error:** ${r.errorMessage || "none"}
- **Network Errors:** ${r.networkErrors?.map((e) => `${e.status} ${e.url}`).join(", ") || "none"}
- **Console Errors:** ${r.consoleErrors?.join("; ") || "none"}
${r.screenshotPath ? `- **Screenshot:** ${r.screenshotPath}` : ""}
`).join("\n")}

---

## Failed Tests (${failures.length})
${failures.length === 0 ? "_None_" : failures.map((r) => `
### ${r.id} — ${r.description}
- **Error:** ${r.errorMessage || "none"}
- **Console Errors:** ${r.consoleErrors?.join("; ") || "none"}
- **Observations:** ${JSON.stringify(r.observations?.slice(0, 2) || []).slice(0, 300)}
${r.screenshotPath ? `- **Screenshot:** ${r.screenshotPath}` : ""}
`).join("\n")}

---

## AI Analysis
${analysis}

---

## Passed Tests (${passed})
${results.filter((r) => r.status === "passed").map((r) => `- ${r.id}: ${r.description}`).join("\n")}
`;

  fs.writeFileSync(reportFile, report);
  console.log(`\nReport saved to ${reportFile}`);
  return report;
}

function buildAnalysisPrompt(results, hardErrors, withConsoleErrors) {
  const allFindings = results.map((r) => ({
    id: r.id,
    description: r.description,
    status: r.status,
    errorMessage: r.errorMessage,
    networkErrors: r.networkErrors,
    consoleErrors: r.consoleErrors?.slice(0, 3)
  }));

  return `You are analyzing characterization test results for a web application.

IMPORTANT: This is characterization testing. "Passed" means the test COMPLETED, not that the app is working correctly. You must analyze ALL observations including network errors and console errors from passed tests.

## ALL TEST RESULTS:
${JSON.stringify(allFindings, null, 2)}

## HARD ERRORS FOUND (tests that observed 500 responses):
${JSON.stringify(hardErrors.map((r) => ({
    id: r.id,
    description: r.description,
    networkErrors: r.networkErrors
  })), null, 2)}

## TESTS WITH CONSOLE ERRORS:
${JSON.stringify(withConsoleErrors.map((r) => ({
    id: r.id,
    description: r.description,
    consoleErrors: r.consoleErrors?.slice(0, 2)
  })), null, 2)}

For your analysis:
1. Group related findings by root cause (e.g. all 500s on /api/clients/:id are the same bug)
2. Write a plain-English hypothesis for each bug
3. Assign severity: High (500 errors/crashes), Medium (wrong behavior), Low (minor issues)
4. IMPORTANT: A test STATUS of "passed" does NOT mean the app is working — check network errors and console errors carefully

Write a clear markdown analysis. Be specific about which endpoints are broken and what the likely cause is.`;
}

function buildImprovedAnalysisPrompt(results, hardErrors, withConsoleErrors, meta) {
  const allFindings = results.map((r) => {
    const metaEntry = meta.find((m) => m.improvedId === r.id);
    return {
      id: r.id,
      originalId: metaEntry?.originalId,
      errorCategory: metaEntry?.errorCategory,
      source: metaEntry?.source,
      description: r.description,
      status: r.status,
      errorMessage: r.errorMessage,
      networkErrors: r.networkErrors,
      consoleErrors: r.consoleErrors?.slice(0, 3),
      observations: r.observations?.slice(0, 2)
    };
  });

  return `You are analyzing IMPROVED characterization test results for a web application.

These tests were automatically generated to better characterize failures found in the original test run. Each improved test targets a specific failure mode from the original run.

IMPORTANT: This is characterization testing. "Passed" means the test COMPLETED, not that the app is working correctly.

## IMPROVED TEST RESULTS (with original test mapping):
${JSON.stringify(allFindings, null, 2)}

## HARD ERRORS:
${JSON.stringify(hardErrors.map((r) => ({
    id: r.id,
    originalId: meta.find((m) => m.improvedId === r.id)?.originalId,
    description: r.description,
    networkErrors: r.networkErrors,
    observations: r.observations?.slice(0, 1)
  })), null, 2)}

For your analysis:
1. Compare what the improved tests discovered vs what the originals found — did they surface more detail?
2. Group findings by root cause
3. For each bug, summarize what the improved test revealed that the original did not
4. Assign severity: High (500 errors/crashes), Medium (wrong behavior), Low (minor issues)
5. Highlight any new findings the improved tests uncovered that were not in the original run

Write a clear markdown analysis. Be specific about endpoints, error patterns, and what the improved tests added.`;
}