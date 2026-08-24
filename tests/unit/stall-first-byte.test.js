// Regression: pipeWithDisconnect first-byte watchdog + abort terminal for Responses clients.
// (1) A hung upstream (zero bytes) trips the shorter firstByteTimeoutMs and the
//     onAbortTerminal payload (response.failed + [DONE]) is emitted downstream.
// (2) Once a chunk has arrived, the first-byte watchdog no longer applies — only
//     the long stall timeout (slow mid-stream thinking must not be aborted early).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(async () => {}),
  trackPendingRequest: vi.fn(),
}));

const { pipeWithDisconnect } = await import("../../open-sse/utils/streamHandler.js");
const { buildAbortedResponsesTerminalBytes } = await import("../../open-sse/utils/responsesStreamHelpers.js");

function makeController() {
  let onAbort = null;
  const controller = {
    signal: { addEventListener: (_e, fn) => { onAbort = fn; }, removeEventListener: () => {}, aborted: false },
    startTime: Date.now(),
    isConnected: () => true,
    handleComplete: vi.fn(),
    handleError: vi.fn(),
    handleDisconnect: vi.fn(),
    abort: () => { controller.signal.aborted = true; onAbort?.(); },
  };
  return controller;
}

// Fake provider response whose body never produces data until aborted
function makeHungResponse() {
  let cancelFn = null;
  const body = new ReadableStream({
    start(controller) {
      cancelFn = () => { try { controller.error(new Error("aborted")); } catch {} };
    },
  });
  return { body, cancel: () => cancelFn?.() };
}

function collect(readable) {
  const chunks = [];
  const reader = readable.getReader();
  return (async function pump() {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return chunks.join("");
      chunks.push(Buffer.from(value).toString("utf8"));
    }
  })().catch(() => chunks.join(""));
}

describe("pipeWithDisconnect first-byte watchdog", () => {
  it("aborts a zero-byte upstream at firstByteTimeoutMs and emits the abort terminal", async () => {
    const controller = makeController();
    const res = makeHungResponse();
    controller.abort = () => { controller.signal.aborted = true; res.cancel(); };

    const passthrough = new TransformStream();
    const out = pipeWithDisconnect(res, passthrough, controller, buildAbortedResponsesTerminalBytes, 5000, 50);

    const text = await collect(out);
    expect(controller.handleError).toHaveBeenCalledWith(expect.objectContaining({ message: "stream stall timeout" }));
    expect(text).toContain("response.failed");
    expect(text).toContain("[DONE]");
  });

  it("does not apply the first-byte watchdog after the first chunk arrives", async () => {
    const controller = makeController();
    // body delivers one chunk, then goes silent forever
    let push = null;
  let cancelFn = null;
    const body = new ReadableStream({
      start(c) { push = c; cancelFn = () => { try { c.error(new Error("aborted")); } catch {} }; },
    });
    const res = { body, cancel: () => cancelFn?.() };
    controller.abort = () => { controller.signal.aborted = true; res.cancel(); };

    const passthrough = new TransformStream();
    const out = pipeWithDisconnect(res, passthrough, controller, null, 120, 40);

    const done = collect(out);
    await new Promise((r) => setTimeout(r, 10));
    push.enqueue(new TextEncoder().encode("data: {\"x\":1}\n\n"));
    await new Promise((r) => setTimeout(r, 60)); // past firstByte window, before stall timeout
    expect(controller.handleError).not.toHaveBeenCalled();

    const text = await done; // stall (120ms) fires later with no further chunks
    expect(controller.handleError).toHaveBeenCalledWith(expect.objectContaining({ message: "stream stall timeout" }));
    expect(text).toContain("x");
  });
});
