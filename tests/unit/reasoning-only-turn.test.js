// Regression: Gemini-family reasoning-only turns (thought parts, no text/tool,
// finishReason STOP) must NOT terminate Responses streams with response.completed.
// Codex treats an empty completed turn as success and ends the task silently
// (task_complete, last_agent_message: null). Replacing the terminal event with a
// retryable response.failed makes the client re-roll the request instead.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(async () => {}),
  trackPendingRequest: vi.fn(),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
}));

const { createSSEStream } = await import("../../open-sse/utils/stream.js");
const { FORMATS } = await import("../../open-sse/translator/formats.js");

const enc = new TextEncoder();
const BODY = { model: "gemini-3.7-flash-high", input: "build the thing" };

function geminiLine(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

async function runStream(lines) {
  const chunks = [];
  const onStreamComplete = vi.fn();
  const stream = createSSEStream({
    mode: "translate",
    targetFormat: FORMATS.ANTIGRAVITY,
    sourceFormat: FORMATS.OPENAI_RESPONSES,
    provider: "antigravity",
    model: "gemini-3.7-flash-high",
    connectionId: "conn-ronly",
    body: BODY,
    onStreamComplete,
  });
  const reader = stream.readable.getReader();
  const pump = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        chunks.push(Buffer.from(value).toString("utf8"));
      }
    } catch { /* cancelled */ }
  })();
  const writer = stream.writable.getWriter();
  for (const line of lines) await writer.write(enc.encode(line));
  await writer.close();
  await pump;
  return { output: chunks.join(""), onStreamComplete };
}

describe("reasoning-only turn termination (gemini -> openai-responses)", () => {
  it("replaces response.completed with retryable response.failed when the turn is reasoning-only", async () => {
    const { output } = await runStream([
      geminiLine({ candidates: [{ content: { parts: [{ text: "thinking about the task", thought: true }] } }] }),
      geminiLine({ candidates: [{ content: { parts: [{ text: "still thinking", thought: true }] } }] }),
      geminiLine({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 60, thoughtsTokenCount: 60 } }),
    ]);

    expect(output).toContain("response.failed");
    expect(output).toContain("stream_disconnected");
    expect(output).not.toContain("event: response.completed");
    expect(output.trimEnd().endsWith("data: [DONE]")).toBe(true);
  });

  it("replaces response.completed with response.failed when Antigravity wraps candidates in response envelope", async () => {
    const { output } = await runStream([
      geminiLine({ response: { candidates: [{ content: { parts: [{ text: "thinking via antigravity", thought: true }] } }] } }),
      geminiLine({ response: { candidates: [{ content: { parts: [{ text: "more antigravity thought", thought: true }] } }] } }),
      geminiLine({ response: { candidates: [{ content: { parts: [] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 60, thoughtsTokenCount: 60 } } }),
    ]);

    expect(output).toContain("response.failed");
    expect(output).toContain("stream_disconnected");
    expect(output).not.toContain("event: response.completed");
    expect(output.trimEnd().endsWith("data: [DONE]")).toBe(true);
  });

  it("keeps response.completed when the turn produced text", async () => {
    const { output } = await runStream([
      geminiLine({ candidates: [{ content: { parts: [{ text: "deep thought", thought: true }] } }] }),
      geminiLine({ candidates: [{ content: { parts: [{ text: "Here is the result." }] } }] }),
      geminiLine({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40 } }),
    ]);

    expect(output).toContain("event: response.completed");
    expect(output).not.toContain("response.failed");
  });

  it("keeps response.completed when the turn produced a tool call (even with zero text)", async () => {
    const { output } = await runStream([
      geminiLine({ candidates: [{ content: { parts: [{ text: "planning the edit", thought: true }] } }] }),
      geminiLine({ candidates: [{ content: { parts: [{ functionCall: { name: "apply_patch", args: { path: "a.txt" } } }] } }] }),
      geminiLine({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40 } }),
    ]);

    expect(output).toContain("response.completed");
    expect(output).not.toContain("response.failed");
  });

  it("does not synthesize response.failed for genuinely empty turns without reasoning", async () => {
    const { output } = await runStream([
      geminiLine({ candidates: [{ content: { parts: [{ text: "" }] } }] }),
      geminiLine({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 0 } }),
    ]);

    expect(output).not.toContain("response.failed");
  });

  it("embeds token usage in response.completed so clients can track context and compact", async () => {
    const { output } = await runStream([
      geminiLine({ candidates: [{ content: { parts: [{ text: "here is the work" }] } }] }),
      geminiLine({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1234, candidatesTokenCount: 56, totalTokenCount: 1290, thoughtsTokenCount: 12 } }),
    ]);

    const line = output.split("\n").find((l) => l.startsWith("data:") && l.includes('"response.completed"'));
    expect(line).toBeTruthy();
    const data = JSON.parse(line.slice(5).trim());
    expect(data.response.usage).toMatchObject({
      input_tokens: 1234,
      output_tokens: 68, // candidatesTokenCount(56) + thoughtsTokenCount(12), folded by gemini usage extraction
      total_tokens: 1290
    });
    expect(data.response.usage.output_tokens_details.reasoning_tokens).toBe(12);
  });
});
