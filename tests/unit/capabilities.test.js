import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";

describe("getCapabilitiesForModel", () => {
  const claudeSonnet5Expected = {
    contextWindow: 1000000,
    maxOutput: 128000,
    thinkingFormat: "claude-adaptive",
    reasoning: true,
    vision: true,
    search: true,
  };

  const kiroGpt56Expected = {
    contextWindow: 272000,
    maxOutput: 128000,
    thinkingFormat: "openai",
    reasoning: true,
    vision: true,
    search: true,
  };

  it("reports Kiro Claude Opus 5 variants as 1M adaptive-thinking models", () => {
    for (const model of [
      "claude-opus-5",
      "anthropic/claude-opus-5",
      "claude-opus-5-thinking",
      "claude-opus-5-agentic",
      "claude-opus-5-thinking-agentic",
    ]) {
      expect(getCapabilitiesForModel("kiro", model)).toMatchObject(claudeSonnet5Expected);
    }
  });

  it("reports Claude Fable 5.1 as a permanent adaptive-thinking model", () => {
    expect(getCapabilitiesForModel("claude", "claude-fable-5-1")).toMatchObject({
      ...claudeSonnet5Expected,
      thinkingCanDisable: false,
    });
  });

  it("reports Kiro Claude Opus 4.8 as a 1M context model", () => {
    expect(getCapabilitiesForModel("kiro", "claude-opus-4.8").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "anthropic/claude-opus-4.8").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "claude-opus-4-8").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "claude-opus-4.8-thinking").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "claude-opus-4-8-thinking").contextWindow).toBe(1000000);
  });

  it("reports Kiro Claude Sonnet 5 as a 1M adaptive-thinking model", () => {
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "anthropic/claude-sonnet-5")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5-thinking")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5-agentic")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5-thinking-agentic")).toMatchObject(claudeSonnet5Expected);
  });

  it("reports Kiro GPT 5.6 models with the Kiro 272k context window", () => {
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-sol")).toMatchObject(kiroGpt56Expected);
    expect(getCapabilitiesForModel("kiro", "openai/gpt-5.6-sol")).toMatchObject(kiroGpt56Expected);
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-terra-thinking")).toMatchObject(kiroGpt56Expected);
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-luna-agentic")).toMatchObject(kiroGpt56Expected);
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-sol-thinking-agentic")).toMatchObject(kiroGpt56Expected);
  });

  // DeepSeek vision variants (deepseek-v4-flash-vision-exp): reasoning + vision,
  // per DeepSeek's own API listing (input text+image, 1M ctx). Must beat *deepseek-v4*.
  it("reports deepseek vision variants with vision + reasoning", () => {
    for (const model of ["deepseek-v4-flash-vision-exp", "deepseek/deepseek-v4-flash-vision-exp"]) {
      const caps = getCapabilitiesForModel("sumopod", model);
      expect(caps.vision).toBe(true);
      expect(caps.reasoning).toBe(true);
      expect(caps.contextWindow).toBe(1000000);
    }
  });

  // Xiaomi MiMo split (per Xiaomi's own API + models.dev): v2.5 base is the
  // multimodal one; v2.5-pro / v2-pro / v2-flash are text-only — and ALL
  // MiMo LLMs reason. TTS variants are audio-out with no tools.
  it("reports MiMo v2.5 base as multimodal + reasoning", () => {
    const caps = getCapabilitiesForModel("sumopod", "mimo-v2.5");
    expect(caps).toMatchObject({ vision: true, audioInput: true, videoInput: true, reasoning: true, contextWindow: 1048576 });
  });

  it("reports MiMo v2.5 Pro as text-only WITH reasoning", () => {
    for (const model of ["mimo-v2.5-pro", "mimo-v2.5-pro-ultraspeed"]) {
      const caps = getCapabilitiesForModel("sumopod", model);
      expect(caps.vision, `${model} is text-only per Xiaomi spec`).toBe(false);
      expect(caps.reasoning, `${model} reasons per Xiaomi spec`).toBe(true);
      expect(caps.contextWindow).toBe(1048576);
    }
  });

  it("reports MiMo v2 pro / v2 flash as text-only reasoning models", () => {
    expect(getCapabilitiesForModel("xiaomi", "mimo-v2-pro")).toMatchObject({ vision: false, reasoning: true, contextWindow: 1048576 });
    expect(getCapabilitiesForModel("xiaomi", "mimo-v2-flash")).toMatchObject({ vision: false, reasoning: true, contextWindow: 262144 });
  });

  it("keeps MiMo TTS variants audio-out without tools", () => {
    const caps = getCapabilitiesForModel("xiaomi", "mimo-v2.5-tts");
    expect(caps).toMatchObject({ audioOutput: true, tools: false, contextWindow: 8192 });
    expect(caps.reasoning).toBe(false);
  });
});
