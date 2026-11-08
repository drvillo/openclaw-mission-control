import type { ReactNode } from "react";
import { formatDisplayDateTime } from "../lib/date-format";
import type { PrSwarmDashboardState, PrSwarmRunSummary } from "../lib/pr-swarm";

type BadgeTone = "error" | "warning" | "success" | "neutral";

function shortSha(value: string) {
  return value.length > 12 ? value.slice(0, 12) : value || "n/a";
}

function formatList(values: string[], empty = "none") {
  return values.length ? values.join(", ") : empty;
}

function formatUnknown(value: unknown) {
  if (value === null || value === undefined || value === "") return "unknown";
  return String(value);
}

function getRiskTone(value: string | null): BadgeTone {
  const normalized = value?.toLowerCase();
  if (normalized === "critical" || normalized === "high") return "error";
  if (normalized === "medium") return "warning";
  if (normalized === "low") return "success";
  return "neutral";
}

function getRunTone(run: PrSwarmRunSummary): BadgeTone {
  const tones = [run.reviewRisk, run.securityRisk, run.judgeRisk].map(getRiskTone);
  if (tones.includes("error")) return "error";
  if (tones.includes("warning")) return "warning";
  if (tones.includes("success")) return "success";
  return "neutral";
}

function RoutingBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`routing-badge routing-badge-${tone}`}>{children}</span>;
}

function RiskSummary({ run }: { run: PrSwarmRunSummary }) {
  const risks = [
    { label: "Review", value: run.reviewRisk },
    { label: "Security", value: run.securityRisk },
    { label: "Judge", value: run.judgeRisk },
  ].filter((risk): risk is { label: string; value: string } => Boolean(risk.value));

  if (risks.length === 0) return <RoutingBadge tone="neutral">No risk artifact</RoutingBadge>;

  return (
    <>
      {risks.map((risk) => (
        <RoutingBadge key={risk.label} tone={getRiskTone(risk.value)}>
          {risk.label} {risk.value}
        </RoutingBadge>
      ))}
    </>
  );
}

function RunControls({ run }: { run: PrSwarmRunSummary }) {
  return (
    <div className="pr-swarm-actions" aria-label={`Controls for ${run.repo}#${run.prNumber}`}>
      <form action={`/api/pr-swarm/runs/${encodeURIComponent(run.runId)}/generate-patch`} method="post">
        <button className="metric-action pr-swarm-action" type="submit" disabled={!run.canGeneratePatch}>Generate patch</button>
      </form>
      <button
        className="metric-action pr-swarm-action pr-swarm-action-secondary"
        type="button"
        disabled={!run.canRequestHumanApprovedFix}
        title="Resume human-approved fixes through the PR Swarm Lobster workflow with an explicit approval record"
      >
        Human-approved fix
      </button>
      <button className="metric-action pr-swarm-action pr-swarm-action-secondary" type="button" disabled={!run.canAutonomousFix}>Autonomous fix eligible</button>
      <form action={`/api/pr-swarm/runs/${encodeURIComponent(run.runId)}/rerun`} method="post">
        <button className="metric-action pr-swarm-action pr-swarm-action-secondary" type="submit">Re-review</button>
      </form>
    </div>
  );
}

