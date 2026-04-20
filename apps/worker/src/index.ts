import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MISSION_CONTROL_STATE_DIR, OPENCLAW_HOME, SNAPSHOT_PATH } from "./config.js";

const execFileAsync = promisify(execFile);

function parseJsonFromStdout(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("OpenClaw command returned empty stdout");
  }
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  const startCandidates = [firstBrace, firstBracket].filter((value) => value >= 0);
  const start = startCandidates.length > 0 ? Math.min(...startCandidates) : -1;
  if (start < 0) {
    throw new Error(`OpenClaw command did not emit JSON: ${trimmed}`);
  }
  return JSON.parse(trimmed.slice(start));
}

async function runJsonCommand(args: string[]) {
  const { stdout, stderr } = await execFileAsync("openclaw", args, {
    cwd: OPENCLAW_HOME,
    maxBuffer: 1024 * 1024 * 10,
  });
  return parseJsonFromStdout(stdout || stderr);
}

async function countLoggedEvents(kind: string): Promise<number> {
  const filePath = path.join(MISSION_CONTROL_STATE_DIR, "events", kind, `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.jsonl`);
  try {
    const text = await readFile(filePath, "utf8");
    return text.split("\n").filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

async function main() {
  const [tasks, flows, audit] = await Promise.all([
    runJsonCommand(["tasks", "list", "--json"]),
    runJsonCommand(["tasks", "flow", "list", "--json"]),
    runJsonCommand(["tasks", "audit", "--json", "--limit", "50"]),
  ]);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    tasks: {
      count: tasks.count ?? 0,
      flows: flows.count ?? 0,
      findings: audit.summary?.combined?.total ?? 0,
    },
    ingress: {
      agentmailToday: await countLoggedEvents("agentmail"),
      fathomToday: await countLoggedEvents("fathom"),
    },
  };

  await mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
