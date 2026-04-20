import fs from "node:fs";
import path from "node:path";

const OPENCLAW_HOME = process.env.OPENCLAW_HOME ?? "/Users/fonkey-oc/.openclaw";
const OBSIDIAN_TASKS = path.join(
  process.env.OBSIDIAN_VAULT ?? "/Users/fonkey-oc/Documents/Obsidian/F-HQ",
  "Tasks",
);
const STATE_DIR = process.env.MISSION_CONTROL_STATE_DIR ?? path.join(OPENCLAW_HOME, "mission-control-state");

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function countLines(filePath: string): number {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

function readTaskSummary() {
  const inboxPath = path.join(OBSIDIAN_TASKS, "Task Inbox.md");
  const backlogPath = path.join(OBSIDIAN_TASKS, "Task Backlog.md");
  const inbox = fs.existsSync(inboxPath) ? fs.readFileSync(inboxPath, "utf8") : "";
  const backlog = fs.existsSync(backlogPath) ? fs.readFileSync(backlogPath, "utf8") : "";
  const inboxTasks = (inbox.match(/^- \[[ xX]\] /gm) ?? []).length;
  const backlogTasks = (backlog.match(/^- \[[ xX]\] /gm) ?? []).length;
  return { inboxTasks, backlogTasks, inboxPath, backlogPath };
}

function readSnapshot() {
  return readJson(path.join(STATE_DIR, "snapshots", "current.json"), {
    generatedAt: null,
    tasks: { count: 0, flows: 0, findings: 0 },
  });
}

function readEventCounts() {
  const eventRoot = path.join(STATE_DIR, "events");
  const sources = ["agentmail", "fathom"];
  return sources.map((source) => {
    const sourceDir = path.join(eventRoot, source);
    if (!fs.existsSync(sourceDir)) {
      return { source, files: 0, lines: 0 };
    }
    const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith(".jsonl"));
    const lines = files.reduce((total, file) => total + countLines(path.join(sourceDir, file)), 0);
    return { source, files: files.length, lines };
  });
}

export default function HomePage() {
  const taskSummary = readTaskSummary();
  const snapshot = readSnapshot();
  const eventCounts = readEventCounts();

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
          <p className="metric">{taskSummary.inboxTasks}</p>
          <p className="caption">active inbox tasks</p>
          <p className="detail">Backlog: {taskSummary.backlogTasks}</p>
        </article>

        <article className="card">
          <h2>Flow Snapshot</h2>
          <p className="metric">{snapshot.tasks.flows ?? 0}</p>
          <p className="caption">tracked TaskFlows</p>
          <p className="detail">Audit findings: {snapshot.tasks.findings ?? 0}</p>
        </article>

        <article className="card">
          <h2>Ingress Visibility</h2>
          <p className="metric">{eventCounts.reduce((sum, row) => sum + row.lines, 0)}</p>
          <p className="caption">logged inbound events</p>
          <div className="event-list">
            {eventCounts.map((row) => (
              <div key={row.source} className="event-row">
                <span>{row.source}</span>
                <strong>{row.lines}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <h2>State Roots</h2>
        <ul>
          <li>OpenClaw: <code>{OPENCLAW_HOME}</code></li>
          <li>Obsidian tasks: <code>{taskSummary.inboxPath}</code></li>
          <li>Mission Control state: <code>{STATE_DIR}</code></li>
        </ul>
      </section>
    </main>
  );
}

