import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SelfEvolutionPanel } from "./self-evolution-panel";

const runDocument = {
  label: "Manual run · validation-check-20260622-214747",
  title: "Manual Dual-Entity Self-Evolution Run",
  path: "/vault/System/OpenClaw Memory/Self-Evolution/Manual Runs/validation-check-20260622-214747.md",
  vaultPath: "System/OpenClaw Memory/Self-Evolution/Manual Runs/validation-check-20260622-214747.md",
  href: "obsidian://open?vault=test&file=manual-run",
  exists: true,
  markdown: "# Manual Dual-Entity Self-Evolution Run\n\n## Proposals\n\n### capability-radar-manual-run-artifact\n\nKeep capability discovery visible.",
  sectionId: null,
};

function buildSelfEvolutionState(): Parameters<typeof SelfEvolutionPanel>[0]["selfEvolution"] {
  return {
    latestDate: "validation-check-20260622-214747",
    latestGeneratedAt: "2026-06-22T21:47:47.908803+02:00",
    allGatesOk: true,
    packetCount: 1,
    reviewTaskId: null,
    reviewTaskStatus: null,
    gates: [{ name: "manual run packet valid", ok: true }],
    runs: [
      {
        date: "validation-check-20260622-214747",
        generatedAt: "2026-06-22T21:47:47.908803+02:00",
        allGatesOk: true,
        packetCount: 1,
        reviewTask: null,
        gates: [{ name: "manual run packet valid", ok: true }],
        mutatingActions: [],
        note: runDocument,
        packets: [
          {
            date: "validation-check-20260622-214747",
            dates: ["validation-check-20260622-214747"],
            generatedAt: "2026-06-22T21:47:47.908803+02:00",
            id: "capability-radar-manual-run-artifact",
            title: "Capability radar for manual self-evolution runs",
            summary: "Add a manual-run artifact that lists new capabilities considered.",
            domain: "capability_expansion",
            analyzer: "dual_entity_manual_run",
            owner: "main",
            value: 4,
            risk: "low",
            complexity: "medium",
            status: "manual_bounded_candidate",
            dedupeKey: "capability-radar-manual-run-artifact",
            canonicalKey: "capability-radar-manual-run-artifact",
            approvalClassification: "none",
            approvalClass: "none",
            approvalBoundary: "none",
            approvalRequired: false,
            userValue: "Keeps self-evolution focused on new capabilities.",
            decision: "manual_bounded_candidate",
            decisionRationale: "Clear user value and no approval boundary.",
            evidenceQuality: "opportunity_grounded",
            generatorFeedback: "Preserve hypothesis/MVV/validation fields.",
            evidence: ["Capability Discovery Protocol"],
            rollback: "Remove the generated artifact.",
            validation: ["Manual run JSON contains proposal_type=capability_expansion"],
            sourceNote: runDocument.path,
            manualRunJsonPath: runDocument.path.replace(/\.md$/, ".json"),
            implementerReportPath: runDocument.path.replace(/\.md$/, "-implementer-review.json"),
            note: runDocument,
            reviewTask: null,
            attic: false,
            document: {
              ...runDocument,
              label: "capability-radar-manual-run-artifact",
              title: "capability-radar-manual-run-artifact",
              markdown: "### capability-radar-manual-run-artifact\n\nKeep capability discovery visible.",
              sectionId: "capability-radar-manual-run-artifact",
            },
          },
        ],
      },
    ],
    packets: [],
    mutatingActions: [],
    links: {
      latestNote: runDocument,
      index: {
        ...runDocument,
        label: "Dual-entity contract",
        title: "Dual-Entity Operating Contract",
        path: "/vault/System/OpenClaw Memory/Self-Evolution/Dual-Entity Operating Contract.md",
        vaultPath: "System/OpenClaw Memory/Self-Evolution/Dual-Entity Operating Contract.md",
        markdown: "# Dual-Entity Operating Contract",
      },
      curriculum: { ...runDocument, label: "Curriculum", title: "Curriculum", path: "/vault/curriculum.md", markdown: "# Curriculum" },
      systemMap: { ...runDocument, label: "System map", title: "System map", path: "/vault/system-map.md", markdown: "# System Map" },
      valuesModel: { ...runDocument, label: "Values model", title: "Values model", path: "/vault/values-model.md", markdown: "# Values Model" },
      evalCorpus: { ...runDocument, label: "Eval corpus", title: "Eval corpus", path: "/vault/eval-corpus.md", markdown: "# Evaluation Corpus" },
    },
  };
}

describe("SelfEvolutionPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("opens the focused manual run in the markdown modal", () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.packets = selfEvolution.runs[0].packets;

    render(<SelfEvolutionPanel selfEvolution={selfEvolution} cronJob={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open manual run" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manual run · validation-check-20260622-214747" })).toBeInTheDocument();
    expect(screen.getAllByText("Manual Dual-Entity Self-Evolution Run")).toHaveLength(2);
  });

  test("falls back to latest run proposals when global active dedupe hides completed duplicates", () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.packets = [];
    selfEvolution.runs[0].packets[0].status = "done";

    render(<SelfEvolutionPanel selfEvolution={selfEvolution} cronJob={null} />);

    expect(screen.getAllByText("Capability radar for manual self-evolution runs").length).toBeGreaterThan(0);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  test("surfaces capability-inspired signals directly in the proposal list", () => {
    const selfEvolution = buildSelfEvolutionState();

    render(<SelfEvolutionPanel selfEvolution={selfEvolution} cronJob={null} />);

    expect(screen.queryByRole("heading", { name: "Capability radar" })).not.toBeInTheDocument();
    expect(screen.getByText("Keeps self-evolution focused on new capabilities.")).toBeInTheDocument();
    expect(screen.getByText("Clear user value and no approval boundary.")).toBeInTheDocument();
  });

  test("filters to a manual run view and exposes proposal deep links", () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.packets = selfEvolution.runs[0].packets;

    render(
      <SelfEvolutionPanel
        selfEvolution={selfEvolution}
        cronJob={null}
        selectedDate="validation-check-20260622-214747"
        selectedPacketId="capability-radar-manual-run-artifact"
      />,
    );

    expect(screen.getByText("Focused manual run view for dual-entity proposals.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "validation-check-20260622-214747" })).toHaveAttribute(
      "href",
      "/self-evolution/day/validation-check-20260622-214747?packet=capability-radar-manual-run-artifact",
    );
  });

  test("shows a manual implementation trigger with the self-evolution implementer as default", () => {
    const selfEvolution = buildSelfEvolutionState();
    selfEvolution.packets = selfEvolution.runs[0].packets;

    render(<SelfEvolutionPanel selfEvolution={selfEvolution} cronJob={null} />);

    fireEvent.click(screen.getAllByRole("button", { name: /capability-radar-manual-run-artifact/i }).at(-1)!);

    expect(screen.getByRole("button", { name: "Trigger with" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Launch agent" }));
    expect(screen.getAllByRole("option").map((option) => option.textContent?.replace("✓", "").trim())).toEqual(["self-evolution-implementer", "coding-agent", "main"]);
  });
});
