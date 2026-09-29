# frontend-test-agent-skill

The same [frontend-test-agent](https://github.com/shrad1601/frontend-test-agent) pipeline, plus a Claude Code skill that lets Claude drive the entire thing for you.

---

## What the skill adds

When you open this repo in Claude Code, you can say things like:

> "crawl https://myapp.com and generate tests"
> "act as the frontend test agent"
> "fuzz the forms on the site"

Claude will run the full `crawl → generate → run-tests → report → fuzz` pipeline non-interactively, read intermediate output to verify each stage succeeded, and surface findings in the conversation.

Without the skill, you'd need to run each `npm run ...` step yourself and interpret the output. With it, Claude handles the whole sequence and tells you what it found.

---

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # add your real API key
```

Set your LLM provider in `.env`:

```
LLM_PROVIDER=claude       # or: openai, gemini
ANTHROPIC_API_KEY=sk-...
# OPENAI_API_KEY=sk-...
# GEMINI_API_KEY=...
```

Open the folder in [Claude Code](https://claude.ai/code). The skill is picked up automatically from `.claude/skills/`.

---

## Using the skill

Just describe what you want in Claude Code:

```
Act as the frontend test agent and crawl https://books.toscrape.com
```

```
Crawl the site, generate tests, run them, and give me a bug report
```

```
Fuzz the forms on https://myapp.com
```

Claude will:
1. Check `config.js` and `.env` (and ask you for an API key if missing)
2. Run each pipeline stage in order
3. Read the output files to verify each stage produced results
4. Report findings back to you

---

## Pipeline stages

```
npm run crawl          Playwright crawl — no LLM
npm run generate       LLM writes test cases + Playwright specs
npm run run-tests      Runs generated specs, records observations
npm run report         LLM analyses results, writes bug_report.md
npm run fuzz           API/path fuzz with boundary inputs
npm run fuzz-frontend  Form fuzz with boundary/edge-case inputs
```

See the [base repo](https://github.com/shrad1601/frontend-test-agent) for full documentation on configuration, output structure, and LLM provider setup.

---

## LLM providers

| Provider | Model | Env var |
|---|---|---|
| Claude (default) | claude-sonnet-4-6 | `ANTHROPIC_API_KEY` |
| OpenAI | gpt-4o-mini | `OPENAI_API_KEY` |
| Gemini | gemini-2.0-flash | `GEMINI_API_KEY` |

All providers use `temperature: 0` for deterministic output.

---

## Project structure

```
.claude/skills/act-as-frontend-test-agent/   Claude Code skill definition
crawler/      Playwright-based site crawler
generator/    LLM-powered test case + spec generator
runner/       Runs generated specs, writes results
fuzzer/       API + form fuzzer
server/       Express API for the UI
ui/           React dashboard (Vite)
```
