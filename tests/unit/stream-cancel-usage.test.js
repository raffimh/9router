// Regression: usage must still be recorded when the client aborts the SSE stream
// mid-flight (DISCONNECT: ResponseAborted — e.g. Codex closing the connection right
// after response.completed). Before the fix, usage finalization only ran in
// flush(), which the Streams spec skips when the readable is cancelled — so
// onStreamComplete/saveUsageStats never fired and token usage never reached the DB.
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
const BODY = { model: "gemini-3.7-flash-high", messages: [{ role: "user", content: "hello" }] };

function geminiChunk(parts, usageMetadata) {
  return JSON.stringify({ candidates: [{ content: { parts } }], usageMetadata });
}

// TransformStream readable has HWM 0 — writes block until read. Attach a
// background pump so write() resolves, then cancel via the reader, mirroring
// createDisconnectAwareStream's reader.cancel() + writer.abort() sequence.
function startPump(readable) {
  const reader = readable.getReader();
  const pumpPromise = (async () => {
    try {
      for (;;) {
        const { done } = await reader.read();
        if (done) return;
      }
    } catch {
      /* cancelled */
    }
  })();
  return { reader, pumpPromise };
}

async function writeAll(writer, lines) {
  for (const line of lines) await writer.write(enc.encode(line));
}

describe("createSSEStream usage finalization on client cancel", () => {
  it("translate mode: records provider usageMetadata when readable is cancelled", async () => {
    const onStreamComplete = vi.fn();
    const stream = createSSEStream({
      mode: "translate",
      targetFormat: FORMATS.GEMINI,
      sourceFormat: FORMATS.OPENAI,
      provider: "antigravity",
      model: "gemini-3.7-flash-high",
      connectionId: "conn-cancel-1",
      body: BODY,
      onStreamComplete,
    });

    const { reader, pumpPromise } = startPump(stream.readable);
    const writer = stream.writable.getWriter();
    await writeAll(writer, [
      `data: ${geminiChunk([{ text: "Hi there" }])}\n\n`,
      `data: ${geminiChunk([{ text: "!" }], { promptTokenCount: 120, candidatesTokenCount: 30 })}\n\n`,
    ]);

    await reader.cancel("ResponseAborted");
    await pumpPromise;

    expect(onStreamComplete).toHaveBeenCalledTimes(1);
    const [, usage] = onStreamComplete.mock.calls[0];
    expect(usage.prompt_tokens).toBe(120);
    expect(usage.completion_tokens).toBe(30);
  });

  it("passthrough mode: records provider usage when readable is cancelled", async () => {
    const onStreamComplete = vi.fn();
    const stream = createSSEStream({
      mode: "passthrough",
      provider: "openai",
      model: "gpt-x",
      connectionId: "conn-cancel-2",
      body: { model: "gpt-x", messages: [{ role: "user", content: "hi" }] },
      onStreamComplete,
    });

    const { reader, pumpPromise } = startPump(stream.readable);
    const writer = stream.writable.getWriter();
    await writeAll(writer, [
      `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Hey" } }] })}\n\n`,
      `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 8, completion_tokens: 4 } })}\n\n`,
    ]);

    await reader.cancel("ResponseAborted");
    await pumpPromise;

    expect(onStreamComplete).toHaveBeenCalledTimes(1);
    const [, usage] = onStreamComplete.mock.calls[0];
    expect(usage.prompt_tokens).toBe(8);
    expect(usage.completion_tokens).toBe(4);
  });

  it("cancel without provider usage estimates from accumulated content", async () => {
    const onStreamComplete = vi.fn();
    const stream = createSSEStream({
      mode: "translate",
      targetFormat: FORMATS.GEMINI,
      sourceFormat: FORMATS.OPENAI,
      provider: "antigravity",
      model: "gemini-3.7-flash-high",
      connectionId: "conn-cancel-3",
      body: BODY,
      onStreamComplete,
    });

    const { reader, pumpPromise } = startPump(stream.readable);
    const writer = stream.writable.getWriter();
    await writeAll(writer, [
      `data: ${geminiChunk([{ text: "A fairly long assistant answer that accumulated content but carried no usage metadata" }])}\n\n`,
    ]);

    await reader.cancel();
    await pumpPromise;

    expect(onStreamComplete).toHaveBeenCalledTimes(1);
    const [accumulated, usage] = onStreamComplete.mock.calls[0];
    expect(accumulated.content).toContain("fairly long");
    expect(usage?.estimated).toBe(true);
    expect(usage.prompt_tokens).toBeGreaterThan(0);
    expect(usage.completion_tokens).toBeGreaterThan(0);
  });

  it("normal close still finalizes exactly once (no double record after the refactor)", async () => {
    const onStreamComplete = vi.fn();
    const stream = createSSEStream({
      mode: "translate",
      targetFormat: FORMATS.GEMINI,
      sourceFormat: FORMATS.OPENAI,
      provider: "antigravity",
      model: "gemini-3.7-flash-high",
      connectionId: "conn-flush-1",
      body: BODY,
      onStreamComplete,
    });

    const { reader, pumpPromise } = startPump(stream.readable);
    const writer = stream.writable.getWriter();
    await writeAll(writer, [
      `data: ${geminiChunk([{ text: "Hi" }], { promptTokenCount: 50, candidatesTokenCount: 10 })}\n\n`,
      "data: [DONE]\n\n",
    ]);
    await writer.close();
    await pumpPromise;

    expect(onStreamComplete).toHaveBeenCalledTimes(1);
    expect(onStreamComplete.mock.calls[0][1].prompt_tokens).toBe(50);
  });
});
