// Repro: dangling functionCall in openai→antigravity when a tool result is empty/null,
// or when the tool result message is missing entirely. Gemini 400s (INVALID_ARGUMENT)
// on any functionCall part without a paired functionResponse part.
import { describe, it, expect } from "vitest";
import { openaiToAntigravityRequest } from "../../open-sse/translator/request/openai-to-gemini.js";

const SYSTEM = "You are a coding agent.";
const TOOLS = [
  { type: "function", function: { name: "bash", description: "Run a command", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
  { type: "function", function: { name: "edit", description: "Edit a file", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
];

// Collect all functionCall / functionResponse ids across the converted contents
function pairIds(envelope) {
  const calls = [];
  const responses = [];
  for (const c of envelope?.request?.contents || []) {
    for (const p of c.parts || []) {
      if (p.functionCall) calls.push(p.functionCall.id);
      if (p.functionResponse) responses.push(p.functionResponse.id);
    }
  }
  return { calls, responses };
}

function expectFullyPaired(envelope) {
  const { calls, responses } = pairIds(envelope);
  const missing = calls.filter((id) => !responses.includes(id));
  expect(missing, `functionCall ids without functionResponse: ${missing.join(",")}`).toEqual([]);
}

function modelContents(envelope) {
  return (envelope?.request?.contents || []).filter((c) => c.role === "model");
}

describe("openai→antigravity thinking-only turns (Gemini 400 INVALID_ARGUMENT)", () => {
  // A thinking turn truncated before any text/tool call is resent by clients as
  // {content:"", reasoning_content}. Rendered as a MODEL content made solely of
  // thought parts, Antigravity rejects the WHOLE request with 400 — poisoning
  // every later request of the session until compaction removes the turn.
  it("assistant reasoning-only turn is dropped from contents", () => {
    const out = openaiToAntigravityRequest("gemini-3.7-flash-high", {
      model: "x",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "list files" },
        { role: "assistant", content: "", reasoning_content: "I will enumerate the directory with ls and summarize." },
        { role: "user", content: "Reply OK" },
      ],
    }, true, null);
    const models = modelContents(out);
    expect(models.length, "thought-only MODEL content leaked into contents").toBe(0);
  });

  it("assistant reasoning + text keeps the thought parts", () => {
    const out = openaiToAntigravityRequest("gemini-3.7-flash-high", {
      model: "x",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "list files" },
        { role: "assistant", content: "Two files found.", reasoning_content: "Enumerating with ls." },
        { role: "user", content: "Reply OK" },
      ],
    }, true, null);
    const models = modelContents(out);
    expect(models.length).toBe(1);
    expect(models[0].parts.some((p) => p.thought === true)).toBe(true);
    expect(models[0].parts.some((p) => p.text === "Two files found.")).toBe(true);
  });

  it("assistant reasoning + tool_calls keeps the thought parts", () => {
    const out = openaiToAntigravityRequest("gemini-3.7-flash-high", {
      model: "x",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "list files" },
        { role: "assistant", content: "", reasoning_content: "Running ls.", tool_calls: [{ id: "bash-1-0", type: "function", function: { name: "bash", arguments: "{\"command\":\"ls\"}" } }] },
        { role: "tool", tool_call_id: "bash-1-0", content: "file1" },
        { role: "user", content: "Reply OK" },
      ],
      tools: TOOLS,
    }, true, null);
    const models = modelContents(out);
    expect(models.length).toBe(1);
    expect(models[0].parts.some((p) => p.functionCall)).toBe(true);
  });
});

describe("openai→antigravity tool pairing (long-session 400 INVALID_ARGUMENT)", () => {
  it("tool result with empty string content still gets a functionResponse", () => {
    const out = openaiToAntigravityRequest("gemini-3.7-flash-high", {
      model: "x",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "list files" },
        { role: "assistant", content: null, tool_calls: [{ id: "bash-1-0", type: "function", function: { name: "bash", arguments: "{\"command\":\"cd x && npm run build > /dev/null\"}" } }] },
        { role: "tool", tool_call_id: "bash-1-0", content: "" },
        { role: "user", content: "thanks" },
      ],
      tools: TOOLS,
    }, true, null);
    expectFullyPaired(out);
  });

  it("tool result with null content still gets a functionResponse", () => {
    const out = openaiToAntigravityRequest("gemini-3.7-flash-high", {
      model: "x",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "list files" },
        { role: "assistant", content: null, tool_calls: [{ id: "edit-1-0", type: "function", function: { name: "edit", arguments: "{\"path\":\"a.txt\"}" } }] },
        { role: "tool", tool_call_id: "edit-1-0", content: null },
        { role: "user", content: "ok" },
      ],
      tools: TOOLS,
    }, true, null);
    expectFullyPaired(out);
  });

  it("parallel calls where one result is empty keep ALL pairs", () => {
    const out = openaiToAntigravityRequest("gemini-3.7-flash-high", {
      model: "x",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "do two things" },
        { role: "assistant", content: null, tool_calls: [
          { id: "bash-1-0", type: "function", function: { name: "bash", arguments: "{\"command\":\"ls\"}" } },
          { id: "bash-1-1", type: "function", function: { name: "bash", arguments: "{\"command\":\"true\"}" } },
        ] },
        { role: "tool", tool_call_id: "bash-1-0", content: "file1\nfile2" },
        { role: "tool", tool_call_id: "bash-1-1", content: "" },
        { role: "user", content: "continue" },
      ],
      tools: TOOLS,
    }, true, null);
    expectFullyPaired(out);
    const { calls, responses } = pairIds(out);
    expect(calls).toHaveLength(2);
    expect(responses).toHaveLength(2);
  });

  it("assistant tool_call with NO tool result message at all gets a synthetic functionResponse", () => {
    const out = openaiToAntigravityRequest("gemini-3.7-flash-high", {
      model: "x",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "interrupted run" },
        { role: "assistant", content: null, tool_calls: [{ id: "bash-1-0", type: "function", function: { name: "bash", arguments: "{\"command\":\"sleep 999\"}" } }] },
        { role: "user", content: "[interrupted] stop" },
      ],
      tools: TOOLS,
    }, true, null);
    expectFullyPaired(out);
  });

  it("mixed valid history with one empty result stays fully paired (realistic long session)", () => {
    const messages = [{ role: "system", content: SYSTEM }, { role: "user", content: "start" }];
    for (let i = 1; i <= 12; i++) {
      const id = `bash-${i}-0`;
      messages.push({ role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name: "bash", arguments: `{\"command\":\"echo ${i}\"}` } }] });
      messages.push({ role: "tool", tool_call_id: id, content: i === 7 ? "" : `out ${i}` });
    }
    messages.push({ role: "user", content: "summarize" });
    const out = openaiToAntigravityRequest("gemini-3.7-flash-high", { model: "x", messages, tools: TOOLS }, true, null);
    expectFullyPaired(out);
  });
});
