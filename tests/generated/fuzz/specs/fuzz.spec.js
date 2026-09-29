// fuzz.spec.js — Auto-generated fuzz test script
// Tests both API endpoints and form inputs with boundary/edge-case data
import { test } from '@playwright/test';
import fs from 'fs';

const BASE_URL = 'https://books.toscrape.com';
const RESULTS = [];

function record(id, description, observations) {
  RESULTS.push({ id, description, observations, timestamp: new Date().toISOString() });
}

test.afterAll(() => {
  fs.mkdirSync('tests/generated/fuzz/reports', { recursive: true });
  fs.writeFileSync(
    'tests/generated/fuzz/reports/fuzz_spec_results.json',
    JSON.stringify(RESULTS, null, 2)
  );
});

// ============================================================
// FORM FUZZ TESTS — fills forms with boundary/edge-case inputs
// ============================================================

