import { describe, expect, test } from "vitest";
import { DEFAULT_PACKET_AGENT_ID, PACKET_RUNTIME_AGENT_OPTIONS, normalizePacketRuntimeAgent } from "./runtime-agent-catalog";

describe("runtime-agent-catalog", () => {
  test("limits self-evolution packet implementation agents to coding-agent and main", () => {
    expect(DEFAULT_PACKET_AGENT_ID).toBe("coding-agent");
    expect(PACKET_RUNTIME_AGENT_OPTIONS.map((option) => option.id)).toEqual(["coding-agent", "main"]);
  });

  test("normalizes defaults and rejects unsupported implementation agents", () => {
    expect(normalizePacketRuntimeAgent(undefined)).toBe("coding-agent");
    expect(normalizePacketRuntimeAgent("main")).toBe("main");
    expect(() => normalizePacketRuntimeAgent("coding-implementer")).toThrow("Unsupported self-evolution execution agent: coding-implementer");
    expect(() => normalizePacketRuntimeAgent("research-agent")).toThrow("Unsupported self-evolution execution agent: research-agent");
  });
});
