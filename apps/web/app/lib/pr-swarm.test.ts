import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrSwarmAutofixAttemptSchema, PrSwarmFixabilityDecisionSchema } from "@ocmc/shared";
import { afterEach, describe, expect, test } from "vitest";
import { loadPrSwarmState } from "./pr-swarm";

const roots: string[] = [];

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocmc-pr-swarm-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("loadPrSwarmState", () => {
  test("loads Phase 3 repo config, bridge health, run timeline, and autonomy controls", () => {
    const root = tmpRoot();
    const configPath = path.join(root, "config.json");
    const stateRoot = path.join(root, "state");
    fs.writeFileSync(configPath, JSON.stringify({
      global: { safetyMode: "normal", liveWritesEnabled: false, autonomousEnabled: false },
      repos: {
        "octo/demo": {
          enabled: true,
          externalWriteMode: "comment_only",
          approvalEnabled: false,
          requestChangesEnabled: false,
          automergeEnabled: false,
          triggers: { githubAction: { enabled: true, acceptedActions: ["opened"], baseBranches: ["main"] }, polling: { enabled: false } },
          autofix: { mode: "dry_run", allowedClasses: ["docs"], targetMode: "patch_comment" },
          blockedPaths: ["secrets/**"],
          skipLabels: ["skip-ai-review"],
          reviewLenses: [{ id: "design", type: "skill", path: "/allowed/design/SKILL.md" }]
        }
      }
    }));
    const runDir = path.join(stateRoot, "runs", "octo__demo__7__abc");
    fs.mkdirSync(runDir, { recursive: true });
    for (const artifact of ["context", "review", "security", "judge", "policy", "publisher", "fixability"]) fs.writeFileSync(path.join(runDir, `${artifact}.json`), "{}\n");
    fs.writeFileSync(path.join(runDir, "result.json"), JSON.stringify({
      runId: "run-1",
      status: "commented",
      context: { repo: "octo/demo", prNumber: 7, prUrl: "https://github.com/octo/demo/pull/7", source: "openclaw_webhook", eventAction: "opened", workflowRunId: "99", workflowRunAttempt: "1", eventId: "evt-1", dedupeKey: "octo/demo#7@abc123", headSha: "abc123" },
      config: { autofix: { mode: "dry_run" } },
      configHash: "cfg",
      policy: { allowedAction: "comment", reason: "ok", hardBlocks: [], idempotencyKey: "octo/demo#7@abc123" },
      publisher: { status: "published", url: "https://github.com/octo/demo/pull/7#issuecomment" },
      review: { overallRisk: "low" },
      security: { overallSecurityRisk: "low" },
      judge: { risk: "low", humanReviewRequired: false },
      fixability: [{ findingId: "finding-1", policy: "dry_run_allowed", reason: "ok", allowedClasses: ["docs"], maxFiles: 3, maxLines: 150, targetMode: "patch_comment" }],
      artifactsDir: runDir
    }));
    const eventDir = path.join(stateRoot, "events", "octo__demo");
    fs.mkdirSync(eventDir, { recursive: true });
    fs.writeFileSync(path.join(eventDir, "evt.json"), JSON.stringify({
      dedupeType: "event_id",
      dedupeKey: "octo/demo#7@abc123",
      recordedAtMs: 1,
      event: { eventId: "evt-1", repo: "octo/demo", action: "opened", prUrl: "https://github.com/octo/demo/pull/7", headSha: "abc123", githubRunId: "99", githubRunAttempt: "1" }
    }));
    fs.writeFileSync(path.join(eventDir, "invalid-signature.json"), JSON.stringify({
      status: "rejected",
      reason: "invalid_signature",
      repo: "octo/demo",
      eventId: "evt-bad-signature",
      recordedAtMs: 2
    }));
    const bridgeHealthDir = path.join(stateRoot, "bridge-health", "octo__demo");
    fs.mkdirSync(bridgeHealthDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeHealthDir, "ignored.json"), JSON.stringify({ status: "ignored_skip_label" }));

    const state = loadPrSwarmState({ configPath, stateRoot });
    expect(state.liveWritesEnabled).toBe(false);
    expect(state.globalAutonomousEnabled).toBe(false);
    expect(state.repos[0]).toMatchObject({ repo: "octo/demo", enabled: true, externalWriteMode: "comment_only", autofixMode: "dry_run", githubActionEnabled: true });
    expect(state.runs[0]).toMatchObject({ runId: "run-1", policyAction: "comment", publisherStatus: "published", canGeneratePatch: true });
    expect(state.runs[0].timeline.map((step) => step.step)).toContain("fixability");
    expect(state.bridgeHealth).toMatchObject({ accepted: 1, ignoredOrBlocked: 1, failed: 1, tokenFailures: 1, stale: false });
    expect(state.bridgeEvents[0]).toMatchObject({ eventId: "evt-1", githubRunId: "99", dedupeKey: "octo/demo#7@abc123" });
  });

  test("loads configured repos from JSONC config files", () => {
    const root = tmpRoot();
    const configPath = path.join(root, "config.jsonc");
    const stateRoot = path.join(root, "state");
    fs.writeFileSync(configPath, `{
      // Mission Control PR Swarm repo list is edited by humans.
      "global": { "safetyMode": "normal" },
      "repos": {
        "octo/jsonc-demo": {
          "enabled": true,
          "externalWriteMode": "comment_only",
          "triggers": { "githubAction": { "enabled": true } },
          "autofix": { "mode": "disabled" }
        }
      }
    }`);

    const state = loadPrSwarmState({ configPath, stateRoot });

    expect(state.repos).toHaveLength(1);
    expect(state.repos[0]).toMatchObject({ repo: "octo/jsonc-demo", enabled: true, externalWriteMode: "comment_only" });
  });

  test("shared contracts accept autonomous PR Swarm states emitted by Python", () => {
    expect(() => PrSwarmFixabilityDecisionSchema.parse({
      findingId: "finding-1",
      policy: "autonomous_allowed",
      reason: "low-risk docs fix",
      allowedClasses: ["docs"],
      maxFiles: 1,
      maxLines: 10,
      targetMode: "patch_comment",
    })).not.toThrow();
    expect(() => PrSwarmAutofixAttemptSchema.parse({
      id: "attempt-1",
      repo: "octo/demo",
      prNumber: 7,
      baseHeadSha: "abc123",
      mode: "autonomous_apply",
      status: "applied",
      selectedFindingIds: ["finding-1"],
      changedFiles: ["README.md"],
      verification: [{ command: "unit", result: "passed" }],
    })).not.toThrow();
  });
});
