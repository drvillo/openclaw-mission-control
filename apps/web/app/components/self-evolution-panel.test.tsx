import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SelfEvolutionPanel } from "./self-evolution-panel";

const dayNoteDocument = {
  label: "Review packets · 2026-06-08",
  title: "Self-Evolution Review Packets - 2026-06-08",
  path: "/vault/System/OpenClaw Self-Evolution/Review Packets/2026-06-08.md",
  vaultPath: "System/OpenClaw Self-Evolution/Review Packets/2026-06-08.md",
  href: "obsidian://open?vault=test&file=System%2FOpenClaw%20Self-Evolution%2FReview%20Packets%2F2026-06-08",
  exists: true,
  markdown:
    "# Self-Evolution Review Packets - 2026-06-08\n\n## Review packets\n\n### mcpo-20260608-exec-allowlist - Harden async native-maintenance exec allowlist compatibility\n\nObserved issue:\nSee [[Tasks/Task Inbox#Review supervised self-evolution packets - 2026-06-08|task-20260608-001]].",
  sectionId: null,
};

function buildSelfEvolutionState(): Parameters<typeof SelfEvolutionPanel>[0]["selfEvolution"] {
  return {
    latestDate: "2026-06-08",
    latestGeneratedAt: "2026-06-08T01:00:22.365269+00:00",
    allGatesOk: true,
    packetCount: 1,
    reviewTaskId: "task-20260608-001",
    reviewTaskStatus: "next",
    gates: [{ name: "facts_ok", ok: true }],
    runs: [
      {
        date: "2026-06-08",
        generatedAt: "2026-06-08T01:00:22.365269+00:00",
        allGatesOk: true,
        packetCount: 1,
        reviewTask: {
          id: "task-20260608-001",
          title: "Review supervised self-evolution packets - 2026-06-08",
          status: "next",
          detailsRef: null,
          resultsRef: null,
          wikiRef: null,
        },
        gates: [{ name: "facts_ok", ok: true }],
        mutatingActions: [{ kind: "obsidian_review_packet_write", target: "/vault/review-packets/2026-06-08.md" }],
        note: dayNoteDocument,
        packets: [
          {
            date: "2026-06-08",
            dates: ["2026-06-08", "2026-06-07"],
            generatedAt: "2026-06-08T01:00:22.365269+00:00",
            id: "mcpo-20260608-exec-allowlist",
            title: "Harden async native-maintenance exec allowlist compatibility",
            summary: "Harden async native-maintenance exec allowlist compatibility",
            domain: "runtime_system",
            analyzer: "mission_control_product",
            owner: "main",
            value: 4,
            risk: "medium",
            complexity: "medium",
            status: "review",
            dedupeKey: "exec-allowlist",
            canonicalKey: "exec-allowlist",
            approvalClassification: "operator approval required",
            approvalClass: "operator approval required",
            evidence: ["task-20260608-001"],
            rollback: "Discard the canonical improvement note.",
            validation: ["Run reconciliation preview."],
            sourceNote: "/vault/System/OpenClaw Self-Evolution/Review Packets/2026-06-08.md",
            note: dayNoteDocument,
            reviewTask: {
              id: "task-20260608-001",
              title: "Review supervised self-evolution packets - 2026-06-08",
              status: "next",
              detailsRef: null,
              resultsRef: null,
              wikiRef: null,
            },
            attic: false,
            document: {
              ...dayNoteDocument,
              label: "mcpo-20260608-exec-allowlist · Harden async native-maintenance exec allowlist compatibility",
              title: "mcpo-20260608-exec-allowlist · Harden async native-maintenance exec allowlist compatibility",
              markdown:
                "### mcpo-20260608-exec-allowlist - Harden async native-maintenance exec allowlist compatibility\n\nObserved issue:\nSee [[Tasks/Task Inbox#Review supervised self-evolution packets - 2026-06-08|task-20260608-001]].",
              sectionId: "mcpo-20260608-exec-allowlist",
            },
          },
        ],
      },
    ],
    packets: [],
    mutatingActions: [{ kind: "obsidian_review_packet_write", target: "/vault/review-packets/2026-06-08.md" }],
    links: {
      latestNote: dayNoteDocument,
      index: {
        label: "Review Packets Index",
        title: "Review Packets Index",
        path: "/vault/System/OpenClaw Self-Evolution/Review Packets/Index.md",
        vaultPath: "System/OpenClaw Self-Evolution/Review Packets/Index.md",
        href: "obsidian://open?vault=test&file=System%2FOpenClaw%20Self-Evolution%2FReview%20Packets%2FIndex",
        exists: true,
        markdown: "# OpenClaw Self-Evolution Review Packets",
        sectionId: null,
      },
      curriculum: {
        ...dayNoteDocument,
        label: "Curriculum",
        title: "Curriculum",
        path: "/vault/curriculum.md",
        vaultPath: "System/OpenClaw Memory/Self-Evolution/Capability Curriculum and Backlog.md",
        markdown: "# Curriculum",
      },
      systemMap: {
        ...dayNoteDocument,
        label: "System map",
        title: "System map",
        path: "/vault/system-map.md",
        vaultPath: "System/OpenClaw Memory/Self-Evolution/System Map.md",
        markdown: "# System Map",
      },
      valuesModel: {
        ...dayNoteDocument,
        label: "Values model",
        title: "Values model",
        path: "/vault/values-model.md",
        vaultPath: "System/OpenClaw Memory/Self-Evolution/Values Model.md",
        markdown: "# Values Model",
      },
      evalCorpus: {
        ...dayNoteDocument,
        label: "Eval corpus",
        title: "Eval corpus",
        path: "/vault/eval-corpus.md",
        vaultPath: "System/OpenClaw Memory/Self-Evolution/Evaluation Corpus.md",
        markdown: "# Evaluation Corpus",
      },
    },
  };
}

