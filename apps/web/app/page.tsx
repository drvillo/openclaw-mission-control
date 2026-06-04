import type { ReactNode } from "react";
import { ActionButton } from "./components/action-button";
import { AssertionRegister, type AssertionStatusFilter } from "./components/assertion-register";
import { IdentityAdminView } from "./components/identity-admin-view";
import { MeetingsIndex } from "./components/meetings-index";
import { MyAccountabilityView } from "./components/my-accountability-view";
import { MyntView } from "./components/mynt-view";
import { CronRunsPanel, RuntimeTasksPanel, TaskFlowsPanel } from "./components/operations-panels";
import { RoutingPanel } from "./components/routing-panel";
import { TasksBoard } from "./components/tasks-board";
import { WorkspaceShell, type WorkspaceId } from "./components/workspace-shell";
import { formatDisplayDate, formatDisplayDateTime } from "./lib/date-format";
import { loadDashboardState } from "./lib/mission-control";
import { loadMeetingIndex } from "./lib/meetings";
import { buildMyntIndex } from "./lib/mynt";
import { groupAcceptedSelfAssignedActions, partitionSelfAssignedDecisions, pendingSelfAssignedActions, selfAssignedActions } from "./lib/my-accountability";
import { loadObsidianTaskBoard } from "./lib/openclaw";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDateTime(value: string | number | null) {
  return formatDisplayDateTime(value);
}

function formatDate(value: string | null) {
  return formatDisplayDate(value);
}

function MetricCard({
  label,
  value,
  caption,
  detail,
  primaryHref,
  primaryLabel,
  actionHref,
  actionLabel,
}: {
  label: string;
  value: string | number;
  caption: string;
  detail?: string;
  primaryHref?: string;
  primaryLabel?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <article className={`card ${primaryHref ? "metric-card-clickable" : ""}`}>
      {primaryHref ? (
        <a className="metric-card-link" href={primaryHref} aria-label={primaryLabel ?? label}>
          <span>{primaryLabel ?? label}</span>
        </a>
      ) : null}
      <h2>{label}</h2>
      <p className="metric">{value}</p>
      <p className="caption">{caption}</p>
      {detail ? <p className="detail">{detail}</p> : null}
      {actionHref && actionLabel ? (
        <a className="metric-action" href={actionHref}>
          {actionLabel}
        </a>
      ) : null}
    </article>
  );
}

