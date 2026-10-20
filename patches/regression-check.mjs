#!/usr/bin/env node
/**
 * regression-check.mjs — behavioural regression gate for the `patched` fork fixes.
 *
 * Runs WITHOUT vitest (the repo has no vitest dependency) by importing the
 * translator sources directly. Verifies the fork-only fixes survive every
 * upstream merge:
 *   - always-pair functionCall/functionResponse (native upstream since v0.5.104)
 *   - hasSubstantiveParts thinking-only drop (fork-only)
 *   - view_image inlineData injection (fork-only)
 *   - normalizeGeminiContents terminal guards + Gemini-4 handling (upstream)
 *
 * The import chain reaches `@/lib/...` aliases (via thoughtSignatureStore →
 * src/lib/db). On Windows a directory junction node_modules/@ → ../src resolves
 * them; this script creates it automatically if missing. Run from repo root:
 *
 *   node patches/regression-check.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Bootstrap the `@` alias junction (idempotent, local-only, node_modules is gitignored).
const junction = path.join(ROOT, "node_modules", "@");
const target = path.join(ROOT, "src");
if (!fs.existsSync(junction)) {
  fs.symlinkSync(target, junction, "junction");
  console.log("(created node_modules/@ junction → src for @/ alias resolution)");
}

const { openaiToAntigravityRequest, openaiToGeminiRequest } = await import(
  pathToFileURL(path.join(ROOT, "open-sse/translator/request/openai-to-gemini.js"))
);
const { normalizeGeminiContents } = await import(
  pathToFileURL(path.join(ROOT, "open-sse/translator/formats/gemini.js"))
);

const TOOLS = [
  { type: "function", function: { name: "bash", description: "Run a command", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
  { type: "function", function: { name: "edit", description: "Edit a file", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
];

function pairIds(envelope) {
  const calls = [], responses = [], imageParts = [];
  for (const c of envelope?.request?.contents || []) {
    for (const p of c.parts || []) {
      if (p.functionCall) calls.push(p.functionCall.id);
      if (p.functionResponse) responses.push(p.functionResponse.id);
      if (p.inlineData) imageParts.push(p);
    }
  }
  return { calls, responses, imageParts };
}

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? " — " + extra : ""}`); }
}

function expectFullyPaired(envelope, name) {
  const { calls, responses } = pairIds(envelope);
  const missing = calls.filter((id) => !responses.includes(id));
  check(name, missing.length === 0, `unpaired call ids: ${missing.join(",")}`);
}

// 1. empty tool result still paired
{
  const out = openaiToAntigravityRequest("gemini-3.8-flash-high", {
    model: "x",
    messages: [
      { role: "system", content: "You are a coding agent." },
      { role: "user", content: "list files" },
      { role: "assistant", content: null, tool_calls: [{ id: "bash-1-0", type: "function", function: { name: "bash", arguments: '{"command":"ls"}' } }] },
      { role: "tool", tool_call_id: "bash-1-0", content: "" },
      { role: "user", content: "thanks" },
    ],
    tools: TOOLS,
  }, true, null);
  expectFullyPaired(out, "empty tool result still gets functionResponse");
}

// 2. null tool result still paired
{
  const out = openaiToAntigravityRequest("gemini-3.8-flash-high", {
    model: "x",
    messages: [
      { role: "system", content: "You are a coding agent." },
      { role: "user", content: "edit file" },
      { role: "assistant", content: null, tool_calls: [{ id: "edit-1-0", type: "function", function: { name: "edit", arguments: '{"path":"a.txt"}' } }] },
      { role: "tool", tool_call_id: "edit-1-0", content: null },
      { role: "user", content: "ok" },
    ],
    tools: TOOLS,
  }, true, null);
  expectFullyPaired(out, "null tool result still gets functionResponse");
}

// 3. parallel calls, one empty → all paired
{
  const out = openaiToAntigravityRequest("gemini-3.8-flash-high", {
    model: "x",
    messages: [
      { role: "system", content: "You are a coding agent." },
      { role: "user", content: "do two things" },
      { role: "assistant", content: null, tool_calls: [
        { id: "bash-1-0", type: "function", function: { name: "bash", arguments: '{"command":"ls"}' } },
        { id: "bash-1-1", type: "function", function: { name: "bash", arguments: '{"command":"true"}' } },
      ] },
      { role: "tool", tool_call_id: "bash-1-0", content: "file1" },
      { role: "tool", tool_call_id: "bash-1-1", content: "" },
      { role: "user", content: "continue" },
    ],
    tools: TOOLS,
  }, true, null);
  expectFullyPaired(out, "parallel calls with one empty result keep ALL pairs");
  const { calls, responses } = pairIds(out);
  check("parallel: 2 calls / 2 responses", calls.length === 2 && responses.length === 2, `calls=${calls.length} responses=${responses.length}`);
}

// 4. tool call with NO result message at all → synthetic response (upstream resp="")
{
  const out = openaiToAntigravityRequest("gemini-3.8-flash-high", {
    model: "x",
    messages: [
      { role: "system", content: "You are a coding agent." },
      { role: "user", content: "interrupted run" },
      { role: "assistant", content: null, tool_calls: [{ id: "bash-1-0", type: "function", function: { name: "bash", arguments: '{"command":"sleep 999"}' } }] },
      { role: "user", content: "[interrupted] stop" },
    ],
    tools: TOOLS,
  }, true, null);
  expectFullyPaired(out, "call with NO result message gets synthetic functionResponse");
}

// 5. thinking-only assistant turn dropped from contents (fork-only fix)
{
  const out = openaiToAntigravityRequest("gemini-3.8-flash-high", {
    model: "x",
    messages: [
      { role: "system", content: "You are a coding agent." },
      { role: "user", content: "list files" },
      { role: "assistant", content: "", reasoning_content: "I will enumerate the directory." },
      { role: "user", content: "Reply OK" },
    ],
  }, true, null);
  const models = (out?.request?.contents || []).filter((c) => c.role === "model");
  check("reasoning-only assistant turn is dropped", models.length === 0, `model contents=${models.length}`);
}

// 6. reasoning + text kept
{
  const out = openaiToAntigravityRequest("gemini-3.8-flash-high", {
    model: "x",
    messages: [
      { role: "system", content: "You are a coding agent." },
      { role: "user", content: "list files" },
      { role: "assistant", content: "Two files found.", reasoning_content: "Enumerating." },
      { role: "user", content: "Reply OK" },
    ],
  }, true, null);
  const models = (out?.request?.contents || []).filter((c) => c.role === "model");
  check("reasoning + text keeps MODEL content", models.length === 1 && models[0].parts.some((p) => p.text === "Two files found."));
}

// 7. view_image: array tool result with data: URL → inlineData part next to functionResponse (fork-only fix)
{
  const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
  const out = openaiToAntigravityRequest("gemini-3.8-flash-high", {
    model: "x",
    messages: [
      { role: "system", content: "You are a coding agent." },
      { role: "user", content: "look at the image" },
      { role: "assistant", content: null, tool_calls: [{ id: "view_image-1-0", type: "function", function: { name: "view_image", arguments: '{"path":"a.png"}' } }] },
      { role: "tool", tool_call_id: "view_image-1-0", content: [
        { type: "image_url", image_url: { url: dataUrl } },
        { type: "text", text: "the screenshot" },
      ] },
      { role: "user", content: "what do you see?" },
    ],
    tools: TOOLS,
  }, true, null);
  expectFullyPaired(out, "view_image turn stays paired");
  const { imageParts } = pairIds(out);
  check("view_image emits inlineData part", imageParts.length === 1 && imageParts[0].inlineData.mime_type === "image/png", `imageParts=${imageParts.length}`);
}

// 8. normalizeGeminiContents: terminal model turn gets a trailing user turn
{
  const out = normalizeGeminiContents([
    { role: "user", parts: [{ text: "hi" }] },
    { role: "model", parts: [{ text: "hello" }] },
  ]);
  check("normalize: terminal model turn gets trailing user turn", out.length === 3 && out[2].role === "user");
}

// 9. normalizeGeminiContents: terminal functionCall gets functionResponse
{
  const out = normalizeGeminiContents([
    { role: "user", parts: [{ text: "run" }] },
    { role: "model", parts: [{ functionCall: { id: "call_1", name: "search", args: { q: "x" } } }] },
  ], "gemini-3.8-flash-high");
  const last = out.at(-1);
  check("normalize: terminal functionCall gets functionResponse", last?.role === "user" && last.parts[0]?.functionResponse?.id === "call_1");
}

// 10. Gemini 4: functionResponse parts move last in merged user turns
{
  const out = normalizeGeminiContents([
    { role: "user", parts: [{ text: "run" }] },
    { role: "model", parts: [{ functionCall: { id: "call_1", name: "s" } }] },
    { role: "user", parts: [{ text: "note" }, { functionResponse: { id: "call_1", name: "s", response: { result: "ok" } } }] },
    { role: "user", parts: [{ text: "continue" }] },
  ], "gemini-4-pro");
  const merged = out.filter((c) => c.role === "user").at(-1);
  const lastPart = merged.parts.at(-1);
  check("gemini-4: functionResponse moves last in merged turn", lastPart?.functionResponse !== undefined, JSON.stringify(lastPart)?.slice(0, 80));
}

// 11. Gemini 4 sampling params dropped, older Gemini keeps them
{
  const g4 = openaiToGeminiRequest("gemini-4-pro", {
    model: "gemini-4-pro",
    messages: [{ role: "user", content: "hi" }],
    temperature: 0.5, top_p: 0.9,
  }, false, null);
  check("gemini-4: temperature/topP dropped", g4?.generationConfig?.temperature === undefined && g4?.generationConfig?.topP === undefined);
  const g3 = openaiToGeminiRequest("gemini-3.8-flash-high", {
    model: "gemini-3.8-flash-high",
    messages: [{ role: "user", content: "hi" }],
    temperature: 0.5,
  }, false, null);
  check("gemini-3: temperature kept", g3?.generationConfig?.temperature === 0.5, JSON.stringify(g3?.generationConfig));
}

console.log(`\nRESULT: ${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
