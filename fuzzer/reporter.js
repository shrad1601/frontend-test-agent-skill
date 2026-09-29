// fuzzer/reporter.js
import fs from "fs";
import { loadEnv } from "../crawler/loadEnv.js";
import { llmCall } from "../generator/llm.js";

loadEnv();

const REPORT_FILE = "tests/generated/fuzz/reports/fuzz_report.md";
const FORM_REPORT_FILE = "tests/generated/fuzz/reports/fuzz_form_report.md";

export async function generateFuzzReport(results) {
  const total = results.length;
  const anomalies = results.filter((r) => r.anomaly);
  const crashes = results.filter((r) => r.statusCode >= 500);
  const timeouts = results.filter((r) => r.anomalyType?.includes("timed out"));
  const leaks = results.filter((r) => r.anomalyType?.includes("Stack trace"));

  const byEndpoint = {};
  for (const r of results) {
    const key = `${r.method} ${r.endpoint}`;
    if (!byEndpoint[key]) byEndpoint[key] = [];
    byEndpoint[key].push(r);
  }

  let analysis = "[analysis not generated]";
  if (anomalies.length > 0) {
    try {
      analysis = await llmCall(buildAnalysisPrompt(anomalies, byEndpoint), { maxTokens: 2000 });
    } catch (err) {
      analysis = `[analysis failed: ${err.message}]`;
    }
  }

  const report = `# API Fuzz Test Report
Generated: ${new Date().toLocaleString()}

## Summary
| Metric | Count |
|--------|-------|
| Total Fuzz Tests | ${total} |
| Anomalies Found | ${anomalies.length} |
| Server Crashes (5xx) | ${crashes.length} |
| Timeouts | ${timeouts.length} |
| Stack Trace Leaks | ${leaks.length} |

---

## 🔴 Anomalies Found (${anomalies.length})
${anomalies.length === 0 ? "_None_" : anomalies.map((r) => `
### ${r.id} — ${r.description}
- **Method:** ${r.method}
- **Endpoint:** ${r.endpoint}
- **Input:** \`${JSON.stringify(r.input)}\`
- **Status:** ${r.statusCode || "no response"}
- **Anomaly:** ${r.anomalyType}
- **Response:** ${r.responseBody || "none"}
- **Response Time:** ${r.responseTime}ms
`).join("\n")}

---

## 📊 Endpoint Summary
${Object.entries(byEndpoint).map(([endpoint, tests]) => {
  const statuses = [...new Set(tests.map((t) => t.statusCode).filter(Boolean))];
  const hasAnomaly = tests.some((t) => t.anomaly);
  return `### ${endpoint} ${hasAnomaly ? "⚠" : "✓"}
- Status codes observed: ${statuses.join(", ")}
- Tests run: ${tests.length}
- Anomalies: ${tests.filter((t) => t.anomaly).length}`;
}).join("\n\n")}

---

## 🤖 AI Analysis
${analysis}

---

## ✅ Clean Results
${results.filter((r) => !r.anomaly).map((r) => `- ${r.id}: ${r.description} → ${r.statusCode}`).join("\n")}
`;

  fs.writeFileSync(REPORT_FILE, report);
  console.log(`  Fuzz report saved to ${REPORT_FILE}`);
  return report;
}

export async function generateFormFuzzReport(results) {
  const total = results.length;
  const anomalies = results.filter((r) => r.anomaly);
  const timeouts = results.filter((r) => r.anomalyType?.includes("timed out"));
  const crashes = results.filter((r) => r.anomalyType?.includes("5xx"));
  const leaks = results.filter((r) => r.anomalyType?.includes("Stack trace"));

  // Group by page
  const byPage = {};
  for (const r of results) {
    const key = r.description?.match(/on (\/[^\s]+)/)?.[1] || "unknown";
    if (!byPage[key]) byPage[key] = [];
    byPage[key].push(r);
  }

  let analysis = "[analysis not generated]";
  if (anomalies.length > 0) {
    try {
      analysis = await llmCall(buildFormAnalysisPrompt(anomalies, byPage), { maxTokens: 2000 });
    } catch (err) {
      analysis = `[analysis failed: ${err.message}]`;
    }
  }

  const report = `# Frontend Form Fuzz Test Report
Generated: ${new Date().toLocaleString()}

