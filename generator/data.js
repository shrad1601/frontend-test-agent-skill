// generator/data.js
import { faker } from "@faker-js/faker";
import fs from "fs";
import path from "path";

// Configure json-schema-faker to use faker for generation

/**
 * Generates test data for each test case based on its dataNeeded field.
 * Infers JSON schemas from observed API responses, then uses
 * json-schema-faker to generate realistic data matching those schemas.
 *
 * @param {object} allCases - output from cases.js
 * @param {string} rawDir - path to crawl raw data
 * @returns {object} map of test case ID -> data object
 */
export function generateTestData(allCases, rawDir = "tests/generated/site-maps/raw") {
  const { patterns, schemas } = learnFromCrawlData(rawDir);

  if (Object.keys(schemas).length > 0) {
    console.log(`  Inferred schemas for: ${Object.keys(schemas).join(", ")}`);
  } else if (Object.keys(patterns).length > 0) {
    console.log(`  Learned patterns from crawl data: ${Object.keys(patterns).join(", ")}`);
  }

  const allData = {};
  for (const cases of Object.values(allCases)) {
    for (const tc of cases) {
      allData[tc.id] = generateDataForCase(tc, patterns, schemas);
    }
  }

  return allData;
}

/**
 * Reads crawl data and builds:
 * - patterns: fieldName -> { examples, type } (for Faker fallback)
 * - schemas: endpointKey -> JSON Schema (for json-schema-faker)
 */
function learnFromCrawlData(rawDir) {
  const patterns = {};
  const schemaMap = {}; // endpoint -> array of observed objects

  if (!fs.existsSync(rawDir)) return { patterns, schemas: {} };

  const files = fs.readdirSync(rawDir).filter(f => f.endsWith(".json"));

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf-8"));

      for (const call of raw.networkCallsObserved || []) {
        if (call.method !== "GET") continue;
        const body = call.responseBody;
        if (!body || typeof body !== "object") continue;

        const items = Array.isArray(body) ? body : [body];
        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          extractPatterns(item, patterns);

          // Group by normalized endpoint for schema inference
          const endpointKey = call.url.replace(/\/\d+/g, "/:id");
          if (!schemaMap[endpointKey]) schemaMap[endpointKey] = [];
          if (schemaMap[endpointKey].length < 10) {
            schemaMap[endpointKey].push(item);
          }
        }
      }
    } catch {
      // skip malformed files
    }
  }

  // Infer JSON schemas from collected samples
  const schemas = {};
  for (const [endpoint, samples] of Object.entries(schemaMap)) {
    if (samples.length > 0) {
      schemas[endpoint] = inferJsonSchema(samples);
    }
  }

  return { patterns, schemas };
}

/**
 * Infers a JSON Schema from an array of observed response objects.
 * Uses the union of all observed fields and their types.
 */
function inferJsonSchema(samples) {
  const schema = {
    type: "object",
    properties: {},
    required: []
  };

  // Collect all fields across all samples
  const fieldCounts = {};
  const fieldTypes = {};
  const fieldExamples = {};

  for (const sample of samples) {
    for (const [key, value] of Object.entries(sample)) {
      if (key === "id" || key === "_id") continue;
      fieldCounts[key] = (fieldCounts[key] || 0) + 1;
      if (!fieldTypes[key]) fieldTypes[key] = inferType(key, value);
      if (!fieldExamples[key]) fieldExamples[key] = [];
      if (fieldExamples[key].length < 3) fieldExamples[key].push(value);
    }
  }

  // Build schema properties
  for (const [key, type] of Object.entries(fieldTypes)) {
    schema.properties[key] = buildSchemaProperty(type, fieldExamples[key] || []);

    // Mark as required if it appears in most samples
    if (fieldCounts[key] / samples.length > 0.7) {
      schema.required.push(key);
    }
  }

  return schema;
}

/**
 * Builds a JSON Schema property definition for a field.
 */
