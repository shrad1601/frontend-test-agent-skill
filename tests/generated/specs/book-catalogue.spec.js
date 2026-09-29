import { test } from '@playwright/test';
import fs from 'fs';

const BASE_URL = 'https://books.toscrape.com';
const RESULTS = [];

function record(id, description, observations) {
  RESULTS.push({ id, description, observations, timestamp: new Date().toISOString() });
}

test.afterAll(() => {
  fs.mkdirSync('tests/generated/reports', { recursive: true });
  fs.writeFileSync(
    'tests/generated/reports/results.json',
    JSON.stringify(RESULTS, null, 2)
  );
});

// Test case for 'A Light in the Attic' book page
test('TC-CLIENT-001: Navigate to the "A Light in the Attic" book page and verify the title and URL.', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto(`${BASE_URL}/catalogue/a-light-in-the-attic_1000/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    observations.url = page.url();
    observations.title = await page.title();
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-CLIENT-001', 'Navigate to the "A Light in the Attic" book page and verify the title and URL.', observations);
});

// Test case for Books category
test('TC-CLIENT-002: Navigate to the Books category and verify the title and URL.', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto(`${BASE_URL}/catalogue/category/books_1/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    observations.url = page.url();
    observations.title = await page.title();
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-CLIENT-002', 'Navigate to the Books category and verify the title and URL.', observations);
});

// Test case for Historical Fiction category
test('TC-CLIENT-003: Navigate to the Historical Fiction category and verify the title and URL.', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto(`${BASE_URL}/catalogue/category/books/historical-fiction_4/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    observations.url = page.url();
    observations.title = await page.title();
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-CLIENT-003', 'Navigate to the Historical Fiction category and verify the title and URL.', observations);
});

// Test case for Mystery category
test('TC-CLIENT-004: Navigate to the Mystery category and verify the title and URL.', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto(`${BASE_URL}/catalogue/category/books/mystery_3/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    observations.url = page.url();
    observations.title = await page.title();
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-CLIENT-004', 'Navigate to the Mystery category and verify the title and URL.', observations);
});

// Test case for Travel category
test('TC-CLIENT-005: Follow the link to the Travel category and verify the title and URL.', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto(`${BASE_URL}/catalogue/category/books/travel_2/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    observations.url = page.url();
    observations.title = await page.title();
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-CLIENT-005', 'Follow the link to the Travel category and verify the title and URL.', observations);
});

// Test case for All products page
test('TC-CLIENT-006: Navigate to the All products page and verify the title and URL.', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    observations.url = page.url();
    observations.title = await page.title();
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-CLIENT-006', 'Navigate to the All products page and verify the title and URL.', observations);
});

// Test case for console errors on 'A Light in the Attic' page
test('TC-CLIENT-007: Check for console errors on the "A Light in the Attic" page.', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto(`${BASE_URL}/catalogue/a-light-in-the-attic_1000/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-CLIENT-007', 'Check for console errors on the "A Light in the Attic" page.', observations);
});

// Test case for console errors on Books category page
test('TC-CLIENT-008: Check for console errors on the Books category page.', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto(`${BASE_URL}/catalogue/category/books_1/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-CLIENT-008', 'Check for console errors on the Books category page.', observations);
});

// Test case for console errors on Historical Fiction category page
test('TC-CLIENT-009: Check for console errors on the Historical Fiction category page.', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto(`${BASE_URL}/catalogue/category/books/historical-fiction_4/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-CLIENT-009', 'Check for console errors on the Historical Fiction category page.', observations);
});

// Test case for console errors on Mystery category page
test('TC-CLIENT-010: Check for console errors on the Mystery category page.', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto(`${BASE_URL}/catalogue/category/books/mystery_3/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-CLIENT-010', 'Check for console errors on the Mystery category page.', observations);
});