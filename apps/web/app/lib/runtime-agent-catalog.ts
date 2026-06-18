export type RuntimeAgentOption = {
  id: string;
  label: string;
  description: string;
  searchText: string;
};

export const DEFAULT_PACKET_AGENT_ID = "coding-agent";
export const DEFAULT_PACKET_AGENT_REASON = "coding-agent because this packet requires code changes, tests, and implementation follow-through.";

export const PACKET_RUNTIME_AGENT_OPTIONS: RuntimeAgentOption[] = [
  {
    id: "coding-agent",
    label: "coding-agent",
    description: "Default implementation orchestrator for code-change packets.",
    searchText: "coding-agent implementation code tests default orchestrator",
  },
  {
    id: "main",
    label: "main",
    description: "Use the main agent session for implementation follow-through.",
    searchText: "main implementation primary agent",
  },
];

const PACKET_RUNTIME_AGENT_ID_SET = new Set(PACKET_RUNTIME_AGENT_OPTIONS.map((option) => option.id));

export function isAllowedPacketRuntimeAgent(agentId: string) {
  return PACKET_RUNTIME_AGENT_ID_SET.has(agentId);
}

export function normalizePacketRuntimeAgent(agentId: string | undefined) {
  const normalized = agentId?.trim() || DEFAULT_PACKET_AGENT_ID;
  if (!isAllowedPacketRuntimeAgent(normalized)) {
    throw new Error(`Unsupported self-evolution execution agent: ${normalized}`);
  }
  return normalized;
}

export function packetRuntimeAgentReason(agentId: string) {
  if (agentId === DEFAULT_PACKET_AGENT_ID) {
    return DEFAULT_PACKET_AGENT_REASON;
  }
  const option = PACKET_RUNTIME_AGENT_OPTIONS.find((item) => item.id === agentId);
  return option?.description ?? `User override to ${agentId}.`;
}
