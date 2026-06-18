import { describe, expect, test } from "vitest";
import { applySelfEvolutionImplementationTaskStatuses, dedupeSelfEvolutionPackets, extractPacketSection, selfEvolutionPacketKey, type DashboardSelfEvolutionPacket } from "./mission-control";

describe("extractPacketSection", () => {
  test("returns the full packet body until the next section heading", () => {
    const markdown = `# Self-Evolution Review Packets - 2026-06-07

## Review packets

### SE-REVIEW-007 - Harden async native-maintenance exec allowlist compatibility

- status: review
- approval_classification: review packet is auto-safe

Observed issue:
An approved async maintenance command can still fail.

Validation:
- Dry-run the reconciliation path.
- Confirm the executor no longer reports allowlist miss.

### SE-REVIEW-001 - Deduplicate repeated nightly self-improvement recommendations

Observed issue:
Repeated recommendations still appear.
`;

    expect(extractPacketSection(markdown, "SE-REVIEW-007")).toBe(`### SE-REVIEW-007 - Harden async native-maintenance exec allowlist compatibility

- status: review
- approval_classification: review packet is auto-safe

Observed issue:
An approved async maintenance command can still fail.

Validation:
- Dry-run the reconciliation path.
- Confirm the executor no longer reports allowlist miss.`);
  });

  test("dedupes packet rows by stable improvement area and propagates status", () => {
    const base = {
      generatedAt: null,
      id: "SE-REVIEW-001",
      title: "Deduplicate repeated nightly self-improvement recommendations",
      summary: "Deduplicate repeated nightly self-improvement recommendations",
      domain: "runtime_system",
      analyzer: "legacy_review_packets",
      owner: "main",
      value: 3,
      risk: "unknown",
      complexity: "medium",
      status: "review",
      dedupeKey: "nightly-self-improvement-dedupe-test-only",
      canonicalKey: "nightly-self-improvement-dedupe-test-only",
      approvalClassification: null,
      approvalClass: null,
      evidence: [],
      rollback: null,
      validation: [],
      sourceNote: null,
      note: { label: "day", path: "/tmp/day.md", href: "obsidian://open", exists: true, vaultPath: "day.md", title: "day", markdown: "", sectionId: null },
      reviewTask: null,
      document: null,
      attic: false,
    } satisfies Omit<DashboardSelfEvolutionPacket, "date" | "dates">;

    const packets = dedupeSelfEvolutionPackets([
      { ...base, date: "2026-06-07", dates: ["2026-06-07"], status: "review" },
      { ...base, date: "2026-06-08", dates: ["2026-06-08"], status: "done" },
    ]);

    expect(packets).toHaveLength(1);
    expect(packets[0].dates).toEqual(["2026-06-08", "2026-06-07"]);
    expect(packets[0].status).toBe("done");
  });

  test("marks packets done when their implementation task is complete", () => {
    const packet = {
      date: "2026-06-06",
      dates: ["2026-06-06"],
      generatedAt: null,
      id: "SE-REVIEW-006",
      title: "Review local OpenClaw ecosystem surface drift",
      summary: "Review local OpenClaw ecosystem surface drift",
      domain: "runtime_system",
      analyzer: "legacy_review_packets",
      owner: "main",
      value: 3,
      risk: "unknown",
      complexity: "medium",
      status: "review",
      dedupeKey: "system-map-local-ecosystem-surface-drift",
      canonicalKey: "system-map-local-ecosystem-surface-drift",
      approvalClassification: null,
      approvalClass: null,
      evidence: [],
      rollback: null,
      validation: [],
      sourceNote: null,
      note: { label: "day", path: "/tmp/day.md", href: "obsidian://open", exists: true, vaultPath: "day.md", title: "day", markdown: "", sectionId: null },
      reviewTask: null,
      document: null,
      attic: false,
    } satisfies DashboardSelfEvolutionPacket;

    const packets = applySelfEvolutionImplementationTaskStatuses([packet], new Map([["system-map-local-ecosystem-surface-drift", "done"]]));

    expect(packets[0].status).toBe("done");
  });

  test("hides packets whose canonical key is in the attic set", () => {
    const packet = {
      date: "2026-06-08",
      dates: ["2026-06-08"],
      generatedAt: null,
      id: "SE-REVIEW-404",
      title: "Discarded Packet",
      summary: "Discarded Packet",
      domain: "runtime_system",
      analyzer: "legacy_review_packets",
      owner: "main",
      value: 3,
      risk: "unknown",
      complexity: "medium",
      status: "review",
      dedupeKey: "discarded-packet-test-only",
      canonicalKey: "discarded-packet-test-only",
      approvalClassification: null,
      approvalClass: null,
      evidence: [],
      rollback: null,
      validation: [],
      sourceNote: null,
      note: { label: "day", path: "/tmp/day.md", href: "obsidian://open", exists: true, vaultPath: "day.md", title: "day", markdown: "", sectionId: null },
      reviewTask: null,
      document: null,
      attic: false,
    } satisfies DashboardSelfEvolutionPacket;

    expect(dedupeSelfEvolutionPackets([packet], new Set([selfEvolutionPacketKey(packet)]))).toEqual([]);
  });
});
