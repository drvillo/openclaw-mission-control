import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SemanticConceptsPanel } from "./semantic-concepts-panel";

afterEach(() => {
  vi.restoreAllMocks();
});

function statusPayload() {
  return {
    semanticDbPath: "/tmp/semantic.sqlite",
    extractionSource: { kind: "jsonl", bundleCount: 2, diagnostics: [] },
    index: { latestIndexVersion: { indexVersionId: "index:latest" } },
    providers: {
      synthesis: { provider: "openai", model: "gpt-4.1-mini", operational: true, diagnostics: [] },
      embedding: { provider: "openai", model: "text-embedding-3-small", operational: true, diagnostics: [] },
    },
    operational: true,
    diagnostics: [],
  };
}

describe("SemanticConceptsPanel", () => {
  test("renders operational proposals without exposing raw linked IDs and explains target concept count", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/accountability/semantic/status")) {
        return new Response(JSON.stringify({ ok: true, status: statusPayload() }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/semantic/proposal-runs")) {
        return new Response(JSON.stringify({
          ok: true,
          proposalRuns: [{
            proposalRunId: "proposal-run:test",
            indexVersion: "index:latest",
            rawJson: JSON.stringify({
              evidencePackets: [{
                packetId: "packet:test",
                includedActionIds: ["action-missing"],
                includedDecisionIds: ["decision-raw"],
                evidenceWindowIds: ["evidence-1"],
                meetingIds: ["meeting:test"],
                retrievalScores: [{ sourceId: "evidence-1", sourceKind: "evidence_window", score: 0.91, rank: 1 }],
                noteRefs: [{ title: "Semantic planning sync" }],
              }],
            }),
            proposals: [{
              proposalId: "proposal:test",
              canonicalLabelSuggestion: "Semantic Review Workflow",
              definition: "Review before product writes.",
              confidence: 0.82,
              registryAction: "propose_new",
              linkedActionIds: ["action-missing"],
              linkedDecisionIds: ["decision-raw"],
              linkedEvidenceWindowIds: ["evidence-1"],
              reviewStatus: "pending",
              applyReady: false,
              missingTargets: ["action:action-missing"],
              rawJson: JSON.stringify({
                supportingQuotes: [{ quote: "We need a review workflow before semantic writes.", evidenceWindowId: "evidence-1" }],
                retrieval: { evidencePacketIds: ["packet:test"] },
              }),
            }],
          }],
        }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/concepts")) {
        return new Response(JSON.stringify({ ok: true, concepts: [{ conceptId: "concept-existing", label: "Existing concept", status: "active" }, { conceptId: "concept-dormant", label: "Dormant concept", status: "dormant" }] }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/semantic/proposal-runs/pull") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true, summary: "Pulled semantic proposal run and imported 1 proposal.", payload: {} }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SemanticConceptsPanel />);

    expect(await screen.findByRole("heading", { name: "Operational semantic layer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Needs review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Auto-applied" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Suppressed/rejected" })).toBeInTheDocument();
    expect(screen.getByText(/jsonl · 2 bundles/u)).toBeInTheDocument();
    expect(screen.getByText("Operational")).toBeInTheDocument();
    expect(screen.getByText("Semantic Review Workflow")).toBeInTheDocument();
    expect(screen.getByText("Not apply-ready")).toBeInTheDocument();
    expect(screen.getByText("1 window")).toBeInTheDocument();
    expect(screen.getByText("1 action · 1 decision")).toBeInTheDocument();
    expect(screen.getByText(/Only one accepted accountability concept is available/u)).toBeInTheDocument();
    expect(screen.getByText(/Missing linked targets: 1 unresolved assertion/u)).toBeInTheDocument();
    expect(screen.queryByText(/evidence-1|action-missing|decision-raw/u)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Show evidence for Semantic Review Workflow: 1 window" }));
    expect(screen.getByText("Evidence for Semantic Review Workflow")).toBeInTheDocument();
    expect(screen.getAllByText("We need a review workflow before semantic writes.").length).toBeGreaterThan(0);
    expect(screen.getByText("Semantic planning sync")).toBeInTheDocument();
    expect(screen.getAllByText("1 action · 1 decision").length).toBeGreaterThan(0);
    expect(screen.queryByText(/evidence-1|action-missing|decision-raw/u)).not.toBeInTheDocument();

    const targetSelect = screen.getByLabelText("Target concept for Semantic Review Workflow");
    expect(within(targetSelect).getByRole("option", { name: "Existing concept" })).toBeInTheDocument();
    expect(within(targetSelect).queryByRole("option", { name: "Dormant concept" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Semantic proposal query"), { target: { value: "review" } });
    fireEvent.click(screen.getByText("Advanced: pull proposals now"));
    fireEvent.click(screen.getByRole("button", { name: "Pull proposals into review" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/accountability/semantic/proposal-runs/pull", expect.objectContaining({ method: "POST" })));
    const pullCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/api/accountability/semantic/proposal-runs/pull"));
    expect(JSON.parse((pullCall?.[1] as RequestInit).body as string)).toEqual({ query: "review", reason: "mission_control_ui", importIntoReview: true });
  });

  test("keeps rejected proposals inspectable after successful review", async () => {
    let rejected = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/accountability/semantic/status")) {
        return new Response(JSON.stringify({ ok: true, status: statusPayload() }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/semantic/proposal-runs")) {
        return new Response(JSON.stringify({
          ok: true,
          proposalRuns: [{
            proposalRunId: "proposal-run:test",
            indexVersion: "index:latest",
            proposals: [{
              proposalId: "proposal:reject-me",
              canonicalLabelSuggestion: "Disposable Concept",
              definition: "Rejectable proposal.",
              confidence: 0.71,
              registryAction: "propose_new",
              linkedEvidenceWindowIds: [],
              reviewStatus: rejected ? "rejected" : "pending",
              applyReady: true,
            }],
          }],
        }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/concepts")) {
        return new Response(JSON.stringify({ ok: true, concepts: [] }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/semantic/proposals/proposal%3Areject-me/reject") && init?.method === "POST") {
        rejected = true;
        return new Response(JSON.stringify({ ok: true, summary: "Rejected semantic proposal.", payload: {} }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SemanticConceptsPanel />);

    expect(await screen.findByText("Disposable Concept")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reject once" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/accountability/semantic/proposals/proposal%3Areject-me/reject",
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(screen.getAllByText("rejected").length).toBeGreaterThan(0));
    expect(screen.getByText("Disposable Concept")).toBeInTheDocument();
    expect(screen.getByText("Rejected once; future matching suggestions may return unless suppressed.")).toBeInTheDocument();
  });

  test("selects a target concept without crashing and submits it for merge", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/accountability/semantic/status")) {
        return new Response(JSON.stringify({ ok: true, status: statusPayload() }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/semantic/proposal-runs")) {
        return new Response(JSON.stringify({
          ok: true,
          proposalRuns: [{
            proposalRunId: "proposal-run:merge",
            indexVersion: "index:latest",
            proposals: [{
              proposalId: "proposal:merge-me",
              canonicalLabelSuggestion: "Mergeable Concept",
              definition: "Mergeable proposal.",
              confidence: 0.76,
              registryAction: "merge_existing",
              linkedEvidenceWindowIds: [],
              reviewStatus: "pending",
              applyReady: true,
            }],
          }],
        }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/concepts")) {
        return new Response(JSON.stringify({ ok: true, concepts: [{ conceptId: "concept-target", label: "Target concept", status: "active" }] }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/semantic/proposals/proposal%3Amerge-me/merge") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true, summary: "Merged semantic proposal.", payload: {} }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SemanticConceptsPanel />);

    const targetSelect = await screen.findByLabelText("Target concept for Mergeable Concept");
    fireEvent.change(targetSelect, { target: { value: "concept-target" } });
    expect((targetSelect as HTMLSelectElement).value).toBe("concept-target");

    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/accountability/semantic/proposals/proposal%3Amerge-me/merge",
      expect.objectContaining({ method: "POST" }),
    ));
    const mergeCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/api/accountability/semantic/proposals/proposal%3Amerge-me/merge"));
    expect(JSON.parse((mergeCall?.[1] as RequestInit).body as string)).toEqual({ targetConceptId: "concept-target" });
  });

  test("renders auto-applied concepts as correctable Mission Control concepts", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/accountability/semantic/status")) {
        return new Response(JSON.stringify({ ok: true, status: statusPayload() }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/semantic/proposal-runs")) {
        return new Response(JSON.stringify({
          ok: true,
          proposalRuns: [{
            proposalRunId: "proposal-run:auto",
            indexVersion: "index:latest",
            proposals: [{
              proposalId: "proposal:auto",
              canonicalLabelSuggestion: "Autopilot Core",
              definition: "Auto-applied semantic concept.",
              confidence: 0.93,
              registryAction: "propose_new",
              linkedEvidenceWindowIds: ["evidence-auto"],
              reviewStatus: "accepted",
              targetConceptId: "concept-auto",
              applyReady: true,
            }],
          }],
        }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/concepts") && !init) {
        return new Response(JSON.stringify({ ok: true, concepts: [{ conceptId: "concept-auto", label: "Autopilot Core", summary: "Current summary", status: "active" }] }), { status: 200 });
      }
      if (url.endsWith("/api/accountability/concepts") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true, summary: "Updated concept." }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SemanticConceptsPanel />);

    expect(await screen.findByRole("heading", { name: "Auto-applied" })).toBeInTheDocument();
    expect(screen.getByText("Auto-applied proposals are real Mission Control concepts now. Correct the concept label or summary here; assignment changes are available from the graph assertion details.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Corrected label for Autopilot Core"), { target: { value: "Autopilot Tuning Core" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/accountability/concepts", expect.objectContaining({ method: "POST" })));
    const correctionBodies = fetchMock.mock.calls
      .filter((call) => String(call[0]).endsWith("/api/accountability/concepts") && (call[1] as RequestInit | undefined)?.method === "POST")
      .map((call) => JSON.parse(((call[1] as RequestInit).body as string)));
    expect(correctionBodies[0]).toEqual({ operation: "rename", conceptId: "concept-auto", label: "Autopilot Tuning Core" });
    expect(correctionBodies[1]).toEqual({ operation: "update_summary", conceptId: "concept-auto", summary: "Current summary" });
  });
});
