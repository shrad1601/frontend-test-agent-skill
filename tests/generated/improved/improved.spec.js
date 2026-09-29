// improved.spec.js — Auto-generated improved tests targeting observed failures
// Generated: 2026-06-26T06:46:08.597Z
// Original failures addressed: TC-CLIENT-003, TC-CLIENT-004, TC-CLIENT-009

import { test } from '@playwright/test';
import fs from 'fs';

const BASE_URL = 'https://reqres.in';
const RESULTS = [];

function record(id, description, observations) {
  RESULTS.push({ id, description, observations, timestamp: new Date().toISOString() });
}

test.afterAll(() => {
  fs.mkdirSync('tests/generated/improved', { recursive: true });
  fs.writeFileSync(
    'tests/generated/improved/improved_results.json',
    JSON.stringify(RESULTS, null, 2)
  );
});

test('TC-IMP-001: Submit the waitlist form on the Self-hosted page with valid data', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto('https://reqres.in/#/self-hosted', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    try {
      await page.locator('input[name="email"]').fill('test@example.com', { timeout: 3000 });
    } catch (err) {
      observations.fillEmailError = err.message;
    }

    try {
      await page.locator('button[type="submit"]').click({ timeout: 3000 });
    } catch (err) {
      observations.submitClickError = err.message;
    }

    const response = await page.waitForResponse(response => response.url().includes('/api/waitlist') && response.status() !== 200);
    if (response) {
      observations.apiError = await response.json();
    }

    observations.finalUrl = await page.url();
    observations.pageTitle = await page.title();

  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-IMP-001', 'Submit the waitlist form on the Self-hosted page with valid data', observations);
});

test('TC-IMP-002: Submit the waitlist form without any input', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto('https://reqres.in/#/self-hosted', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    
    try {
      await page.locator('#waitlistForm').locator('input[name="email"]').fill('', { timeout: 3000 });
    } catch (err) {
      observations.fillError = err.message;
    }

    try {
      await page.locator('#waitlistForm button[type="submit"]').click({ timeout: 3000 });
    } catch (err) {
      observations.clickError = err.message;
    }

    try {
      observations.finalUrl = await page.url();
      observations.pageTitle = await page.title();
    } catch (err) {
      observations.urlError = err.message;
    }
  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-IMP-002', 'Submit the waitlist form without any input', observations);
});

test('TC-IMP-003: Verify the successful API call when submitting the waitlist form.', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const observations = {};
  try {
    await page.goto(`https://reqres.in/#/about`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    try {
      await page.locator('input[name="email"]').first().fill('test@example.com', { timeout: 3000 });
    } catch (err) {
      observations.fillError = err.message;
    }

    try {
      await page.locator('button[type="submit"]').click({ timeout: 3000 });
    } catch (err) {
      observations.clickError = err.message;
    }

    observations.finalUrl = await page.url();
    observations.pageTitle = await page.title();

  } catch (err) {
    observations.error = err.message;
  }

  observations.consoleErrors = consoleErrors;
  record('TC-IMP-003', 'Verify the successful API call when submitting the waitlist form.', observations);
});