## Summary
| Metric | Count |
|--------|-------|
| Total Form Fuzz Tests | ${total} |
| Anomalies Found | ${anomalies.length} |
| Timeouts (page failed to load) | ${timeouts.length} |
| Server Crashes (5xx) | ${crashes.length} |
| Stack Trace Leaks | ${leaks.length} |

---

## 🔴 Anomalies Found (${anomalies.length})
${anomalies.length === 0 ? "_None_" : anomalies.map((r) => `
### ${r.id} — ${r.description}
- **Anomaly:** ${r.anomalyType}
- **Error:** ${r.errorMessage || "none"}
- **Final URL:** ${r.postSubmission?.finalURL || "unknown"}
- **Status codes observed:** ${r.postSubmission?.statusCodesObserved?.join(", ") || "none"}
- **Duration:** ${r.durationMs}ms
`).join("\n")}

---

## 📊 Page Summary
${Object.entries(byPage).map(([page, tests]) => {
  const hasAnomaly = tests.some((t) => t.anomaly);
  return `### ${page} ${hasAnomaly ? "⚠" : "✓"}
- Tests run: ${tests.length}
- Anomalies: ${tests.filter((t) => t.anomaly).length}
- Anomaly types: ${[...new Set(tests.filter((t) => t.anomaly).map((t) => t.anomalyType))].join(", ") || "none"}`;
}).join("\n\n")}

---

## 🤖 AI Analysis
${analysis}

---

## ✅ Clean Results
${results.filter((r) => !r.anomaly).map((r) => `- ${r.id}: ${r.description} → ${r.postSubmission?.finalURL || r.status}`).join("\n")}
`;

  fs.writeFileSync(FORM_REPORT_FILE, report);
  console.log(`  Form fuzz report saved to ${FORM_REPORT_FILE}`);
  return report;
}

function buildAnalysisPrompt(anomalies, byEndpoint) {
  return `You are analyzing API fuzz test results for a web application.

This is characterization testing — we are observing actual API behavior under various inputs, not asserting correctness.

## ANOMALIES FOUND:
${JSON.stringify(anomalies.map((r) => ({
    id: r.id,
    description: r.description,
    method: r.method,
    endpoint: r.endpoint,
    input: r.input,
    statusCode: r.statusCode,
    anomalyType: r.anomalyType,
    responseBody: r.responseBody
  })), null, 2)}

## ENDPOINT BEHAVIOR SUMMARY:
${JSON.stringify(Object.entries(byEndpoint).map(([endpoint, tests]) => ({
    endpoint,
    statusCodesObserved: [...new Set(tests.map((t) => t.statusCode))],
    anomalyCount: tests.filter((t) => t.anomaly).length
  })), null, 2)}

For your analysis:
1. Group anomalies by root cause
2. Note any inconsistent behavior (same endpoint returns different status codes for similar inputs)
3. Flag any security concerns (stack traces leaked, injection not handled etc.)
4. Assign severity: High (500s/crashes), Medium (inconsistent behavior), Low (slow responses)

Write a clear markdown analysis.`;
}

function buildFormAnalysisPrompt(anomalies, byPage) {
  return `You are analyzing frontend form fuzz test results for a web application.

This is characterization testing — we are observing actual browser + server behavior when forms are submitted with boundary/malicious inputs.

## ANOMALIES FOUND:
${JSON.stringify(anomalies.map((r) => ({
    id: r.id,
    description: r.description,
    anomalyType: r.anomalyType,
    errorMessage: r.errorMessage,
    finalURL: r.postSubmission?.finalURL,
    statusCodesObserved: r.postSubmission?.statusCodesObserved,
    consoleErrors: r.consoleErrors,
    durationMs: r.durationMs
  })), null, 2)}

## PAGE BEHAVIOR SUMMARY:
${JSON.stringify(Object.entries(byPage).map(([page, tests]) => ({
    page,
    totalTests: tests.length,
    anomalyCount: tests.filter((t) => t.anomaly).length,
    anomalyTypes: [...new Set(tests.filter((t) => t.anomaly).map((t) => t.anomalyType))]
  })), null, 2)}

For your analysis:
1. Group anomalies by root cause (e.g. page fails to load vs server error vs JS crash)
2. Distinguish between "page never loaded" (backend bug) vs "form submission failed" (validation/handling bug)
3. Flag security concerns (XSS not escaped, SQL errors leaked, stack traces in response)
4. Assign severity: High (server crashes, data leaks), Medium (unhandled errors, broken pages), Low (slow responses, minor UI issues)

Write a clear markdown analysis.`;
}