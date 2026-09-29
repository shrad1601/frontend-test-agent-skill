// fuzzer/runner.js
import fs from "fs";
import path from "path";
import { loadEnv } from "../crawler/loadEnv.js";
import config from "../config.js";

loadEnv();

const FUZZ_RESULTS_FILE = "tests/generated/fuzz/reports/fuzz_results.json";
const REQUEST_TIMEOUT = 10000;

/**
 * Runs all fuzz test cases by sending HTTP requests directly.
 * No browser needed — pure fetch-based API testing.
 */
export async function runFuzzTests(cases, data) {
  const baseURL = config.baseURL
    .replace("/#", "")
    .replace(/\/$/, "");

  const apiBase = baseURL.includes("localhost:5173")
    ? baseURL.replace("localhost:5173", "localhost:8080")
    : baseURL.replace(/\/#.*$/, "");

  const normalizedBase = apiBase.startsWith("http") ? apiBase : `https://${apiBase}`;

  console.log(`  API base: ${normalizedBase}`);

  const results = [];

  for (const tc of cases) {
    const result = await runSingleFuzzTest(tc, data[tc.id], normalizedBase);
    results.push(result);

    const icon = result.anomaly ? "⚠" : "✓";
    console.log(`  ${icon} ${result.id} — ${result.statusCode || "no response"} ${result.anomaly ? `[${result.anomalyType}]` : ""}`);
  }

  return results;
}

async function runSingleFuzzTest(tc, input, apiBase) {
  const startTime = Date.now();
  let statusCode = null;
  let responseBody = null;
  let responseTime = null;
  let error = null;
  let anomaly = false;
  let anomalyType = null;

  try {
    // Build the URL
    let url;
    if (input?.url) {
      // Input has an explicit URL (GET/DELETE with ID variations)
      const inputPath = input.url.startsWith("http") ? input.url : `${apiBase}${input.url}`;
      url = inputPath;
    } else if (tc.endpoint.includes(":id") && tc.exampleURL) {
      // PUT/POST mutation on an :id endpoint — use the observed example URL to preserve the real ID
      url = tc.exampleURL.startsWith("http") ? tc.exampleURL : `${apiBase}${tc.exampleURL}`;
    } else {
      // POST to a collection endpoint (no :id)
      url = `${apiBase}${tc.endpoint.replace("/:id", "")}`;
    }

    const options = {
      method: tc.method,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    };

    // Add body for POST/PUT
    if (tc.method === "POST" || tc.method === "PUT") {
      options.body = JSON.stringify(input || {});
    }

    const response = await fetch(url, options);
    statusCode = response.status;
    responseTime = Date.now() - startTime;

    try {
      const text = await response.text();
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = text.slice(0, 500);
      }
    } catch {
      responseBody = "[could not read response]";
    }

    // Detect anomalies
    if (statusCode >= 500) {
      anomaly = true;
      anomalyType = `HTTP ${statusCode} — server crash`;
    } else if (responseTime > 5000) {
      anomaly = true;
      anomalyType = `Slow response: ${responseTime}ms`;
    } else if (
      typeof responseBody === "string" &&
      (responseBody.includes("Exception") ||
        responseBody.includes("stack trace") ||
        responseBody.includes("at com.") ||
        responseBody.includes("at org."))
    ) {
      anomaly = true;
      anomalyType = "Stack trace leaked in response";
    }

  } catch (err) {
    error = err.message;
    responseTime = Date.now() - startTime;
    anomaly = true;
    anomalyType = err.name === "TimeoutError" ? "Request timed out" : `Request failed: ${err.message}`;
  }

  return {
    id: tc.id,
    description: tc.description,
    method: tc.method,
    endpoint: tc.endpoint,
    type: tc.type,
    input: input || null,
    statusCode,
    responseBody: typeof responseBody === "object"
      ? JSON.stringify(responseBody).slice(0, 300)
      : (responseBody || "").slice(0, 300),
    responseTime,
    anomaly,
    anomalyType,
    error,
    timestamp: new Date().toISOString()
  };
}