function Panel({
  title,
  copy,
  children,
}: {
  title: string;
  copy?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {copy ? <p className="panel-copy">{copy}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export async function MissionControlPage({
  activeWorkspace = "work",
  selectedMeetingId,
  focusedItemId,
  focusedTime,
  expandedPersonId,
  pendingReviewOnly = false,
  assertionKind,
  assertionStatusFilter = "all",
}: {
  activeWorkspace?: WorkspaceId;
  selectedMeetingId?: string;
  focusedItemId?: string;
  focusedTime?: string;
  expandedPersonId?: string;
  pendingReviewOnly?: boolean;
  assertionKind?: "action" | "decision";
  assertionStatusFilter?: AssertionStatusFilter;
}) {
  const state = loadDashboardState();
  const taskBoard = await loadObsidianTaskBoard();
  const meetingIndex = loadMeetingIndex();
  const myntIndex = buildMyntIndex(meetingIndex, taskBoard);
  const snapshot = state.snapshot;
  const meetingActionItems = meetingIndex.meetings.flatMap((meeting) => meeting.actions);
  const meetingDecisionItems = meetingIndex.meetings.flatMap((meeting) => meeting.decisions);
  const pendingMeetingActions = meetingActionItems.filter((item) => item.reviewStatus === "needs_review").length;
  const pendingMeetingDecisions = meetingDecisionItems.filter((item) => item.reviewStatus === "needs_review").length;
  const activeMyntActions = myntIndex.items.filter((item) => item.kind === "action" && !item.archived);
  const activeMyntDecisions = myntIndex.items.filter((item) => item.kind === "decision" && !item.archived);
  const archivedMyntActions = myntIndex.items.filter((item) => item.kind === "action" && item.archived);
  const archivedMyntDecisions = myntIndex.items.filter((item) => item.kind === "decision" && item.archived);
  const pendingMyntActions = activeMyntActions.filter((item) => item.reviewStatus === "needs_review").length;
  const pendingMyntDecisions = activeMyntDecisions.filter((item) => item.reviewStatus === "needs_review").length;
  const myAccountabilityReviewActions = pendingSelfAssignedActions(myntIndex);
  const myAccountabilityActionColumns = groupAcceptedSelfAssignedActions(myntIndex);
  const myAccountabilityAcceptedActions = myAccountabilityActionColumns.reduce((sum, column) => sum + column.items.length, 0);
  const myAccountabilityDecisions = partitionSelfAssignedDecisions(myntIndex);

  const myWork = (
    <div className="workspace-stack">
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Personal Workflow</p>
          <h2>My work</h2>
          <p className="intro">Tasks reconstructed from the canonical Obsidian board, with filtering, drag/drop status moves, and detail editing.</p>
        </div>
      </section>

      <section className="grid">
        <MetricCard label="Inbox" value={snapshot.tasks.inbox} caption="active inbox tasks" detail={`Backlog: ${snapshot.tasks.backlog}`} />
        <MetricCard label="Board" value={taskBoard.tasks.length} caption="loaded Obsidian tasks" detail={`${snapshot.tasks.count} tasks in derived state`} />
        <MetricCard label="Flows" value={snapshot.tasks.flows} caption="tracked TaskFlows" detail={`${snapshot.tasks.findings} audit findings`} />
        <MetricCard label="Meetings" value={meetingIndex.meetings.length} caption="Fathom transcripts indexed" detail={`${meetingIndex.participants.length} participants`} />
      </section>

      <Panel title="Obsidian Tasks" copy="Live kanban view reconstructed from the canonical Obsidian task board and detail notes.">
        <TasksBoard tasks={taskBoard.tasks} />
      </Panel>
    </div>
  );

  const myAccountability = (
    <div className="workspace-stack">
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Personal Accountability</p>
          <h2>My Accountability</h2>
          <p className="intro">Self-assigned canonical actions and decisions from meeting assertions, separate from the Obsidian task board and team accountability map.</p>
        </div>
      </section>

      <section className="grid">
        <MetricCard
          label="Review"
          value={myAccountabilityReviewActions.length}
          caption="self-assigned actions pending review"
          detail={`${myAccountabilityDecisions.pending.length} decisions pending`}
        />
        <MetricCard
          label="Actions"
          value={selfAssignedActions(myntIndex).filter((item) => !item.archived).length}
          caption="self-assigned action assertions"
          detail={`${myAccountabilityAcceptedActions} accepted on board`}
        />
        <MetricCard
          label="Done"
          value={myAccountabilityActionColumns.find((column) => column.id === "done")?.items.length ?? 0}
          caption="completed accepted actions"
          detail="done items remain visible"
        />
        <MetricCard
          label="Decision Log"
          value={myAccountabilityDecisions.accepted.length}
          caption="accepted assigned decisions"
          detail={`${myAccountabilityDecisions.pending.length} pending review`}
        />
      </section>

      <Panel title="Canonical Assertions" copy={`Source: ${meetingIndex.root}`}>
        <MyAccountabilityView index={myntIndex} />
      </Panel>
    </div>
  );

  const myMeetings = (
    <div className="workspace-stack">
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Meeting Memory</p>
          <h2>My meetings</h2>
          <p className="intro">Read-only metadata index for Fathom recordings stored in Obsidian. Search by participant, title, date, month, or recording id.</p>
        </div>
      </section>

      <section className="grid">
        <MetricCard label="Meetings" value={meetingIndex.meetings.length} caption="Fathom transcripts indexed" detail={`${meetingIndex.participants.length} participants`} />
        <MetricCard
          label="Actions"
          value={meetingActionItems.length}
          caption="extracted action assertions"
          detail={`${pendingMeetingActions} pending review`}
          actionHref="/accountability/actions/pending"
          actionLabel="Pending review"
        />
        <MetricCard
          label="Decisions"
          value={meetingDecisionItems.length}
          caption="extracted decision assertions"
          detail={`${pendingMeetingDecisions} pending review`}
          actionHref="/accountability/decisions/pending"
          actionLabel="Pending review"
        />
        <MetricCard label="Participants" value={meetingIndex.participants.length} caption="unique participant strings" detail={`${meetingIndex.months.length} indexed months`} />
      </section>

      <Panel title="Fathom Recordings" copy={`Source: ${meetingIndex.root}`}>
        <MeetingsIndex
          index={meetingIndex}
          selectedMeetingId={selectedMeetingId}
          focusedItemId={focusedItemId}
          focusedTime={focusedTime}
          openOnLoad={Boolean(selectedMeetingId)}
          pendingReviewOnly={pendingReviewOnly}
          assigneeIdentities={myntIndex.identities}
        />
      </Panel>
    </div>
  );

  const mynt = (
    <div className="workspace-stack">
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Accountability</p>
          <h2>Accountability Map</h2>
          <p className="intro">People ranked by assigned actions and owned decisions extracted from Fathom meeting notes, with identity curation and archival state kept in Mission Control JSON.</p>
        </div>
      </section>

      <section className="grid">
        <MetricCard
          label="People"
          value={myntIndex.peopleWithSelf.length}
          caption="responsible people"
          detail={`${myntIndex.hiddenSelfCount} self-owned items shown in My Accountability`}
          primaryHref="/accountability/people"
          primaryLabel="View people"
        />
        <MetricCard
          label="Actions"
          value={activeMyntActions.length}
          caption="unarchived action owners"
          detail={`${pendingMyntActions} pending review · ${archivedMyntActions.length} archived`}
          primaryHref="/accountability/actions/all"
          primaryLabel="View all actions"
          actionHref="/accountability/actions/pending"
          actionLabel="Pending review"
        />
        <MetricCard
          label="Decisions"
          value={activeMyntDecisions.length}
          caption="unarchived decision owners"
          detail={`${pendingMyntDecisions} pending review · ${archivedMyntDecisions.length} archived`}
          primaryHref="/accountability/decisions/all"
          primaryLabel="View all decisions"
          actionHref="/accountability/decisions/pending"
          actionLabel="Pending review"
        />
        <MetricCard label="Identity" value={myntIndex.identities.length} caption="curated identities" detail={`${myntIndex.duplicates.length} potential duplicate strings`} />
      </section>

      <Panel
        title={assertionKind ? `${assertionStatusFilter === "pending" ? "Pending" : assertionStatusFilter === "accepted" ? "Accepted" : "All"} ${assertionKind === "action" ? "Actions" : "Decisions"}` : "People, Actions, Decisions"}
        copy={`Source: ${meetingIndex.root}`}
      >
        {assertionKind ? (
          <AssertionRegister index={myntIndex} kind={assertionKind} statusFilter={assertionStatusFilter} />
        ) : (
          <MyntView index={myntIndex} expandedPersonId={expandedPersonId} pendingReviewOnly={pendingReviewOnly} />
        )}
      </Panel>
    </div>
  );

  const identity = (
    <div className="workspace-stack">
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Accountability Map</p>
          <h2>Identity Admin</h2>
          <p className="intro">Canonical identities, aliases, and duplicate review for people extracted from Fathom meeting notes.</p>
        </div>
      </section>
      <IdentityAdminView index={myntIndex} />
    </div>
  );

  const fonkeyOps = (
    <div className="workspace-stack">
      <section className="workspace-hero workspace-hero-ops">
        <div>
          <p className="eyebrow">Internal System Visibility</p>
          <h2>Fonkey Ops</h2>
          <p className="intro">Routing evidence, runtime work, durable flows, cron, ingress, audit, memory health, and state roots.</p>
        </div>
        <div className="action-row">
          <ActionButton endpoint="/api/actions/refresh" label="Refresh state" />
          <ActionButton endpoint="/api/actions/maintenance" label="Preview maintenance" />
          <ActionButton endpoint="/api/actions/reconcile-preview" label="Preview reconciliation" />
          <ActionButton endpoint="/api/actions/memory-doctor" label="Run memory doctor" />
        </div>
      </section>

      <section className="grid">
        <MetricCard label="Ingress" value={snapshot.ingress.total} caption="logged inbound events" detail={`${Object.keys(snapshot.ingress.bySource).length} sources`} />
        <MetricCard
          label="Routing"
          value={snapshot.routing.total}
          caption="normalized routing attempts"
          detail={`Failures: ${snapshot.routing.failures} · Pending: ${snapshot.routing.pending} · Compliant: ${snapshot.routing.compliant}`}
        />
        <MetricCard label="Runtime" value={state.runtimeTasks.length} caption="recent background tasks" detail={`${state.flows.length} recent flows`} />
        <MetricCard label="Audit" value={state.findings.length} caption="loaded findings" detail={`${state.memoryHealth.length} memory scopes`} />
      </section>

      <Panel
        title="Agent Routing"
        copy="Request-level routing evidence from `main` session logs, including misroutes, recovery prompts, accepted spawns, direct execution fallback, and child completion state."
      >
        <RoutingPanel groups={state.routingGroups} />
      </Panel>

      <Panel title="Nightly Improvement Loop" copy="Cron visibility for the daily self-improvement review and related scheduled system work.">
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
                  <td>{formatDateTime(job.lastRunAtMs)}</td>
                  <td>{formatDateTime(job.nextRunAtMs)}</td>
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
      </Panel>

      <Panel title="Cron Run History" copy="Recent execution history, including the nightly recommendation job and task-board hygiene sweeps.">
        <CronRunsPanel items={state.cronRuns} />
      </Panel>

      <Panel title="Runtime Tasks" copy="Live OpenClaw background tasks with cancellation controls for active work.">
        <RuntimeTasksPanel items={state.runtimeTasks} />
      </Panel>

      <Panel title="TaskFlows" copy="Durable flow state for webhook-driven work, with controller-aware operator actions where the backing flow supports them.">
        <TaskFlowsPanel items={state.flows} />
      </Panel>

      <Panel title="Webhook Events" copy="Normalized event log from Mission Control state, with replay for supported sources.">
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
                const replayable = (event.source === "fathom" || event.source === "agentmail") && Boolean(event.payloadPath);
                return (
                  <tr key={event.eventId}>
                    <td>{formatDateTime(event.recordedAt)}</td>
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
      </Panel>

      <Panel title="Audit Findings" copy="Health and maintenance findings pulled from `openclaw tasks audit`.">
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
      </Panel>

      <Panel title="Memory Health" copy="Workspace memory doctor status, including daily memory coverage and QMD availability.">
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Path</th>
                <th>Today</th>
                <th>Latest daily</th>
                <th>QMD</th>
              </tr>
            </thead>
            <tbody>
              {state.memoryHealth.map((workspace) => (
                <tr key={workspace.workspaceId}>
                  <td>{workspace.workspaceId}</td>
                  <td>{workspace.memoryScope}</td>
                  <td>{workspace.status}</td>
                  <td>{workspace.pathStatus === "ok" ? "ok" : workspace.pathMessage}</td>
                  <td>{workspace.hasTodayDaily ? "yes" : "no"}</td>
                  <td>{formatDate(workspace.latestDaily)}</td>
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
      </Panel>

      <Panel title="State Roots">
        <ul className="roots-list">
          <li>
            <span>OpenClaw</span>
            <code>{state.roots.openclawHome}</code>
          </li>
          <li>
            <span>Obsidian tasks</span>
            <code>{state.roots.tasksRoot}</code>
          </li>
          <li>
            <span>Mission Control state</span>
            <code>{state.roots.stateDir}</code>
          </li>
          <li>
            <span>Mission Control DB</span>
            <code>{state.roots.dbPath}</code>
          </li>
        </ul>
      </Panel>
    </div>
  );

  return (
    <main className="page-shell">
      <WorkspaceShell activeWorkspace={activeWorkspace} work={myWork} meetings={myMeetings} myAccountability={myAccountability} mynt={mynt} identity={identity} ops={fonkeyOps} />
    </main>
  );
}

export default async function HomePage() {
  return <MissionControlPage activeWorkspace="work" />;
}
