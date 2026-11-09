import { describe, expect, test } from "vitest";
import { applySelfEvolutionImplementationTaskStatuses, buildOpsNextActionItems, dedupeSelfEvolutionPackets, extractPacketSection, selfEvolutionImplementationFeedbackStatus, selfEvolutionPacketKey, type DashboardSelfEvolutionPacket, type DashboardState } from "./mission-control";

const note = { label: "run", path: "/tmp/run.md", href: "obsidian://open", exists: true, vaultPath: "run.md", title: "run", markdown: "", sectionId: null };

test("failed source refresh is visible instead of a healthy empty dashboard", () => {
  const state = dashboardState();
  state.snapshot.sources = { workflows: { status: "stale", checkedAt: "2026-11-08", lastSuccessAt: "2026-11-07", error: "ledger unavailable" } };
  expect(buildOpsNextActionItems(state)[0].id).toBe("source-refresh-failed");
});

function dashboardState(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    snapshot: {
      generatedAt: "2026-06-23T12:00:00.000Z",
      tasks: { count: 0, flows: 0, findings: 0, inbox: 0, backlog: 0 },
      ingress: { total: 0, bySource: {} },
      routing: { total: 0, failures: 0, pending: 0, compliant: 0 },
    },
    tasks: [],
    runtimeTasks: [],
    flows: [],
    events: [],
    findings: [],
    memoryHealth: [],
    cronJobs: [],
    cronRuns: [],
    routingAttempts: [],
    routingGroups: [],
    selfEvolution: {
      activeCronId: "retired-cron",
      reviewRoot: "/tmp",
      reviewPacketsDir: "/tmp",
      indexPath: "/tmp/index.md",
      indexExists: true,
      latestNotePath: null,
      latestNoteExists: false,
      latestGeneratedAt: null,
      latestDate: "manual-1",
      allGatesOk: true,
      packetCount: 0,
      reviewTaskId: null,
      reviewTaskStatus: null,
      gates: [],
      mutatingActions: [],
      runs: [],
      packets: [],
      links: {
        index: note,
        latestNote: null,
        curriculum: note,
        systemMap: note,
        valuesModel: note,
        evalCorpus: note,
      },
    },
    roots: { openclawHome: "/tmp/openclaw", tasksRoot: "/tmp/tasks", stateDir: "/tmp/state", dbPath: "/tmp/mc.db" },
    ...overrides,
  };
}

