// fuzzer/extract.js
import fs from "fs";
import path from "path";
import config from "../config.js";

export function extractEndpoints(rawDir) {
  if (!fs.existsSync(rawDir) || fs.readdirSync(rawDir).filter(f => f.endsWith(".json")).length === 0) {
    console.log("  No crawl data found — using common REST API endpoint patterns");
    return inferEndpointsFromBaseURL(config.baseURL);
  }

  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"));

  // --- Strategy 1: observed XHR/fetch calls ---
  const seen = new Set();
  const apiEndpoints = [];

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf-8"));

    for (const call of raw.networkCallsObserved || []) {
      const normalizedEndpoint = call.url.replace(/\/\d+/g, "/:id");
      const key = `${call.method}:${normalizedEndpoint}`;
      if (seen.has(key)) continue;
      seen.add(key);

      apiEndpoints.push({
        method: call.method,
        endpoint: normalizedEndpoint,
        exampleURL: call.url,
        sampleRequest: call.requestBody || null,
        // For PUT endpoints, also try to get the request body from the observed call
        sampleResponse: call.responseBody || null,
        statusObserved: call.status,
        inferred: false,
        type: "api"
      });
    }
  }

  // Infer /:id child endpoints from GET endpoints that return arrays with id fields
  const inferredIdEndpoints = [];
  for (const ep of apiEndpoints) {
    if (ep.method !== "GET") continue;
    const body = ep.sampleResponse;
    if (Array.isArray(body) && body.length > 0 && body[0]?.id != null) {
      const childEndpoint = `${ep.endpoint}/:id`;
      const exampleId = body[0].id;
      const key = `GET:${childEndpoint}`;
      if (!seen.has(key)) {
        seen.add(key);
        inferredIdEndpoints.push({
          method: "GET",
          endpoint: childEndpoint,
          exampleURL: `${ep.endpoint}/${exampleId}`,
          sampleRequest: null,
          sampleResponse: body[0],
          statusObserved: null,
          inferred: true,
          type: "api"
        });
      }

      // Also infer PUT /:id from observed GET array — we know the shape of the object
      const putKey = `PUT:${ep.endpoint}/:id`;
      if (!seen.has(putKey)) {
        seen.add(putKey);
        // Use the first object from the array as sample request body (minus id)
        const sampleBody = { ...body[0] };
        delete sampleBody.id;
        inferredIdEndpoints.push({
          method: "PUT",
          endpoint: `${ep.endpoint}/:id`,
          exampleURL: `${ep.endpoint}/${exampleId}`,
          sampleRequest: sampleBody,
          sampleResponse: null,
          statusObserved: null,
          inferred: true,
          type: "api"
        });
      }
    }
  }

  if (inferredIdEndpoints.length > 0) {
    const putCount = inferredIdEndpoints.filter(e => e.method === "PUT").length;
    const getCount = inferredIdEndpoints.filter(e => e.method === "GET").length;
    console.log(`  Inferred ${getCount} GET :id and ${putCount} PUT :id endpoint(s) from array responses`);
    apiEndpoints.push(...inferredIdEndpoints);
  }

  if (apiEndpoints.length > 0) {
    const breakdown = {
      get: apiEndpoints.filter(e => e.method === "GET").length,
      post: apiEndpoints.filter(e => e.method === "POST").length,
      put: apiEndpoints.filter(e => e.method === "PUT").length,
      delete: apiEndpoints.filter(e => e.method === "DELETE").length,
    };
    console.log(`  Found ${apiEndpoints.length} unique endpoint(s): GET=${breakdown.get} POST=${breakdown.post} PUT=${breakdown.put} DELETE=${breakdown.delete}`);
    return apiEndpoints;
  }

  // --- Strategy 2: server-rendered site ---
  console.log("  No XHR/fetch calls observed — site appears server-rendered");
  console.log("  Extracting paths and forms from crawl data...");

  const htmlEndpoints = [];
  const pathsSeen = new Set();
  const formsSeen = new Set();

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf-8"));
    const pagePath = raw.url;

    if (pagePath && !pathsSeen.has(pagePath)) {
      pathsSeen.add(pagePath);
      htmlEndpoints.push({
        method: "GET",
        endpoint: pagePath,
        exampleURL: pagePath,
        sampleRequest: null,
        sampleResponse: null,
        statusObserved: null,
        inferred: false,
        type: "html-path"
      });
    }

    for (const form of raw.forms || []) {
      const formAction = form.action || pagePath;
      const formMethod = form.method || "GET";
      const key = `${formMethod}:${formAction}`;
      if (formsSeen.has(key)) continue;
      formsSeen.add(key);

      const sampleRequest = {};
      for (const field of form.fields || []) {
        if (field.name) sampleRequest[field.name] = generateSampleValue(field);
      }

      htmlEndpoints.push({
        method: formMethod,
        endpoint: formAction,
        exampleURL: formAction,
        sampleRequest: Object.keys(sampleRequest).length > 0 ? sampleRequest : null,
        sampleResponse: null,
        statusObserved: null,
        inferred: false,
        type: "html-form",
        formFields: form.fields || []
      });
    }

    const slugPattern = /^(\/[^/]+\/)([^/]+-\d+)(\/.*)?$/;
    const pagePattern = /^(\/[^/]+\/page-)(\d+)(\/.*)?$/;

    if (pagePath) {
      if (slugPattern.test(pagePath)) {
        const parameterized = pagePath.replace(slugPattern, "$1:slug$3");
        const key = `GET:${parameterized}`;
        if (!pathsSeen.has(key)) {
          pathsSeen.add(key);
          htmlEndpoints.push({
            method: "GET",
            endpoint: parameterized,
            exampleURL: pagePath,
            sampleRequest: null,
            sampleResponse: null,
            statusObserved: null,
            inferred: true,
            type: "html-path-pattern"
          });
        }
      }

      if (pagePattern.test(pagePath)) {
        const parameterized = pagePath.replace(pagePattern, "$1:page$3");
        const key = `GET:${parameterized}`;
        if (!pathsSeen.has(key)) {
          pathsSeen.add(key);
          htmlEndpoints.push({
            method: "GET",
            endpoint: parameterized,
            exampleURL: pagePath,
            sampleRequest: null,
            sampleResponse: null,
            statusObserved: null,
            inferred: true,
            type: "html-path-pattern"
          });
        }
      }
    }
  }

  if (htmlEndpoints.length > 0) {
    const breakdown = {
      paths: htmlEndpoints.filter(e => e.type === "html-path").length,
      forms: htmlEndpoints.filter(e => e.type === "html-form").length,
      patterns: htmlEndpoints.filter(e => e.type === "html-path-pattern").length
    };
    console.log(`  Found ${htmlEndpoints.length} endpoint(s): ${breakdown.paths} paths, ${breakdown.forms} forms, ${breakdown.patterns} path patterns`);
    return htmlEndpoints;
  }

  // --- Strategy 3: fall back ---
  console.log("  No endpoints or paths found in crawl data — using common REST API endpoint patterns");
  return inferEndpointsFromBaseURL(config.baseURL);
}

function generateSampleValue(field) {
  const name = (field.name || field.label || "").toLowerCase();
  const type = (field.type || "text").toLowerCase();

  if (type === "email" || name.includes("email")) return "test@example.com";
  if (type === "password" || name.includes("password")) return "Password123!";
  if (type === "number" || name.includes("age")) return 25;
  if (type === "tel" || name.includes("phone")) return "555-0100";
  if (name.includes("name")) return "Test User";
  if (name.includes("search") || name === "q") return "test";
  if (name.includes("url") || name.includes("website")) return "https://example.com";
  return "test";
}

function inferEndpointsFromBaseURL(baseURL) {
  const commonResources = [
    "users", "posts", "todos", "comments",
    "products", "orders", "clients", "items",
    "articles", "categories", "tags"
  ];

  console.log(`  Will probe common REST patterns on ${baseURL}`);

  return commonResources.map((resource) => ({
    method: "GET",
    endpoint: `/${resource}`,
    exampleURL: `/${resource}`,
    sampleRequest: null,
    sampleResponse: null,
    statusObserved: null,
    inferred: true,
    type: "api"
  }));
}