function buildSchemaProperty(type, examples) {
  switch (type) {
    case "email":
      return { type: "string", format: "email", faker: "internet.email" };
    case "phone":
      return { type: "string", faker: "phone.number" };
    case "name":
      return { type: "string", faker: "person.fullName" };
    case "username":
      return { type: "string", faker: "internet.userName" };
    case "address":
      return { type: "string", faker: "location.streetAddress" };
    case "city":
      return { type: "string", faker: "location.city" };
    case "country":
      return { type: "string", faker: "location.country" };
    case "zip":
      return { type: "string", faker: "location.zipCode" };
    case "company":
      return { type: "string", faker: "company.name" };
    case "url":
      return { type: "string", format: "uri", faker: "internet.url" };
    case "price": {
      const nums = examples.filter(e => typeof e === "number");
      const min = nums.length > 0 ? Math.max(0, Math.min(...nums) * 0.5) : 0;
      const max = nums.length > 0 ? Math.max(...nums) * 1.5 : 1000;
      return { type: "number", minimum: min, maximum: max };
    }
    case "date":
      return { type: "string", format: "date-time", faker: "date.recent" };
    case "text":
      return { type: "string", faker: "lorem.sentence" };
    case "number": {
      const nums = examples.filter(e => typeof e === "number");
      const min = nums.length > 0 ? Math.max(0, Math.min(...nums)) : 1;
      const max = nums.length > 0 ? Math.max(...nums) * 2 : 100;
      return { type: "integer", minimum: min, maximum: max };
    }
    case "boolean":
      return { type: "boolean" };
    default:
      if (examples.length > 0 && typeof examples[0] === "string") {
        // Use observed max length as constraint
        const maxLen = Math.max(...examples.map(e => String(e).length));
        return { type: "string", maxLength: maxLen * 2, faker: "lorem.word" };
      }
      return { type: "string", faker: "lorem.word" };
  }
}

/**
 * Generates data from the best available schema.
 * Tries json-schema-faker first, falls back to Faker patterns.
 */
async function generateFromSchema(schema) {
  try {
    const generated = await jsf.resolve(schema);
    return generated;
  } catch {
    return null;
  }
}

function extractPatterns(obj, patterns) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (key === "id" || key === "_id") continue;

    if (!patterns[key]) {
      patterns[key] = { examples: [], type: inferType(key, value) };
    }
    if (patterns[key].examples.length < 5) {
      patterns[key].examples.push(value);
    }
  }
}

