import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PrSwarmPanel } from "./pr-swarm-panel";

describe("PrSwarmPanel", () => {
  test("renders configured repos and expandable run timeline with shared ops styling", () => {
    const { container } = render(
      <PrSwarmPanel
        state={{
          configPath: "/config/pr-swarm.repos.json",
          stateRoot: "/state/pr-swarm",
          globalSafetyMode: "normal",
          liveWritesEnabled: false,
          globalAutonomousEnabled: false,
          githubAuthHealth: "not_checked",
          bridgeHealth: { lastEventAtMs: 1, accepted: 1, ignoredOrBlocked: 1, failed: 0, tokenFailures: 0, schemaFailures: 0, stale: false },
          repos: [{
            repo: "octo/demo",
            enabled: true,
            externalWriteMode: "comment_only",
            safetyMode: "normal",
            repoKillSwitch: false,
            approvalEnabled: false,
            requestChangesEnabled: false,
            automergeEnabled: false,
            approvalRequirements: {},
            automerge: {},
            triggers: {},
            githubActionEnabled: true,
            acceptedActions: ["opened", "synchronize"],
            baseBranches: ["main"],
            headBranches: [],
            pollingEnabled: false,
            autofixMode: "dry_run",
            autofixAllowedClasses: ["docs"],
            autofixTargetMode: "patch_comment",
            blockedPaths: ["secrets/**"],
            skipLabels: ["skip-ai-review"],
            reviewLenses: [{ id: "design", type: "skill", path: "/allowed/design/SKILL.md" }],
            notificationsTelegramEnabled: false,
            validationErrors: [],
          }],
          runs: [{
            runId: "run-1",
            status: "commented",
            repo: "octo/demo",
            prNumber: 7,
            prUrl: "https://github.com/octo/demo/pull/7",
            source: "openclaw_webhook",
            eventAction: "opened",
            workflowRunId: "99",
            workflowRunAttempt: "1",
            bridgeEventId: "evt-1",
            dedupeKey: "octo/demo#7@abcdef",
            telegramNotificationSent: false,
            headSha: "abcdef1234567890",
            configHash: "cfg",
            policyAction: "comment",
            policyReason: "allowed",
            hardBlocks: [],
            publisherStatus: "published",
            publisherUrl: "https://github.com/octo/demo/pull/7#issuecomment",
            reviewRisk: "low",
            securityRisk: "low",
            judgeRisk: "low",
            humanReviewRequired: false,
            idempotencyKey: "octo/demo#7@abcdef",
            artifactsDir: "/state/run",
            updatedAtMs: 1,
            taskId: null,
            timeline: [{ step: "review", status: "recorded", path: "/state/run/review.json" }, { step: "fixability", status: "recorded", path: "/state/run/fixability.json" }],
            fixability: [{ findingId: "finding-1", policy: "dry_run_allowed", reason: "Dry-run patch generation allowed", allowedClasses: ["docs"], maxFiles: 3, maxLines: 150, targetMode: "patch_comment" }],
            canGeneratePatch: true,
            canRequestHumanApprovedFix: false,
            canRereview: false,
            canAutonomousFix: false,
            dangerousControlsVisible: false,
            eligibilityEvidence: { checksGreen: true, mergeable: true, branchProtectionKnown: true },
            rollback: null,
            latestFixAttempt: null,
          }],
          bridgeEvents: [{
            eventId: "evt-1",
            repo: "octo/demo",
            status: "event_id",
            recordedAtMs: 1,
            action: "opened",
            prUrl: "https://github.com/octo/demo/pull/7",
            headSha: "abcdef1234567890",
            dedupeKey: "octo/demo#7@abcdef",
            githubRunId: "99",
            githubRunAttempt: "1",
            failureReason: null,
          }],
        }}
      />
    );

    expect(screen.getByText("Config location")).toBeTruthy();
    expect(screen.getByText("Configured repositories")).toBeTruthy();
    expect(screen.getByText("comment_only")).toBeTruthy();
    expect(screen.getByText(/security baseline/)).toBeTruthy();
    expect(screen.getByText("Recent review runs")).toBeTruthy();
    expect(screen.getByText("commented")).toHaveClass("routing-badge", "routing-badge-success");
    expect(screen.getByText("Review low")).toHaveClass("routing-badge", "routing-badge-success");
    expect(screen.getByText("1 repos")).toHaveClass("routing-badge", "routing-badge-neutral");
    expect(screen.getByText("Generate patch")).toBeTruthy();
    expect(screen.getByText("finding-1")).toBeTruthy();
    expect(screen.queryByText("Bridge health")).not.toBeInTheDocument();
    expect(screen.getAllByText("octo/demo").length).toBeGreaterThan(0);
    expect(container.querySelector(".routing-group")).toBeTruthy();
    expect(container.querySelector(".pr-swarm-chip")).toBeNull();
    expect(container.querySelector(".pr-swarm-run-card")).toBeNull();
  });
});
