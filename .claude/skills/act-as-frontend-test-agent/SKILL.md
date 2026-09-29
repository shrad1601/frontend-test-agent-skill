---
name: act-as-frontend-test-agent
description: Run this repo's own crawl -> generate -> run-tests -> fuzz pipeline against a target site non-interactively. Use when asked to "act as frontend test agent", crawl a site and generate/run tests, or fuzz its forms/endpoints.
user-invocable: true
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
---

# Act as Frontend Test Agent

This repo **is** the frontend test agent — don't build a separate harness.
It's a 4-stage pipeline, each stage a plain npm script writing plain JSON/JS
files that the next stage reads. Read a stage's output before assuming it
worked; several failure modes below are silent (exit 0, empty output).

```
crawler/   -> npm run crawl          (Playwright, no LLM)
generator/ -> npm run generate       (LLM: groups pages, writes test cases + specs)
runner/    -> npm run run-tests      (Playwright, no LLM) + npm run report (LLM analysis)
fuzzer/    -> npm run fuzz           (API fuzz, no LLM) + npm run fuzz-frontend (form fuzz, no LLM)
```

## 0. Preflight — check the LLM key BEFORE doing anything else

`npm run generate` needs a working key. Check `.env` first:

```
cat .env   # LLM_PROVIDER=openai|claude|gemini, and the matching *_API_KEY
```

If the matching key is `dummy`/`placeholder`/missing, **stop and ask the
user for a real key** rather than hand-authoring a stand-in generator — that
work gets thrown away the moment a real key shows up (learned the hard way).
`npm run crawl`, `run-tests`, and `fuzz`/`fuzz-frontend` don't need a key and
degrade gracefully without one (AI-analysis sections in reports just print
`[analysis failed: ...]`).

## 1. Configure the crawl (`config.js`)

```js
{
  baseURL: "https://target-site.com",
  crawl: { maxPages: 60, maxDepth: 5, waitAfterAction: 500, seedPaths: [] },
  auth: { type: "none" },
  output: { rawDir: "tests/generated/site-maps/raw", summaryFile: "..." }
}
```

**BFS trap:** the crawler visits breadth-first from `/`. On sites with a big
flat nav (e.g. 50 sidebar categories), `maxPages` gets eaten entirely by
depth-1 category pages before it ever reaches depth-2 detail/product pages.
Symptom: crawl "succeeds" but every raw JSON file looks the same shape (all
category pages, no product pages). Fix: either raise `maxPages`, or add a
couple of known deep-page paths to `seedPaths` so they're queued first.

For a **quick/small run**, don't crank maxDepth down as the primary lever —
drop `maxPages` (e.g. 8) and set one `seedPaths` entry so you still get a mix
of shallow + one deep page in a fast crawl.

## 2. Generate (`npm run generate`)

Watch stdout for `Failed for <feature>: ...` — `cases.js`/`specs.js` catch
per-feature errors and silently continue with an empty case/spec list for
that feature rather than crashing the whole run. **0 generated test cases
with no visible error is not success** — always check the actual case count
printed, and if it's 0, re-run once with the offending step's error surfaced
(temporarily remove the try/catch or check server logs).

Known scaling bug **already fixed** in this repo — don't rediscover it:
- `generator/grouper.js` — `llmCall` maxTokens was 500, too small once >~15
  pages need grouping (response truncates mid-JSON). Now 4000.
- `generator/cases.js` — dumping every page's full button/form/link
  inventory into one prompt overflows the model's context window on sites
  with repeated widgets (e.g. an "Add to basket" form on every product
  card, N times over). `buildPrompt` now dedupes buttons/forms by shape and
  caps links per page at `MAX_LINKS_PER_PAGE` (15). If you still hit
  `context_length_exceeded` on a much bigger site, the next lever is
  splitting one oversized feature group into multiple smaller LLM calls
  (chunk `group.pages`, merge the returned case arrays) — not implemented,
  wasn't needed yet.
- `generator/specs.js` — markdown-fence stripping only handled a fence at
  the very start of the response; some providers (seen with OpenAI) prepend
  a conversational preamble ("Here's the complete spec file...") that then
  leaked into the `.spec.js` file as prose. `extractSpecCode()` now pulls
  code from inside the fence wherever it appears.