describe("SelfEvolutionPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("opens the focused day note in the native markdown modal", () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.packets = selfEvolution.runs[0].packets;

    render(
      <SelfEvolutionPanel
        selfEvolution={selfEvolution}
        cronJob={{ lastRunStatus: "success", lastRunAtMs: 1717804800000, nextRunAtMs: 1717891200000 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open day note" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review packets · 2026-06-08" })).toBeInTheDocument();
    expect(screen.getAllByText("Self-Evolution Review Packets - 2026-06-08")).toHaveLength(2);
  });

  test("filters to a day view and exposes packet and task deep links", () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.packets = selfEvolution.runs[0].packets;

    render(
      <SelfEvolutionPanel
        selfEvolution={selfEvolution}
        cronJob={null}
        selectedDate="2026-06-08"
        selectedPacketId="mcpo-20260608-exec-allowlist"
      />,
    );

    expect(screen.getByText("Focused day view for supervised self-evolution improvements.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "task-20260608-001" })[0]).toHaveAttribute("href", "/work/tasks/task-20260608-001");
    expect(screen.getByRole("link", { name: /mon, 8 jun 2026/i })).toHaveAttribute("href", "/self-evolution/day/2026-06-08?packet=mcpo-20260608-exec-allowlist");
    expect(screen.getByRole("link", { name: "Open review task" })).toHaveAttribute("href", "/work/tasks/task-20260608-001");
    expect(screen.queryByRole("link", { name: "Focus day" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open packet note" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "task-20260608-001" }).length).toBeGreaterThan(0);
  });

  test("includes deduped packets in every linked day view", () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.packets = selfEvolution.runs[0].packets;

    render(<SelfEvolutionPanel selfEvolution={selfEvolution} cronJob={null} selectedDate="2026-06-07" />);

    expect(screen.getByText("Harden async native-maintenance exec allowlist compatibility")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /2 days · sun, 7 jun 2026/i })).toHaveAttribute("href", "/self-evolution/day/2026-06-07?packet=mcpo-20260608-exec-allowlist");
  });

  test("shows a single launch control with the limited agent selector for packets", () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.packets = selfEvolution.runs[0].packets;

    render(<SelfEvolutionPanel selfEvolution={selfEvolution} cronJob={null} />);

    expect(screen.getByText("Review")).toHaveClass("meeting-review-status", "meeting-review-status-needs_review");
    expect(screen.queryByRole("button", { name: "Implement" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.getByText(/2 days/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /mcpo-20260608-exec-allowlist/i }).at(-1)!);

    expect(screen.queryByRole("button", { name: /Agent:/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Implementation agent|Model/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^model$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept with coding-agent/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept with" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Accept with" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Launch agent" }));

    expect(screen.getAllByRole("option").map((option) => option.textContent?.replace("✓", "").trim())).toEqual(["coding-agent", "main"]);
  });

  test("does not render implementation controls for packets that are done", () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.runs[0].packets[0].status = "done";
    selfEvolution.packets = selfEvolution.runs[0].packets;

    render(<SelfEvolutionPanel selfEvolution={selfEvolution} cronJob={null} selectedDate="2026-06-08" />);

    expect(screen.getByText("Done")).toHaveClass("meeting-review-status", "meeting-review-status-accepted");
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /mcpo-20260608-exec-allowlist/i }).at(-1)!);

    expect(screen.queryByRole("button", { name: /Accept with/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Implementation agent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Discard/i })).not.toBeInTheDocument();
  });

  test("lets users choose main before launching", async () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.packets = selfEvolution.runs[0].packets;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new Error("stop before reload");
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SelfEvolutionPanel selfEvolution={selfEvolution} cronJob={null} />);

    fireEvent.click(screen.getAllByRole("button", { name: /mcpo-20260608-exec-allowlist/i }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "Launch agent" }));
    fireEvent.click(screen.getByRole("option", { name: "main" }));
    expect(screen.queryByText(/Approve \+ execute/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept with main/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept with" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept with" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const calls = fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
    expect(String(calls[0][0])).toBe("/api/self-evolution/improvements/action");
    expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({
      action: "approve",
      improvementKey: "exec-allowlist",
      agentId: "main",
    });
  });

  test("discards packets through the consolidated packet action endpoint", async () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.packets = selfEvolution.runs[0].packets;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new Error("stop before reload");
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SelfEvolutionPanel selfEvolution={selfEvolution} cronJob={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const calls = fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
    expect(String(calls[0][0])).toBe("/api/self-evolution/improvements/action");
    expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({
      action: "discard",
      improvementKey: "exec-allowlist",
    });
  });

  test("shows active invocation status without rendering another launch action", () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.runs[0].packets[0].runtimeInvocation = {
      id: "mcinv_active",
      agentId: "coding-agent",
      status: "running",
      obsidianTaskId: "task-impl-001",
      detailsPath: "/vault/Tasks/Details/task-impl-001.md",
      sessionKey: "session-active",
      runId: "run-active",
      runtimeTaskId: null,
      error: null,
      defaultAgentId: "coding-agent",
      selectedAgentId: "coding-agent",
      agentSelectionReason: "Default implementation orchestrator for code-change packets.",
    };
    selfEvolution.packets = selfEvolution.runs[0].packets;

    render(<SelfEvolutionPanel selfEvolution={selfEvolution} cronJob={null} />);

    fireEvent.click(screen.getAllByRole("button", { name: /mcpo-20260608-exec-allowlist/i }).at(-1)!);

    expect(screen.getByRole("link", { name: "Implementation task" })).toHaveAttribute("href", "/work/tasks/task-impl-001");
    expect(screen.getByText(/Already submitted to coding-agent/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept with/i })).not.toBeInTheDocument();
  });

  test("allows retrying a failed invocation with the previously selected agent", () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.runs[0].packets[0].runtimeInvocation = {
      id: "mcinv_failed",
      agentId: "main",
      status: "failed",
      obsidianTaskId: "task-impl-001",
      detailsPath: "/vault/Tasks/Details/task-impl-001.md",
      sessionKey: null,
      runId: null,
      runtimeTaskId: null,
      error: "OpenClaw CLI returned malformed JSON.",
      defaultAgentId: "coding-agent",
      selectedAgentId: "main",
      agentSelectionReason: "Use the main agent session for implementation follow-through.",
    };
    selfEvolution.packets = selfEvolution.runs[0].packets;

    render(<SelfEvolutionPanel selfEvolution={selfEvolution} cronJob={null} />);

    fireEvent.click(screen.getAllByRole("button", { name: /mcpo-20260608-exec-allowlist/i }).at(-1)!);

    expect(screen.getByText(/Last attempt failed to main/i)).toBeInTheDocument();
    expect(screen.getByText("OpenClaw CLI returned malformed JSON.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept with" })).toBeInTheDocument();
  });
});