function inferType(key, value) {
  const k = key.toLowerCase();
  if (k.includes("email") || (typeof value === "string" && value.includes("@"))) return "email";
  if (k.includes("phone") || k.includes("tel")) return "phone";
  if (k.includes("name") && !k.includes("file") && !k.includes("user")) return "name";
  if (k.includes("username") || k.includes("user_name")) return "username";
  if (k.includes("address") || k.includes("street")) return "address";
  if (k.includes("city")) return "city";
  if (k.includes("country")) return "country";
  if (k.includes("zip") || k.includes("postal")) return "zip";
  if (k.includes("company") || k.includes("org")) return "company";
  if (k.includes("url") || k.includes("website") || k.includes("link")) return "url";
  if (k.includes("price") || k.includes("amount") || k.includes("cost")) return "price";
  if (k.includes("date") || k.includes("time") || k.includes("at")) return "date";
  if (k.includes("description") || k.includes("bio") || k.includes("note")) return "text";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function generateByType(type) {
  switch (type) {
    case "email": return faker.internet.email();
    case "phone": return faker.phone.number();
    case "name": return faker.person.fullName();
    case "username": return faker.internet.username();
    case "address": return faker.location.streetAddress();
    case "city": return faker.location.city();
    case "country": return faker.location.country();
    case "zip": return faker.location.zipCode();
    case "company": return faker.company.name();
    case "url": return faker.internet.url();
    case "price": return parseFloat(faker.commerce.price());
    case "date": return faker.date.recent().toISOString();
    case "text": return faker.lorem.sentence();
    case "number": return faker.number.int({ min: 1, max: 100 });
    case "boolean": return faker.datatype.boolean();
    default: return faker.lorem.word();
  }
}

function generateRealisticValue(fieldName, patterns) {
  const pattern = patterns[fieldName];
  const type = pattern?.type || inferType(fieldName, "");
  return generateByType(type);
}

function generateDataForCase(tc, patterns = {}, schemas = {}) {
  const dataNeeded = (tc.dataNeeded != null ? String(tc.dataNeeded) : "").toLowerCase();

  if (
    dataNeeded === "none" ||
    dataNeeded === "" ||
    dataNeeded.includes("no data") ||
    dataNeeded.includes("just visit")
  ) {
    return null;
  }

  if (dataNeeded.includes("id") && !dataNeeded.includes("email")) {
    return { id: "{{CLIENT_ID}}" };
  }

  switch (tc.type) {
    case "happy-path":
      return generateValidData(dataNeeded, patterns, schemas);
    case "validation":
      return generateValidationData(dataNeeded, patterns);
    case "edge-case":
      return generateEdgeCaseData(dataNeeded);
    case "error-scenario":
      return generateErrorData(dataNeeded);
    default:
      return generateValidData(dataNeeded, patterns, schemas);
  }
}

function generateValidData(dataNeeded, patterns = {}, schemas = {}) {
  // Try to find a matching schema from observed endpoints
  const schemaKeys = Object.keys(schemas);
  if (schemaKeys.length > 0) {
    // Find the most relevant schema based on dataNeeded keywords
    const bestSchema = findBestSchema(dataNeeded, schemas);
    if (bestSchema) {
      // Synchronously generate using the schema properties
      const data = {};
      for (const [field, prop] of Object.entries(bestSchema.properties || {})) {
        if (field === "id") continue;
        data[field] = generateByType(inferType(field, ""));
      }
      if (Object.keys(data).length > 0) return data;
    }
  }

  // Fall back to pattern-based generation
  const data = {};
  for (const [fieldName, pattern] of Object.entries(patterns)) {
    if (
      (needsName(dataNeeded) && pattern.type === "name") ||
      (needsEmail(dataNeeded) && pattern.type === "email") ||
      (needsPhone(dataNeeded) && pattern.type === "phone") ||
      (needsAddress(dataNeeded) && pattern.type === "address") ||
      (needsCompany(dataNeeded) && pattern.type === "company")
    ) {
      data[fieldName] = generateRealisticValue(fieldName, patterns);
    }
  }

  // Final fallback to generic Faker
  if (needsName(dataNeeded) && !Object.keys(data).some(k => patterns[k]?.type === "name")) {
    data.name = faker.person.fullName();
  }
  if (needsEmail(dataNeeded) && !data.email) {
    data.email = faker.internet.email();
  }
  if (needsPhone(dataNeeded) && !data.phone) {
    data.phone = faker.phone.number();
  }
  if (needsAddress(dataNeeded) && !data.address) {
    data.address = faker.location.streetAddress();
  }
  if (needsCompany(dataNeeded) && !data.company) {
    data.company = faker.company.name();
  }

  return Object.keys(data).length > 0 ? data : { value: faker.lorem.word() };
}

/**
 * Finds the most relevant schema for a given dataNeeded string.
 */
function findBestSchema(dataNeeded, schemas) {
  // Match schema by endpoint keywords
  for (const [endpoint, schema] of Object.entries(schemas)) {
    const ep = endpoint.toLowerCase();
    if (
      (dataNeeded.includes("client") && ep.includes("client")) ||
      (dataNeeded.includes("user") && ep.includes("user")) ||
      (dataNeeded.includes("product") && ep.includes("product")) ||
      (dataNeeded.includes("order") && ep.includes("order"))
    ) {
      return schema;
    }
  }
  // Return first schema if no keyword match
  const first = Object.values(schemas)[0];
  return first || null;
}

function generateValidationData(dataNeeded, patterns = {}) {
  const data = {};

  if (dataNeeded.includes("empty") || dataNeeded.includes("missing")) {
    if (needsName(dataNeeded)) data.name = "";
    if (needsEmail(dataNeeded)) data.email = "";
    return data;
  }
  if (dataNeeded.includes("invalid email")) {
    if (needsName(dataNeeded)) data.name = faker.person.fullName();
    data.email = "not-an-email";
    return data;
  }
  if (dataNeeded.includes("invalid")) {
    if (needsName(dataNeeded)) data.name = faker.person.fullName();
    if (needsEmail(dataNeeded)) data.email = "invalid@@email..com";
    return data;
  }

  if (needsName(dataNeeded)) data.name = "";
  if (needsEmail(dataNeeded)) data.email = "";
  return data;
}

function generateEdgeCaseData(dataNeeded) {
  const data = {};

  if (dataNeeded.includes("long") || dataNeeded.includes("boundary")) {
    if (needsName(dataNeeded)) data.name = "A".repeat(256);
    if (needsEmail(dataNeeded)) data.email = `${"a".repeat(200)}@test.com`;
    return data;
  }
  if (dataNeeded.includes("special")) {
    if (needsName(dataNeeded)) data.name = "<script>alert('xss')</script>";
    if (needsEmail(dataNeeded)) data.email = "test+special@example.com";
    return data;
  }
  if (dataNeeded.includes("whitespace") || dataNeeded.includes("spaces")) {
    if (needsName(dataNeeded)) data.name = "   ";
    if (needsEmail(dataNeeded)) data.email = "   ";
    return data;
  }

  if (needsName(dataNeeded)) data.name = "A";
  if (needsEmail(dataNeeded)) data.email = "a@b.co";
  return data;
}

function generateErrorData(dataNeeded) {
  if (dataNeeded.includes("non-existent") || dataNeeded.includes("not found")) {
    return { id: 999999999 };
  }
  if (dataNeeded.includes("duplicate")) {
    return { name: faker.person.fullName(), email: "duplicate@example.com" };
  }
  return { id: 999999999 };
}

function needsName(str) { return str.includes("name") || str.includes("client") || str.includes("user"); }
function needsEmail(str) { return str.includes("email") || str.includes("mail"); }
function needsPhone(str) { return str.includes("phone") || str.includes("tel"); }
function needsAddress(str) { return str.includes("address") || str.includes("street"); }
function needsCompany(str) { return str.includes("company") || str.includes("organisation") || str.includes("org"); }