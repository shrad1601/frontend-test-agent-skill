// crawler/index.js
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import config from "../config.js";
import { performAuth } from "./auth.js";
import { extractPageData } from "./extract.js";
import {
  isSameOrigin,
  normalizePath,
  truncate,
  inferRouteParams
} from "./utils.js";

const { baseURL, crawl, output } = config;

async function main() {
  console.log(`Starting crawl: ${baseURL}`);

  fs.rmSync(output.rawDir, { recursive: true, force: true });
  fs.mkdirSync(output.rawDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // ---- Auth ----
  const authResult = await performAuth(page, context, config);
  console.log(`Auth: ${authResult.message}`);

  // ---- Crawl queue (BFS) ----
  const visited = new Set();
  const queue = [{ path: "/", depth: 0 }];
  const pageSummaries = [];
  const allVisitedPaths = [];

  // If auth succeeded and redirected us to a post-login page,
  // start crawling from there instead of /
  if (authResult.success && authResult.attempted) {
    try {
      const currentPath = new URL(page.url()).pathname;
      if (currentPath && currentPath !== "/" && currentPath !== config.auth?.loginURL) {
        console.log(`Auth redirected to ${currentPath} — seeding as start page`);
        queue.length = 0;
        queue.push({ path: currentPath, depth: 0 });
      }
    } catch {
      // keep default queue
    }
  }

  // Add seed paths from config
  if (crawl.seedPaths?.length > 0) {
    console.log(`Seeding ${crawl.seedPaths.length} additional path(s) from config`);
    for (const seedPath of crawl.seedPaths) {
      if (!queue.some(q => q.path === seedPath)) {
        queue.push({ path: seedPath, depth: 0 });
      }
    }
  }

  let isSPA = null;

  while (queue.length > 0 && visited.size < crawl.maxPages) {
    const { path: currentPath, depth } = queue.shift();

    if (visited.has(currentPath)) continue;
    if (depth > crawl.maxDepth) continue;

    visited.add(currentPath);
    allVisitedPaths.push(currentPath);

    console.log(`[${visited.size}/${crawl.maxPages}] Visiting ${currentPath} (depth ${depth})`);

    const isFirstVisit = isSPA === null;
    const pageResult = await visitPage(page, currentPath, depth, isFirstVisit, isSPA);

    if (isFirstVisit) {
      isSPA = await detectSPA(page, baseURL);
      console.log(`Site type: ${isSPA ? "SPA (hash routing)" : "server-rendered"}`);
    }

    pageSummaries.push({
      url: pageResult.url,
      title: pageResult.title,
      depth
    });

    const filename = pathToFilename(currentPath);
    fs.writeFileSync(
      path.join(output.rawDir, filename),
      JSON.stringify(pageResult, null, 2)
    );

    for (const link of pageResult.linksTo) {
      const linkPath = link.target;
      if (!visited.has(linkPath) && !queue.some((q) => q.path === linkPath)) {
        queue.push({ path: linkPath, depth: depth + 1 });
      }
    }
  }

  await browser.close();

  const routePatterns = inferRouteParams(allVisitedPaths);

  const summary = {
    baseURL,
    crawlDate: new Date().toISOString(),
    authResult,
    isSPA,
    pagesVisited: pageSummaries.length,
    pages: pageSummaries,
    inferredRoutePatterns: routePatterns
  };

  fs.writeFileSync(output.summaryFile, JSON.stringify(summary, null, 2));

  console.log(`\nDone. Visited ${pageSummaries.length} pages.`);
  console.log(`Raw data: ${output.rawDir}`);
  console.log(`Summary: ${output.summaryFile}`);
}

async function detectSPA(page, baseURL) {
  try {
    return await page.evaluate((base) => {
      if (window.location.hash && window.location.hash.length > 1) return true;
      const spaRoots = ["#root", "#app", "#__next", "#gatsby-focus-wrapper"];
      for (const selector of spaRoots) {
        const el = document.querySelector(selector);
        if (el && el.children.length > 0) return true;
      }
      const internalLinks = [...document.querySelectorAll("a[href]")]
        .map(a => a.getAttribute("href"))
        .filter(href => !href.startsWith("http") && !href.startsWith("mailto"));
      if (internalLinks.length > 0) {
        const hashLinks = internalLinks.filter(href => href.startsWith("#"));
        if (hashLinks.length / internalLinks.length > 0.5) return true;
      }
      return false;
    }, baseURL);
  } catch {
    return false;
  }
}

async function visitPage(page, currentPath, depth, isFirstVisit, isSPA) {
  const networkCalls = [];
  const consoleErrors = [];

  const onResponse = async (response) => {
    const request = response.request();
    const resourceType = request.resourceType();
    if (resourceType !== "fetch" && resourceType !== "xhr") return;

    let responseBody = null;
    try {
      responseBody = await response.text();
    } catch {
      responseBody = "[could not read response body]";
    }

    let requestBody = null;
    try {
      requestBody = request.postData();
    } catch {
      requestBody = null;
    }

    networkCalls.push({
      method: request.method(),
      url: normalizePath(request.url(), baseURL),
      status: response.status(),
      requestBody: requestBody ? truncate(safeJsonParse(requestBody)) : null,
      responseBody: truncate(safeJsonParse(responseBody))
    });
  };

  const onConsole = (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({
        type: "console-error",
        message: msg.text().slice(0, 500),
        context: `on page load: ${currentPath}`
      });
    }
  };

  const onPageError = (err) => {
    consoleErrors.push({
      type: "render-error",
      message: err.message.slice(0, 500),
      context: `on page load: ${currentPath}`
    });
  };

  page.on("response", onResponse);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  let navError = null;
  const useSPA = isSPA === true && !isFirstVisit;

  if (!useSPA) {
    const fullUrl = isSPA === true
      ? `${baseURL}/#${currentPath}`
      : `${baseURL}${currentPath}`;

    try {
      await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(config.crawl.waitAfterAction).catch(() => {});
    } catch (err) {
      navError = err.message;
      console.log(`    Navigation failed for ${currentPath}: ${err.message.slice(0, 80)}`);
    }
  } else {
    try {
      await page.evaluate((newHashPath) => {
        window.location.hash = newHashPath;
      }, currentPath);
      await page.waitForTimeout(1000).catch(() => {});
    } catch (err) {
      navError = err.message;
    }
  }

  await page.waitForTimeout(config.crawl.waitAfterAction).catch(() => {});

  let domData = {
    title: null,
    h1: null,
    links: [],
    forms: [],
    buttons: [],
    tables: []
  };

  if (!navError) {
    try {
      domData = await extractPageData(page);
    } catch (err) {
      consoleErrors.push({
        type: "extraction-error",
        message: err.message.slice(0, 500),
        context: `extracting DOM facts on ${currentPath}`
      });
    }
  } else {
    consoleErrors.push({
      type: "navigation-error",
      message: navError,
      context: `navigating to ${currentPath}`
    });
  }

  page.off("response", onResponse);
  page.off("console", onConsole);
  page.off("pageerror", onPageError);

  const linksTo = domData.links
    .filter((l) => isSameOrigin(l.href, baseURL))
    .map((l) => ({
      target: normalizePath(l.href, baseURL),
      trigger: l.text || "[unlabeled link]"
    }));

  return {
    url: currentPath,
    title: domData.title,
    h1: domData.h1,
    linksTo,
    forms: domData.forms,
    buttons: domData.buttons,
    tables: domData.tables,
    networkCallsObserved: networkCalls,
    errorsObserved: consoleErrors
  };
}

function pathToFilename(urlPath) {
  let name = urlPath.replace(/^\//, "").replace(/[\/?&=]/g, "_");
  if (name === "") name = "root";
  return `${name}.json`;
}

function safeJsonParse(str) {
  if (typeof str !== "string") return str;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

main().catch((err) => {
  console.error("Crawler failed:", err);
  process.exit(1);
});