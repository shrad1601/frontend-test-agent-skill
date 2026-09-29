// generator/llm.js
import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "../crawler/loadEnv.js";

loadEnv();

const PROVIDER = (process.env.LLM_PROVIDER || "claude").toLowerCase();
const CLAUDE_MODEL = "claude-sonnet-4-6";
const GEMINI_MODEL = "gemini-2.0-flash";
const OPENAI_MODEL = "gpt-4o-mini"; // cheap + capable enough for our use case

/**
 * Single entry point for all LLM calls across the agent.
 * Set LLM_PROVIDER in .env to "claude", "gemini", or "openai"
 */
export async function llmCall(prompt, options = {}) {
  const maxTokens = options.maxTokens || 1000;

  if (PROVIDER === "gemini") return callGemini(prompt, maxTokens);
  if (PROVIDER === "openai") return callOpenAI(prompt, maxTokens);
  return callClaude(prompt, maxTokens);
}

export function getProvider() {
  return PROVIDER;
}

// ---- Claude ----
async function callClaude(prompt, maxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "dummy") {
    throw new Error('ANTHROPIC_API_KEY is not set in .env');
  }

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    temperature: 0,
    messages: [{ role: "user", content: prompt }]
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// ---- Gemini ----
async function callGemini(prompt, maxTokens) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "dummy") {
    throw new Error('GEMINI_API_KEY is not set in .env');
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0 }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini returned unexpected response: ${JSON.stringify(data)}`);
  }

  return text;
}

// ---- OpenAI ----
async function callOpenAI(prompt, maxTokens) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "dummy") {
    throw new Error('OPENAI_API_KEY is not set in .env');
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      seed: 0,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`OpenAI returned unexpected response: ${JSON.stringify(data)}`);
  }

  return text;
}