describe("self-evolution mission-control helpers", () => {
  test("returns a proposal section until the next heading", () => {
    const markdown = `# Manual Dual-Entity Self-Evolution Run

## Proposals

### capability-radar-manual-run-artifact

- status: review
- approval_boundary: none

Summary:
Keep capability discovery visible.

### retired-runner-validation-contract

Summary:
Keep retired scheduling out of validation.
`;

    expect(extractPacketSection(markdown, "capability-radar-manual-run-artifact")).toBe(`### capability-radar-manual-run-artifact

- status: review
- approval_boundary: none

Summary:
Keep capability discovery visible.`);
  });

  test("dedupes proposal rows by stable proposal area and propagates status", () => {
    const base = {
      generatedAt: null,
      id: "capability-radar-manual-run-artifact",
      title: "Capability radar for manual runs",
      summary: "Capability radar for manual runs",
      domain: "capability_expansion",
      analyzer: "dual_entity_manual_run",
      owner: "main",
      value: 3,
      risk: "low",
      complexity: "medium",
      status: "review",
      dedupeKey: "capability-radar-manual-run-artifact",
      canonicalKey: "capability-radar-manual-run-artifact",
      approvalClassification: null,
      approvalClass: null,
      evidence: [],
      rollback: null,
      validation: [],
      sourceNote: null,
      note,
      reviewTask: null,
      document: null,
      attic: false,
    } satisfies Omit<DashboardSelfEvolutionPacket, "date" | "dates">;

    const packets = dedupeSelfEvolutionPackets([
      { ...base, date: "manual-1", dates: ["manual-1"], status: "review" },
      { ...base, date: "manual-2", dates: ["manual-2"], status: "done" },
    ]);

    expect(packets).toHaveLength(1);
    expect(packets[0].dates).toEqual(["manual-2", "manual-1"]);
    expect(packets[0].status).toBe("done");
  });

  test("marks proposals done when their implementation task is complete", () => {
    const proposal = {
      date: "manual-1",
      dates: ["manual-1"],
      generatedAt: null,
      id: "retired-runner-validation-contract",
      title: "Retired runner validation contract",
      summary: "Retired runner validation contract",
      domain: "reliability",
      analyzer: "dual_entity_manual_run",
      owner: "main",
      value: 3,
      risk: "low",
      complexity: "medium",
      status: "review",
      dedupeKey: "retired-runner-validation-contract",
      canonicalKey: "retired-runner-validation-contract",
      approvalClassification: null,
      approvalClass: null,
      evidence: [],
      rollback: null,
      validation: [],
      sourceNote: null,
      note,
      reviewTask: null,
      document: null,
      attic: false,
    } satisfies DashboardSelfEvolutionPacket;

    const packets = applySelfEvolutionImplementationTaskStatuses([proposal], new Map([["retired-runner-validation-contract", "done"]]));

    expect(packets[0].status).toBe("done");
  });

  test("marks manual-run proposals done when implementation feedback records an implemented decision", () => {
    expect(
      selfEvolutionImplementationFeedbackStatus({
        proposal_id: "retired-self-evolution-runner-validation-contract",
        implementation_feedback: { decision: "implemented" },
      }),
    ).toBe("done");
  });

  test("hides proposals whose canonical key is in the attic set", () => {
    const proposal = {
      date: "manual-1",
      dates: ["manual-1"],
      generatedAt: null,
      id: "discarded-proposal-test-only",
      title: "Discarded Proposal",
      summary: "Discarded Proposal",
      domain: "reliability",
      analyzer: "dual_entity_manual_run",
      owner: "main",
      value: 3,
      risk: "low",
      complexity: "medium",
      status: "review",
      dedupeKey: "discarded-proposal-test-only",
      canonicalKey: "discarded-proposal-test-only",
      approvalClassification: null,
      approvalClass: null,
      evidence: [],
      rollback: null,
      validation: [],
      sourceNote: null,
      note,
      reviewTask: null,
      document: null,
      attic: false,
    } satisfies DashboardSelfEvolutionPacket;

    expect(dedupeSelfEvolutionPackets([proposal], new Set([selfEvolutionPacketKey(proposal)]))).toEqual([]);
  });

  test("ranks blocked self-evolution proposals before lower-level ops warnings", () => {
    const state = dashboardState({
      snapshot: {
        generatedAt: "2026-06-23T12:00:00.000Z",
        tasks: { count: 0, flows: 0, findings: 0, inbox: 0, backlog: 0 },
        ingress: { total: 0, bySource: {} },
        routing: { total: 3, failures: 1, pending: 0, compliant: 2 },
      },
      selfEvolution: {
        ...dashboardState().selfEvolution,
        packets: [
          {
            date: "manual-1",
            dates: ["manual-1"],
            generatedAt: null,
            id: "ops-next-action-centerline-readonly-card",
            title: "Ops next-action centerline read-only Mission Control card",
            summary: "Rank top ops decisions.",
            domain: "capability_expansion",
            analyzer: "dual_entity_manual_run",
            owner: "main",
            value: 4,
            risk: "medium",
            complexity: "medium",
            status: "blocked",
            dedupeKey: "ops-next-action-centerline-readonly-card",
            canonicalKey: "ops-next-action-centerline-readonly-card",
            approvalClassification: null,
            approvalClass: "ask_before_user_facing",
            approvalRequired: true,
            approvalBoundary: "ask_before_user_facing",
            evidence: [],
            rollback: null,
            validation: [],
            sourceNote: null,
            note,
            reviewTask: null,
            document: null,
            attic: false,
          },
        ],
      },
    });

    const items = buildOpsNextActionItems(state);

    expect(items[0].id).toBe("self-evolution-blocked-ops-next-action-centerline-readonly-card");
    expect(items[0].priority).toBe("critical");
    expect(items[1].source).toBe("routing");
  });

  test("falls back to a read-only no-blocker item when current ops state is clean", () => {
    const items = buildOpsNextActionItems(dashboardState());

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "ops-no-immediate-blocker", priority: "low", href: null });
  });
});
