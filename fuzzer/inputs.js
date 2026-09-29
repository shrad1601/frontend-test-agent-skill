// fuzzer/inputs.js

/**
 * For each endpoint, generates a set of fuzz test cases with inputs.
 * Categories: boundary values, type confusion, garbage, empty/null
 *
 * @param {Array} endpoints - from extract.js
 * @returns {{ cases: Array, data: object }}
 */
export function generateFuzzInputs(endpoints) {
  const cases = [];
  const data = {};
  let counter = 1;

  for (const ep of endpoints) {
    const baseId = `TC-FUZZ-${String(counter).padStart(3, "0")}`;
    counter++;

    // For GET endpoints with no body — test ID variations
    if (ep.method === "GET") {
      const testSets = [
        {
          id: `${baseId}-A`,
          description: `GET ${ep.endpoint} with valid observed ID`,
          input: { url: ep.exampleURL },
          type: "happy-path"
        },
        {
          id: `${baseId}-B`,
          description: `GET ${ep.endpoint} with non-existent ID (999999)`,
          input: { url: ep.endpoint.replace(":id", "999999") },
          type: "edge-case"
        },
        {
          id: `${baseId}-C`,
          description: `GET ${ep.endpoint} with string instead of ID`,
          input: { url: ep.endpoint.replace(":id", "abc") },
          type: "type-confusion"
        },
        {
          id: `${baseId}-D`,
          description: `GET ${ep.endpoint} with negative ID`,
          input: { url: ep.endpoint.replace(":id", "-1") },
          type: "boundary"
        }
      ];

      const relevantTests = ep.endpoint.includes(":id")
        ? testSets
        : [testSets[0]];

      for (const t of relevantTests) {
        cases.push({
          id: t.id,
          description: t.description,
          method: ep.method,
          endpoint: ep.endpoint,
          exampleURL: ep.exampleURL,
          type: t.type
        });
        data[t.id] = t.input;
      }
    }

    // For POST/PUT endpoints — test body variations
    if (ep.method === "POST" || ep.method === "PUT") {
      const sampleFields = inferFields(ep.sampleRequest || ep.sampleResponse);

      const testSets = [
        {
          id: `${baseId}-A`,
          description: `${ep.method} ${ep.endpoint} with valid data`,
          input: generateValidBody(sampleFields, ep.sampleRequest),
          type: "happy-path"
        },
        {
          id: `${baseId}-B`,
          description: `${ep.method} ${ep.endpoint} with empty body`,
          input: {},
          type: "boundary"
        },
        {
          id: `${baseId}-C`,
          description: `${ep.method} ${ep.endpoint} with null values`,
          input: nullifyFields(sampleFields),
          type: "edge-case"
        },
        {
          id: `${baseId}-D`,
          description: `${ep.method} ${ep.endpoint} with very long string values`,
          input: longStringFields(sampleFields),
          type: "boundary"
        },
        {
          id: `${baseId}-E`,
          description: `${ep.method} ${ep.endpoint} with special characters`,
          input: specialCharFields(sampleFields),
          type: "edge-case"
        },
        {
          id: `${baseId}-F`,
          description: `${ep.method} ${ep.endpoint} with missing required fields`,
          input: missingFieldsBody(sampleFields),
          type: "boundary"
        }
      ];

      for (const t of testSets) {
        cases.push({
          id: t.id,
          description: t.description,
          method: ep.method,
          endpoint: ep.endpoint,
          exampleURL: ep.exampleURL,
          type: t.type
        });
        data[t.id] = t.input;
      }
    }

    // For DELETE endpoints
    if (ep.method === "DELETE") {
      const testSets = [
        {
          id: `${baseId}-A`,
          description: `DELETE ${ep.endpoint} with valid observed ID`,
          input: { url: ep.exampleURL },
          type: "happy-path"
        },
        {
          id: `${baseId}-B`,
          description: `DELETE ${ep.endpoint} with non-existent ID`,
          input: { url: ep.endpoint.replace(":id", "999999") },
          type: "edge-case"
        }
      ];

      for (const t of testSets) {
        cases.push({
          id: t.id,
          description: t.description,
          method: ep.method,
          endpoint: ep.endpoint,
          exampleURL: ep.exampleURL,
          type: t.type
        });
        data[t.id] = t.input;
      }
    }
  }

  return { cases, data };
}

// ---- Helpers ----

function inferFields(sample) {
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) return ["name", "email"];
  return Object.keys(sample).filter((k) => k !== "id");
}

/**
 * Generates valid body — uses observed sample request if available,
 * otherwise generates plausible values from field names.
 */
function generateValidBody(fields, sampleRequest) {
  // If we have an observed request body, use it directly as the happy path
  if (sampleRequest && typeof sampleRequest === "object" && !Array.isArray(sampleRequest)) {
    return { ...sampleRequest };
  }
  const body = {};
  for (const field of fields) {
    if (field.includes("email")) body[field] = "test@example.com";
    else if (field.includes("name")) body[field] = "Test User";
    else if (field.includes("phone")) body[field] = "12345678";
    else body[field] = "test-value";
  }
  return body;
}

function nullifyFields(fields) {
  const body = {};
  for (const field of fields) body[field] = null;
  return body;
}

function longStringFields(fields) {
  const body = {};
  for (const field of fields) body[field] = "A".repeat(1000);
  return body;
}

function specialCharFields(fields) {
  const body = {};
  for (const field of fields) body[field] = "<script>alert('xss')</script>; DROP TABLE clients;--";
  return body;
}

/**
 * Sends only the first field, leaving the rest missing —
 * tests whether the server validates required fields properly.
 */
function missingFieldsBody(fields) {
  if (fields.length === 0) return {};
  const body = {};
  body[fields[0]] = "only-this-field";
  return body;
}