function RunDetails({ run }: { run: PrSwarmRunSummary }) {
  return (
    <div className="routing-group-body pr-swarm-run-detail">
      <section>
        <h4>Lifecycle</h4>
        {run.timeline.length ? (
          <div className="table-shell pr-swarm-table-shell">
            <table>
              <thead>
                <tr>
                  <th>Step</th><th>Status</th><th>Artifact</th>
                </tr>
              </thead>
              <tbody>
                {run.timeline.map((item) => (
                  <tr key={`${run.runId}:${item.step}:${item.path}`}>
                    <td>{item.step}</td>
                    <td>{item.status}</td>
                    <td>{item.reason || item.path || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="detail">No artifacts recorded yet.</p>
        )}
      </section>

      <section>
        <h4>Fixability</h4>
        {run.fixability.length ? (
          <div className="table-shell pr-swarm-table-shell">
            <table>
              <thead>
                <tr>
                  <th>Finding</th><th>Policy</th><th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {run.fixability.map((item) => (
                  <tr key={item.findingId}>
                    <td>{item.findingId}</td>
                    <td>{item.policy}</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="detail">No fixability decisions recorded.</p>
        )}
      </section>

      <section className="pr-swarm-run-evidence">
        <h4>Settled outcome</h4>
        <dl className="ops-next-action-meta">
          <div><dt>Outcome</dt><dd>{run.normalized !== true ? `legacy: ${run.status}` : (run.finalStatus || run.status)}</dd></div>
          <div><dt>Reason</dt><dd>{run.finalReason || run.policyReason || "not recorded"}</dd></div>
          <div><dt>Final SHA</dt><dd>{shortSha(run.finalSha || run.headSha)}</dd></div>
          <div><dt>Settled</dt><dd>{run.settledAt || "not recorded"}</dd></div>
          <div><dt>Hard blocks</dt><dd>{formatList(run.hardBlocks)}</dd></div>
          <div><dt>Checks</dt><dd>{formatUnknown(run.eligibilityEvidence.checksGreen)}</dd></div>
          <div><dt>Mergeable</dt><dd>{formatUnknown(run.eligibilityEvidence.mergeable)}</dd></div>
          <div><dt>Branch protection</dt><dd>{formatUnknown(run.eligibilityEvidence.branchProtectionKnown)}</dd></div>
        </dl>
      </section>

      <section className="pr-swarm-run-evidence">
        <h4>Telegram delivery</h4>
        <p className="detail">Start: {formatUnknown(run.notificationDelivery?.start && (run.notificationDelivery.start as Record<string, unknown>).status)} · Settled: {formatUnknown(run.notificationDelivery?.settled && (run.notificationDelivery.settled as Record<string, unknown>).status)}</p>
        <p className="detail">Delivery status is operational only; it never changes the PR outcome.</p>
      </section>

      <details className="pr-swarm-run-evidence">
        <summary>Advanced artifacts</summary>
        <p className="detail pr-swarm-mono">{run.artifactsDir || "No artifact path recorded"}</p>
        {run.latestFixAttempt ? <p className="detail">Latest fix attempt: {formatUnknown(run.latestFixAttempt.status)}; re-review {formatUnknown(run.latestFixAttempt.rereviewRunId)}</p> : null}
        {run.rollback ? <p className="detail">Rollback: {formatUnknown(run.rollback.revert)}</p> : null}
      </details>

      <RunControls run={run} />
    </div>
  );
}

export function PrSwarmPanel({ state }: { state: PrSwarmDashboardState }) {
  const latestRuns = state.runs.slice(0, 12);
  return (
    <div className="pr-swarm-panel">
      <section className="pr-swarm-section" aria-labelledby="pr-swarm-config-title">
        <div className="pr-swarm-section-head">
          <div>
            <p className="eyebrow">Configuration</p>
            <h2 id="pr-swarm-config-title">Config location</h2>
          </div>
          <RoutingBadge tone="neutral">Read-only</RoutingBadge>
        </div>
        <p className="detail pr-swarm-mono">{state.configPath}</p>
      </section>

      <section className="pr-swarm-section" aria-labelledby="pr-swarm-repos-title">
        <div className="pr-swarm-section-head">
          <div>
            <p className="eyebrow">Repo config</p>
            <h3 id="pr-swarm-repos-title">Configured repositories</h3>
          </div>
          <RoutingBadge tone="neutral">{state.repos.length} repos</RoutingBadge>
        </div>
        <div className="table-shell pr-swarm-table-shell">
          <table>
            <thead>
              <tr>
                <th>Repo</th><th>Status</th><th>Write mode</th><th>Autofix</th><th>Lenses</th><th>Validation</th>
              </tr>
            </thead>
            <tbody>
              {state.repos.map((repo) => (
                <tr key={repo.repo}>
                  <td><strong>{repo.repo}</strong></td>
                  <td>{repo.enabled ? "enabled" : "disabled"}</td>
                  <td>{repo.externalWriteMode}</td>
                  <td>{repo.autofixMode}{repo.autofixAllowedClasses.length ? ` · ${formatList(repo.autofixAllowedClasses)}` : ""}</td>
                  <td>security baseline{repo.reviewLenses.length ? ` + ${repo.reviewLenses.length} optional` : ""}</td>
                  <td>{repo.validationErrors.length ? repo.validationErrors.join("; ") : "ok"}</td>
                </tr>
              ))}
              {state.repos.length === 0 ? <tr><td colSpan={6}>No repos configured. Check the config file above.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pr-swarm-section" aria-labelledby="pr-swarm-runs-title">
        <div className="pr-swarm-section-head">
          <div>
            <p className="eyebrow">Review runs</p>
            <h3 id="pr-swarm-runs-title">Recent review runs</h3>
          </div>
          <RoutingBadge tone="neutral">{latestRuns.length} shown</RoutingBadge>
        </div>
        <div className="routing-group-list pr-swarm-run-list">
          {latestRuns.map((run) => {
            const runTone = getRunTone(run);
            return (
              <details className={`routing-group routing-group-${runTone}`} key={run.runId}>
                <summary className="routing-group-summary">
                  <div className="routing-group-primary">
                    <p className="routing-group-time">{formatDisplayDateTime(run.updatedAtMs)}</p>
                    <h3>{run.repo}#{run.prNumber} {run.prUrl ? <a href={run.prUrl} target="_blank" rel="noreferrer">Open PR ↗</a> : null}</h3>
                    <p className="muted">{run.source}{run.eventAction ? ` / ${run.eventAction}` : ""} · <span title={run.dedupeKey}>{shortSha(run.headSha)}</span></p>
                  </div>
                  <div className="routing-group-badges">
                    <RoutingBadge tone={runTone}>{run.finalStatus || run.status}</RoutingBadge>
                    {run.normalized === false ? <RoutingBadge tone="warning">unnormalized history</RoutingBadge> : null}
                    <RoutingBadge tone="neutral">
                      {run.publisherUrl ? <a href={run.publisherUrl}>{run.publisherStatus}</a> : run.publisherStatus}
                    </RoutingBadge>
                    <RiskSummary run={run} />
                  </div>
                </summary>
                <RunDetails run={run} />
              </details>
            );
          })}
          {latestRuns.length === 0 ? <div className="routing-empty">No PR Swarm runs recorded yet.</div> : null}
        </div>
      </section>
    </div>
  );
}
