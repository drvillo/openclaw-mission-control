import { ActionButton } from "./components/action-button";
import { loadDashboardState } from "./lib/mission-control";

function formatEpoch(epochMs: number | null) {
  if (!epochMs) {
    return "none";
  }
  return new Date(epochMs).toLocaleString("en-GB", { hour12: false });
}

export default function HomePage() {
  const state = loadDashboardState();
  const snapshot = state.snapshot;

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Tailnet Admin Surface</p>
        <h1>OpenClaw Mission Control</h1>
        <p className="intro">
          A derived operational view over Obsidian tasks, OpenClaw TaskFlows, webhook ingress, and system health.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Task Board</h2>
          <p className="metric">{snapshot.tasks.inbox}</p>
          <p className="caption">active inbox tasks</p>
          <p className="detail">Backlog: {snapshot.tasks.backlog}</p>
        </article>

        <article className="card">
          <h2>Flow Snapshot</h2>
          <p className="metric">{snapshot.tasks.flows}</p>
          <p className="caption">tracked TaskFlows</p>
          <p className="detail">Audit findings: {snapshot.tasks.findings}</p>
        </article>

        <article className="card">
          <h2>Ingress Visibility</h2>
          <p className="metric">{snapshot.ingress.total}</p>
          <p className="caption">logged inbound events</p>
          <div className="event-list">
            {Object.entries(snapshot.ingress.bySource).map(([source, count]) => (
              <div key={source} className="event-row">
                <span>{source}</span>
                <strong>{count}</strong>
              </div>
            ))}
            {Object.keys(snapshot.ingress.bySource).length === 0 ? (
              <div className="event-row">
                <span>none</span>
                <strong>0</strong>
              </div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Operator Actions</h2>
            <p className="panel-copy">Run maintenance preview, reconciliation diagnostics, refresh the derived state, and operate on individual tasks and flows.</p>
          </div>
          <div className="action-row">
            <ActionButton endpoint="/api/actions/refresh" label="Refresh state" />
            <ActionButton endpoint="/api/actions/maintenance" label="Preview maintenance" />
            <ActionButton endpoint="/api/actions/reconcile-preview" label="Preview reconciliation" />
            <ActionButton endpoint="/api/actions/memory-doctor" label="Run memory doctor" />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Nightly Improvement Loop</h2>
            <p className="panel-copy">Cron visibility for the daily self-improvement review and related scheduled system work.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Agent</th>
                <th>Enabled</th>
                <th>Schedule</th>
                <th>Last run</th>
                <th>Next run</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.cronJobs.map((job) => (
                <tr key={job.jobId}>
                  <td>{job.name}</td>
                  <td>{job.agentId}</td>
                  <td>{job.enabled ? "yes" : "no"}</td>
                  <td>{job.scheduleLabel}</td>
                  <td>{formatEpoch(job.lastRunAtMs)}</td>
                  <td>{formatEpoch(job.nextRunAtMs)}</td>
                  <td>{job.lastRunStatus ?? "none"}</td>
                </tr>
              ))}
              {state.cronJobs.length === 0 ? (
                <tr>
                  <td colSpan={7}>No cron jobs tracked yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Cron Run History</h2>
            <p className="panel-copy">Recent execution history, including the nightly recommendation job and task-board hygiene sweeps.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Job</th>
                <th>Status</th>
                <th>Action</th>
                <th>Delivery</th>
                <th>Model</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {state.cronRuns.map((run) => (
                <tr key={run.runId}>
                  <td>{formatEpoch(run.ts)}</td>
                  <td>{run.jobId}</td>
                  <td>{run.status}</td>
                  <td>{run.action}</td>
                  <td>{run.deliveryStatus ?? "none"}</td>
                  <td>{run.model ?? "none"}</td>
                  <td>{run.summary?.slice(0, 180) ?? "none"}</td>
                </tr>
              ))}
              {state.cronRuns.length === 0 ? (
                <tr>
                  <td colSpan={7}>No cron run history tracked yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Obsidian Tasks</h2>
            <p className="panel-copy">SQLite-backed task snapshots from the canonical Obsidian task board.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Board</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Agent status</th>
                <th>Flow</th>
              </tr>
            </thead>
            <tbody>
              {state.tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.board}</td>
                  <td>{task.status}</td>
                  <td>{task.assignee}</td>
                  <td>{task.agentStatus}</td>
                  <td>{task.flowId ?? "none"}</td>
                </tr>
              ))}
              {state.tasks.length === 0 ? (
                <tr>
                  <td colSpan={6}>No task snapshots loaded.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Runtime Tasks</h2>
            <p className="panel-copy">Live OpenClaw background tasks with cancellation controls for active work.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Status</th>
                <th>Runtime</th>
                <th>Agent</th>
                <th>Label</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.runtimeTasks.map((task) => {
                const cancellable = task.status === "queued" || task.status === "running";
                return (
                  <tr key={task.taskId}>
                    <td>{task.taskId}</td>
                    <td>{task.status}</td>
                    <td>{task.runtime ?? "none"}</td>
                    <td>{task.agentId ?? "none"}</td>
                    <td>{task.label ?? "none"}</td>
                    <td>
                      {cancellable ? (
                        <ActionButton
                          endpoint="/api/actions/cancel-task"
                          label="Cancel"
                          body={{ lookup: task.taskId }}
                          confirmText={`Cancel runtime task ${task.taskId}?`}
                        />
                      ) : (
                        <span className="muted">not active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {state.runtimeTasks.length === 0 ? (
                <tr>
                  <td colSpan={6}>No runtime tasks loaded.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>TaskFlows</h2>
            <p className="panel-copy">Durable flow state for webhook-driven work.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Flow ID</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Goal</th>
                <th>Step</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.flows.map((flow) => {
                const cancellable = flow.status === "queued" || flow.status === "running" || flow.status === "waiting";
                return (
                  <tr key={flow.flowId}>
                    <td>{flow.flowId}</td>
                    <td>{flow.status}</td>
                    <td>{flow.ownerKey ?? "none"}</td>
                    <td>{flow.goal ?? "none"}</td>
                    <td>{flow.currentStep ?? "none"}</td>
                    <td>
                      {cancellable ? (
                        <ActionButton
                          endpoint="/api/actions/cancel-flow"
                          label="Cancel"
                          body={{ lookup: flow.flowId }}
                          confirmText={`Cancel flow ${flow.flowId}?`}
                        />
                      ) : (
                        <span className="muted">not active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {state.flows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No TaskFlows are currently tracked.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Webhook Events</h2>
            <p className="panel-copy">Normalized event log from Mission Control state, with replay for supported sources.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Recorded</th>
                <th>Source</th>
                <th>Type</th>
                <th>Status</th>
                <th>Flow</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.events.map((event) => {
                const replayable = event.source === "fathom" && Boolean(event.payloadPath);
                return (
                  <tr key={event.eventId}>
                    <td>{event.recordedAt}</td>
                    <td>{event.source}</td>
                    <td>{event.eventType}</td>
                    <td>{event.status}</td>
                    <td>{event.flowId ?? "none"}</td>
                    <td>
                      {replayable ? (
                        <ActionButton
                          endpoint="/api/actions/replay-event"
                          label="Replay"
                          body={{ source: event.source, payloadPath: event.payloadPath ?? "" }}
                          confirmText={`Replay event ${event.eventId}?`}
                        />
                      ) : (
                        <span className="muted">no replay</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {state.events.length === 0 ? (
                <tr>
                  <td colSpan={6}>No webhook events recorded yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Audit Findings</h2>
            <p className="panel-copy">Health and maintenance findings pulled from `openclaw tasks audit`.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Code</th>
                <th>Kind</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {state.findings.map((finding) => (
                <tr key={finding.findingId}>
                  <td>{finding.severity}</td>
                  <td>{finding.code}</td>
                  <td>{finding.kind}</td>
                  <td>{finding.detail}</td>
                </tr>
              ))}
              {state.findings.length === 0 ? (
                <tr>
                  <td colSpan={4}>No audit findings are currently tracked.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Memory Health</h2>
            <p className="panel-copy">Workspace memory doctor status, including daily memory coverage and QMD availability.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Status</th>
                <th>AGENTS.md</th>
                <th>MEMORY.md</th>
                <th>Today</th>
                <th>Latest daily</th>
                <th>QMD</th>
              </tr>
            </thead>
            <tbody>
              {state.memoryHealth.map((workspace) => (
                <tr key={workspace.workspaceId}>
                  <td>{workspace.workspaceId}</td>
                  <td>{workspace.status}</td>
                  <td>{workspace.hasAgentsMd ? "yes" : "no"}</td>
                  <td>{workspace.hasMemoryMd ? "yes" : "no"}</td>
                  <td>{workspace.hasTodayDaily ? "yes" : "no"}</td>
                  <td>{workspace.latestDaily ?? "none"}</td>
                  <td>{workspace.qmdHealthy ? "ok" : workspace.qmdMessage}</td>
                </tr>
              ))}
              {state.memoryHealth.length === 0 ? (
                <tr>
                  <td colSpan={7}>No memory health data recorded yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>State Roots</h2>
        <ul>
          <li>OpenClaw: <code>{state.roots.openclawHome}</code></li>
          <li>Obsidian tasks: <code>{state.roots.tasksRoot}</code></li>
          <li>Mission Control state: <code>{state.roots.stateDir}</code></li>
          <li>Mission Control DB: <code>{state.roots.dbPath}</code></li>
        </ul>
      </section>
    </main>
  );
}
