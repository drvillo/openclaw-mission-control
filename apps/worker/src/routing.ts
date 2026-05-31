import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { RoutingAttemptSchema, type RoutingAttempt } from "@ocmc/shared";

type RoutingPolicyRule = {
  id: string;
  policyDomain: string;
  expectedTargetAgent: string;
  match?: {
    any?: string[];
    all?: string[];
    none?: string[];
  };
  wrongTools?: string[];
  directExecPatterns?: string[];
};

type RoutingPolicyConfig = {
  rules: RoutingPolicyRule[];
};

type RequestContext = {
  groupKey: string;
  messageId: string;
  excerpt: string;
  timestamp: string;
  rule: RoutingPolicyRule | null;
};

type RoutingAttemptDraft = Omit<RoutingAttempt, "rawJson"> & {
  evidence: Record<string, unknown>;
  sequence: number;
};

type GatewayIncompleteTurn = {
  sessionId: string;
  runId: string;
  timestamp: string;
  line: string;
};

const ROUTING_POLICY_PATH = new URL("../../../config/agent-routing.json", import.meta.url);
const REQUEST_EXCERPT_LIMIT = 180;

function clipText(text: string, limit = REQUEST_EXCERPT_LIMIT): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function loadRoutingPolicy(): RoutingPolicyConfig {
  const raw = readFileSync(ROUTING_POLICY_PATH, "utf8");
  const parsed = safeJsonParse(raw) as RoutingPolicyConfig | null;
  return parsed && Array.isArray(parsed.rules) ? parsed : { rules: [] };
}

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesPatterns(patterns: string[] | undefined, text: string, mode: "any" | "all"): boolean {
  if (!patterns || patterns.length === 0) {
    return true;
  }
  const results = patterns.map((pattern) => new RegExp(pattern, "iu").test(text));
  return mode === "all" ? results.every(Boolean) : results.some(Boolean);
}

function findMatchingRule(text: string, rules: RoutingPolicyRule[]): RoutingPolicyRule | null {
  const normalized = normalizeText(text);
  for (const rule of rules) {
    const match = rule.match ?? {};
    if (!matchesPatterns(match.all, normalized, "all")) {
      continue;
    }
    if (!matchesPatterns(match.any, normalized, "any")) {
      continue;
    }
    if ((match.none ?? []).some((pattern) => new RegExp(pattern, "iu").test(normalized))) {
      continue;
    }
    return rule;
  }
  return null;
}

function extractTextParts(message: { content?: Array<{ type?: string; text?: string }> } | undefined): string {
  return (message?.content ?? [])
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

function extractRequestText(raw: string): string {
  const stripped = raw
    .replace(/Conversation info \(untrusted metadata\):[\s\S]*?```[\s\S]*?```/giu, "")
    .replace(/Sender \(untrusted metadata\):[\s\S]*?```[\s\S]*?```/giu, "")
    .trim();
  const lines = stripped
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "```");
  return lines.at(-1) ?? stripped;
}

function isInternalContext(raw: string): boolean {
  return raw.includes("<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>");
}

function isLikelyAffirmation(text: string): boolean {
  const normalized = normalizeText(text);
  return /^(yes|yeah|yep|sure|ok|okay|please do|do it|go ahead|send it|continue|proceed)\b/.test(normalized);
}