- `generator/specs.js` — `sanitizeQuoting()` defensively escapes stray
  single quotes inside generated `test('...')` titles and `record('...')`
  calls. The LLM *usually* rewrites an embedded apostrophe as a double
  quote since the surrounding string is single-quoted, but that's a style
  choice, not a guarantee — an unescaped `'Books'` inside a `test('...')`
  title is a straight syntax error at runtime (the runner does regex-based
  text extraction on the raw file, not real JS parsing, so it can't recover
  from this on its own). Don't remove this function.
- `runner/index.js` — `extractTestBlocks` unescapes `\'` back to `'` when
  building the human-readable `description` field, so the escaping above
  doesn't leak backslashes into reports.

If you edit any of `grouper.js`/`cases.js`/`specs.js` again, re-verify with
a throwaway Node script that feeds a deliberately-adversarial string (an
apostrophe in a title) through the function and confirms `new Function(...)`
compiles the result without throwing — don't just eyeball the regex.

## 3. Run tests (`npm run run-tests`, then `npm run report`)

These are "characterization" tests: they never assert, only observe and
record. A "failed" status means the test itself threw (selector not found,
timeout) — it does NOT mean the site is broken. Check `errorMessage`,
`consoleErrors`, and `networkErrors` in `tests/generated/reports/results.json`
regardless of pass/fail status; a "passed" test can still show a 5xx or a
console error worth reporting; `runner/reporter.js` already surfaces both in
`bug_report.md`. Failures auto-retry once (`retried`/`retriedAndFailed`
flags) — a single retry-pass is not evidence of test flakiness on its own.

`npm run report` only calls the LLM if there's something to analyze (hard
errors, failures, or console errors). All-clean runs correctly show
`[analysis not generated]` — that's not a bug.

## 4. Fuzz (`npm run fuzz`, then `npm run fuzz-frontend`)

`npm run fuzz` hits API/HTML-path endpoints inferred from crawl data — works
on any site, no forms required. `npm run fuzz-frontend` only fuzzes forms
that have `fields.length > 0` in the crawl data. A static/demo site with only
empty submit-button forms (no inputs) will correctly report "No forms found
— nothing to fuzz." That's an accurate result, not a failed fuzz run — don't
try to invent fields to fuzz.

## Output map

```
tests/generated/site-maps/{raw/,crawl-summary.json}   crawl output
tests/generated/test-cases/*.cases.json               generated cases
tests/generated/test-data/*.data.json                 generated data
tests/generated/specs/*.spec.js                       generated Playwright specs
tests/generated/reports/{results.json,bug_report.md}  test run + AI analysis
tests/generated/fuzz/reports/{fuzz_results.json,fuzz_report.md}         API fuzz
tests/generated/fuzz/reports/{fuzz_form_results.json,fuzz_form_report.md} form fuzz (if any forms)
```

## Fast path — full non-interactive run

```
npm run crawl && npm run generate && npm run run-tests && npm run report && npm run fuzz && npm run fuzz-frontend
```

Run each command separately when the target site is unfamiliar so you can
actually read the intermediate output (page count, feature/case counts,
pass/fail counts) before moving on — the checks above exist because those
counts silently going to 0 is the main failure mode.

## Site-specific notes: books.toscrape.com

Already characterized — skip re-discovery on repeat runs against this site:

- **No real forms anywhere.** Every "Add to basket" element is a `<form>`
  with `fields: []` (no inputs) — static demo site, no search/login/contact
  form exists. `npm run fuzz-frontend` will always report 0 forms here; this
  is correct, not a gap in the crawl.
- **Real bug, present on every page:** a mixed-content console error —
  `http://ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js` loaded
  over `http://` from an `https://` page, blocked by the browser. Every
  characterization test will show this in `consoleErrors`; it's the one
  finding worth surfacing in every `bug_report.md` from this site.
- **BFS trap applies directly:** there are 51 category pages one hop from
  `/`. With default `maxPages: 30` the crawl never reaches a single product
  detail page. Use `maxPages: 60`+ or seed a product path directly, e.g.
  `/catalogue/a-light-in-the-attic_1000/index.html`.
- API fuzzing here is really HTML-path fuzzing (server-rendered site, no
  XHR/fetch calls) — expect 200s across the board and 0 anomalies; that's
  the correct outcome for a static site.