function isLikelyContinuation(text: string): boolean {
  const normalized = normalizeText(text);
  return /^(it('|’)s|its|here|there|in |at |from |use |that one|this one|the file|~\/|\/users\/)/.test(normalized);
}

function parseToolResultDetails(record: Record<string, unknown>): Record<string, unknown> {
  const message = (record.message ?? {}) as Record<string, unknown>;
  const details = message.details;
  if (details && typeof details === "object") {
    return details as Record<string, unknown>;
  }
  const content = Array.isArray(message.content) ? message.content : [];
  const firstText = content.find(
    (item) => item && typeof item === "object" && (item as { type?: string }).type === "text",
  ) as { text?: string } | undefined;
  if (typeof firstText?.text === "string") {
    const parsed = safeJsonParse(firstText.text);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  }
  return {};
}

function parseTimestamp(value: string | undefined): number {
  if (!value) {
    return Number.NaN;
  }
  return Date.parse(value);
}

function parseGatewayEvidence(openClawHome: string): { incompleteTurns: GatewayIncompleteTurn[] } {
  const logPath = path.join(openClawHome, "logs", "gateway.err.log");
  if (!existsSync(logPath)) {
    return { incompleteTurns: [] };
  }

  const incompleteTurns: GatewayIncompleteTurn[] = [];
  const lines = readFileSync(logPath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(
      /^(\S+)\s+\[agent\/embedded\] incomplete turn detected: runId=([^\s]+) sessionId=([^\s]+)\s+(.*)$/u,
    );
    if (!match) {
      continue;
    }
    incompleteTurns.push({
      timestamp: match[1],
      runId: match[2],
      sessionId: match[3],
      line,
    });
  }

  return { incompleteTurns };
}

function parseInternalCompletion(raw: string): {
  childSessionKey: string;
  childSessionId: string | null;
  status: string;
  task: string | null;
  resultSummary: string | null;
} | null {
  if (!raw.includes("[Internal task completion event]")) {
    return null;
  }
  const sessionKey = raw.match(/session_key:\s*(.+)/u)?.[1]?.trim();
  if (!sessionKey) {
    return null;
  }
  const sessionId = raw.match(/session_id:\s*(.+)/u)?.[1]?.trim() ?? null;
  const status = raw.match(/status:\s*(.+)/u)?.[1]?.trim() ?? "unknown";
  const task = raw.match(/task:\s*(.+)/u)?.[1]?.trim() ?? null;
  const resultMatch = raw.match(/<<<BEGIN_UNTRUSTED_CHILD_RESULT>>>\n?([\s\S]*?)\n?<<<END_UNTRUSTED_CHILD_RESULT>>>/u);
  const resultSummary = resultMatch?.[1] ? clipText(resultMatch[1], 220) : null;
  return {
    childSessionKey: sessionKey,
    childSessionId: sessionId,
    status,
    task,
    resultSummary,
  };
}

function statusFromToolResult(details: Record<string, unknown>): string {
  const status = typeof details.status === "string" ? details.status : null;
  if (status) {
    return status === "accepted" ? "awaiting_completion" : status;
  }
  if (typeof details.exitCode === "number") {
    return details.exitCode === 0 ? "completed" : "failed";
  }
  return "completed";
}

function createDraft(input: {
  routingId: string;
  recordedAt: string;
  sourceAgent: string;
  sourceSessionId: string;
  sourceMessageId: string;
  requestGroupKey: string;
  requestExcerpt: string;
  policyRuleId?: string | null;
  policyDomain?: string | null;
  expectedTargetAgent?: string | null;
  actualTargetAgent?: string | null;
  mechanism: string;
  toolCallId?: string | null;
  accepted?: boolean | null;
  childSessionKey?: string | null;
  childSessionId?: string | null;
  runId?: string | null;
  status: string;
  completionSummary?: string | null;
  failureMode: RoutingAttempt["failureMode"];
  recoveryMode?: RoutingAttempt["recoveryMode"];
  complianceStatus?: RoutingAttempt["complianceStatus"];
  evidence: Record<string, unknown>;
  sequence: number;
}): RoutingAttemptDraft {
  return {
    routingId: input.routingId,
    recordedAt: input.recordedAt,
    sourceAgent: input.sourceAgent,
    sourceSessionId: input.sourceSessionId,
    sourceMessageId: input.sourceMessageId,
    requestGroupKey: input.requestGroupKey,
    requestExcerpt: input.requestExcerpt,
    policyRuleId: input.policyRuleId ?? null,
    policyDomain: input.policyDomain ?? null,
    expectedTargetAgent: input.expectedTargetAgent ?? null,
    actualTargetAgent: input.actualTargetAgent ?? null,
    mechanism: input.mechanism,
    toolCallId: input.toolCallId ?? null,
    accepted: input.accepted ?? null,
    childSessionKey: input.childSessionKey ?? null,
    childSessionId: input.childSessionId ?? null,
    runId: input.runId ?? null,
    status: input.status,
    completionSummary: input.completionSummary ?? null,
    failureMode: input.failureMode,
    recoveryMode: input.recoveryMode ?? "none",
    complianceStatus: input.complianceStatus ?? "unknown",
    evidence: input.evidence,
    sequence: input.sequence,
  };
}

function evaluateCompliance(draft: RoutingAttemptDraft): RoutingAttempt["complianceStatus"] {
  if (!draft.expectedTargetAgent) {
    return "unknown";
  }
  if (draft.failureMode === "direct_fallback") {
    return draft.actualTargetAgent === draft.expectedTargetAgent ? "fallback" : "violation";
  }
  if (draft.failureMode === "wrong_tool" || draft.failureMode === "redundant_reconfirmation") {
    return "violation";
  }
  if (!draft.actualTargetAgent) {
    return "unknown";
  }
  return draft.actualTargetAgent === draft.expectedTargetAgent ? "compliant" : "violation";
}

function findSessionFiles(sessionRoot: string): string[] {
  if (!existsSync(sessionRoot)) {
    return [];
  }
  return readdirSync(sessionRoot)
    .filter((name) => /^.+\.jsonl(?:\.reset\..+)?$/u.test(name))
    .sort()
    .map((name) => path.join(sessionRoot, name));
}

function parseSessionFile(filePath: string, rules: RoutingPolicyRule[], gateway: { incompleteTurns: GatewayIncompleteTurn[] }): RoutingAttemptDraft[] {
  const lines = readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  let sessionId = path.basename(filePath).split(".jsonl")[0];
  let currentRequest: RequestContext | null = null;
  let sequence = 0;
  const drafts: RoutingAttemptDraft[] = [];
  const pendingByToolCallId = new Map<string, RoutingAttemptDraft>();

  for (const line of lines) {
    const record = safeJsonParse(line) as Record<string, unknown> | null;
    if (!record) {
      continue;
    }
    if (record.type === "session" && typeof record.id === "string") {
      sessionId = record.id;
      continue;
    }

    const timestamp = typeof record.timestamp === "string" ? record.timestamp : new Date().toISOString();
    const message = (record.message ?? {}) as Record<string, unknown>;
    const role = typeof message.role === "string" ? message.role : null;
    const content = Array.isArray(message.content) ? message.content : [];
    const text = extractTextParts(message as { content?: Array<{ type?: string; text?: string }> });

    if (role === "user" && text) {
      if (isInternalContext(text)) {
        const completion = parseInternalCompletion(text);
        if (completion) {
          const attempt = [...drafts]
            .reverse()
            .find((draft) => draft.childSessionKey === completion.childSessionKey || draft.childSessionId === completion.childSessionId);
          if (attempt) {
            attempt.childSessionId = completion.childSessionId;
            attempt.status = /completed successfully/iu.test(completion.status) ? "completed" : "failed";
            attempt.completionSummary = completion.resultSummary ?? completion.status;
            attempt.evidence.completionEvent = completion;
          }
        }
        continue;
      }

      const requestText = extractRequestText(text);
      const rule = findMatchingRule(requestText, rules);
      if (rule || (!isLikelyAffirmation(requestText) && !isLikelyContinuation(requestText))) {
        currentRequest = {
          groupKey: `${sessionId}:${String(record.id ?? "message")}`,
          messageId: String(record.id ?? "message"),
          excerpt: clipText(requestText),
          timestamp,
          rule,
        };
      }
      continue;
    }

    if (role === "assistant") {
      for (const part of content) {
        if (!part || typeof part !== "object" || (part as { type?: string }).type !== "toolCall") {
          continue;
        }
        const toolCall = part as {
          id?: string;
          name?: string;
          arguments?: Record<string, unknown>;
        };
        const toolCallId = typeof toolCall.id === "string" ? toolCall.id : `tool-${sequence + 1}`;
        const toolName = typeof toolCall.name === "string" ? toolCall.name : "unknown";
        const args = (toolCall.arguments ?? {}) as Record<string, unknown>;
        const request = currentRequest ?? {
          groupKey: `${sessionId}:${String(record.id ?? "message")}`,
          messageId: String(record.id ?? "message"),
          excerpt: "No matched user request",
          timestamp,
          rule: null,
        };

        if (toolName === "sessions_spawn") {
          sequence += 1;
          const actualTargetAgent = typeof args.agentId === "string" ? args.agentId : null;
          const draft = createDraft({
            routingId: `${sessionId}:routing:${sequence}`,
            recordedAt: timestamp,
            sourceAgent: "main",
            sourceSessionId: sessionId,
            sourceMessageId: request.messageId,
            requestGroupKey: request.groupKey,
            requestExcerpt: request.excerpt,
            policyRuleId: request.rule?.id ?? null,
            policyDomain: request.rule?.policyDomain ?? null,
            expectedTargetAgent: request.rule?.expectedTargetAgent ?? null,
            actualTargetAgent,
            mechanism: "spawn",
            toolCallId,
            status: "spawn_requested",
            failureMode: "none",
            evidence: {
              request,
              toolCall: {
                name: toolName,
                arguments: args,
              },
            },
            sequence,
          });
          drafts.push(draft);
          pendingByToolCallId.set(toolCallId, draft);
          continue;
        }

        if (toolName === "message" && request.rule?.wrongTools?.includes("message")) {
          sequence += 1;
          const draft = createDraft({
            routingId: `${sessionId}:routing:${sequence}`,
            recordedAt: timestamp,
            sourceAgent: "main",
            sourceSessionId: sessionId,
            sourceMessageId: request.messageId,
            requestGroupKey: request.groupKey,
            requestExcerpt: request.excerpt,
            policyRuleId: request.rule.id,
            policyDomain: request.rule.policyDomain,
            expectedTargetAgent: request.rule.expectedTargetAgent,
            actualTargetAgent: "tool:message",
            mechanism: "tool",
            toolCallId,
            status: "tool_requested",
            failureMode: "wrong_tool",
            evidence: {
              request,
              toolCall: {
                name: toolName,
                arguments: args,
              },
            },
            sequence,
          });
          drafts.push(draft);
          pendingByToolCallId.set(toolCallId, draft);
          continue;
        }

        if (toolName === "exec" && request.rule?.directExecPatterns?.some((pattern) => String(args.command ?? "").includes(pattern))) {
          sequence += 1;
          const draft = createDraft({
            routingId: `${sessionId}:routing:${sequence}`,
            recordedAt: timestamp,
            sourceAgent: "main",
            sourceSessionId: sessionId,
            sourceMessageId: request.messageId,
            requestGroupKey: request.groupKey,
            requestExcerpt: request.excerpt,
            policyRuleId: request.rule.id,
            policyDomain: request.rule.policyDomain,
            expectedTargetAgent: request.rule.expectedTargetAgent,
            actualTargetAgent: request.rule.expectedTargetAgent,
            mechanism: "direct_exec",
            toolCallId,
            status: "direct_exec_requested",
            failureMode: "direct_fallback",
            recoveryMode: "fallback_direct_exec",
            evidence: {
              request,
              toolCall: {
                name: toolName,
                arguments: args,
              },
            },
            sequence,
          });
          drafts.push(draft);
          pendingByToolCallId.set(toolCallId, draft);
        }
      }

      if (text && currentRequest?.rule) {
        const expectedAgentName = currentRequest.rule.expectedTargetAgent.replace(/-/gu, " ");
        const isReconfirmation =
          currentRequest.rule.policyDomain === "mail" &&
          new RegExp(`\\b(mail agent|${expectedAgentName})\\b`, "iu").test(text) &&
          /\b(would you like|do you want|should i)\b/iu.test(text);

        if (isReconfirmation) {
          sequence += 1;
          drafts.push(
            createDraft({
              routingId: `${sessionId}:routing:${sequence}`,
              recordedAt: timestamp,
              sourceAgent: "main",
              sourceSessionId: sessionId,
              sourceMessageId: currentRequest.messageId,
              requestGroupKey: currentRequest.groupKey,
              requestExcerpt: currentRequest.excerpt,
              policyRuleId: currentRequest.rule.id,
              policyDomain: currentRequest.rule.policyDomain,
              expectedTargetAgent: currentRequest.rule.expectedTargetAgent,
              actualTargetAgent: "main",
              mechanism: "user_prompt",
              status: "needs_user_input",
              completionSummary: clipText(text, 220),
              failureMode: "redundant_reconfirmation",
              evidence: {
                request: currentRequest,
                assistantPrompt: text,
              },
              sequence,
            }),
          );
        }
      }

      continue;
    }

    if (role === "toolResult") {
      const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : "";
      const draft = pendingByToolCallId.get(toolCallId);
      if (!draft) {
        continue;
      }
      const details = parseToolResultDetails(record);
      draft.evidence.toolResult = details;
      draft.status = statusFromToolResult(details);
      if (typeof details.runId === "string") {
        draft.runId = details.runId;
      }
      if (typeof details.childSessionKey === "string") {
        draft.childSessionKey = details.childSessionKey;
      }
      if (typeof details.childSessionId === "string") {
        draft.childSessionId = details.childSessionId;
      }
      if (typeof details.status === "string" && (details.status === "accepted" || details.status === "rejected")) {
        draft.accepted = details.status === "accepted";
      }
      const summary = typeof details.error === "string" ? details.error : typeof details.aggregated === "string" ? details.aggregated : null;
      if (summary) {
        draft.completionSummary = clipText(summary, 220);
      }
      pendingByToolCallId.delete(toolCallId);
    }
  }

  const incompleteTurns = gateway.incompleteTurns.filter((entry) => entry.sessionId === sessionId);
  for (const incompleteTurn of incompleteTurns) {
    const turnTime = parseTimestamp(incompleteTurn.timestamp);
    const candidate = [...drafts]
      .reverse()
      .find((draft) => {
        if (draft.mechanism !== "spawn" || draft.accepted !== true) {
          return false;
        }
        const draftTime = parseTimestamp(draft.recordedAt);
        if (Number.isNaN(draftTime) || Number.isNaN(turnTime)) {
          return draft.sourceSessionId === incompleteTurn.sessionId;
        }
        return turnTime >= draftTime && turnTime - draftTime <= 60_000;
      });
    if (candidate) {
      candidate.failureMode = "incomplete_turn";
      candidate.completionSummary = clipText(incompleteTurn.line, 220);
      candidate.evidence.gatewayIncompleteTurn = incompleteTurn;
    }
  }

  for (const draft of drafts) {
    if (draft.mechanism === "spawn" && draft.accepted === true && draft.status === "awaiting_completion") {
      draft.failureMode = draft.failureMode === "incomplete_turn" ? draft.failureMode : "accepted_no_completion";
    }
    if (draft.failureMode === "incomplete_turn" && draft.status === "completed" && draft.recoveryMode === "none") {
      draft.recoveryMode = "auto_recovered";
    }
    draft.complianceStatus = evaluateCompliance(draft);
  }

  const byGroup = drafts.reduce<Map<string, RoutingAttemptDraft[]>>((groups, draft) => {
    const group = groups.get(draft.requestGroupKey) ?? [];
    group.push(draft);
    groups.set(draft.requestGroupKey, group);
    return groups;
  }, new Map());

  for (const group of byGroup.values()) {
    const recovered = group.some(
      (draft) => draft.complianceStatus === "compliant" && (draft.status === "completed" || draft.status === "awaiting_completion"),
    );
    const usedReconfirmation = group.some((draft) => draft.failureMode === "redundant_reconfirmation");
    if (!recovered) {
      continue;
    }
    for (const draft of group) {
      if (draft.failureMode === "none" || draft.recoveryMode !== "none") {
        continue;
      }
      if (draft.failureMode === "direct_fallback") {
        continue;
      }
      draft.recoveryMode = usedReconfirmation ? "user_reprompted" : "auto_recovered";
    }
  }

  return drafts;
}

export function collectRoutingAttempts(openClawHome: string): RoutingAttempt[] {
  const sessionRoot = path.join(openClawHome, "agents", "main", "sessions");
  const rules = loadRoutingPolicy().rules ?? [];
  const gateway = parseGatewayEvidence(openClawHome);
  const drafts = findSessionFiles(sessionRoot).flatMap((filePath) => parseSessionFile(filePath, rules, gateway));

  return drafts
    .sort((left, right) => {
      const byTime = parseTimestamp(right.recordedAt) - parseTimestamp(left.recordedAt);
      if (byTime !== 0) {
        return byTime;
      }
      return right.sequence - left.sequence;
    })
    .map((draft) =>
      RoutingAttemptSchema.parse({
        ...draft,
        rawJson: JSON.stringify(draft.evidence, null, 2),
      }),
    );
}
