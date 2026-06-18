import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

describe("runtime bridge", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function loadBridge() {
    const dir = mkdtempSync(path.join(tmpdir(), "ocmc-runtime-bridge-"));
    tempDirs.push(dir);
    vi.stubEnv("MISSION_CONTROL_STATE_DIR", dir);
    return await import("./runtime-bridge");
  }

  test("persists runtime invocations and dedupes non-terminal submissions", async () => {
    const { submitRuntimeInvocation } = await loadBridge();
    let calls = 0;
    const runner = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Promise<{ stdout: string; stderr: string }>(() => {});
      }
      return { stdout: JSON.stringify({ runId: "run-2", sessionKey: "session-2", taskId: "runtime-2" }), stderr: "" };
    });

    const input = {
      kind: "self-evolution.packet.execute",
      title: "Execute packet",
      agentId: "coding-agent",
      instruction: "Do the work",
      idempotencyKey: "packet:one:v1",
      contextRefs: [{ type: "obsidian-task" as const, taskId: "task-1", detailsRef: "[[Tasks/Details/task-1]]", detailsPath: "/tmp/task-1.md" }],
      obsidianTaskId: "task-1",
      detailsPath: "/tmp/task-1.md",
    };

    const first = submitRuntimeInvocation(input, runner);
    await vi.waitFor(async () => expect(runner).toHaveBeenCalledTimes(1));

    const duplicate = await submitRuntimeInvocation(input, runner);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.record.status).toBe("submitted");
    expect(runner).toHaveBeenCalledTimes(1);

    // Avoid leaving an unresolved promise unhandled in the test process.
    void first.catch(() => {});
  });

  test("records run/session refs returned by the runner", async () => {
    const { submitRuntimeInvocation } = await loadBridge();
    const result = await submitRuntimeInvocation(
      {
        kind: "test.kind",
        title: "Test invocation",
        agentId: "coding-agent",
        instruction: "Do the work",
        idempotencyKey: "test:success:v1",
        contextRefs: [{ type: "obsidian-note" as const, path: "/tmp/note.md", title: "Note" }],
      },
      async () => ({ stdout: JSON.stringify({ runId: "run-1", sessionKey: "session-1", taskId: "runtime-1" }), stderr: "" }),
    );

    expect(result.duplicate).toBe(false);
    expect(result.record.status).toBe("succeeded");
    expect(result.record.runId).toBe("run-1");
    expect(result.record.sessionKey).toBe("session-1");
    expect(result.record.runtimeTaskId).toBe("runtime-1");
  });

  test("fails when the CLI returns malformed json", async () => {
    const { submitRuntimeInvocation } = await loadBridge();
    const result = await submitRuntimeInvocation(
      {
        kind: "test.kind",
        title: "Bad json",
        agentId: "coding-agent",
        instruction: "Do the work",
        idempotencyKey: "test:bad-json:v1",
        contextRefs: [{ type: "obsidian-note" as const, path: "/tmp/note.md", title: "Note" }],
      },
      async () => ({ stdout: "not-json", stderr: "" }),
    );

    expect(result.record.status).toBe("failed");
    expect(result.record.error).toMatch(/malformed json/i);
  });

  test("fails when the CLI response does not include runtime identifiers", async () => {
    const { submitRuntimeInvocation } = await loadBridge();
    const result = await submitRuntimeInvocation(
      {
        kind: "test.kind",
        title: "Missing refs",
        agentId: "coding-agent",
        instruction: "Do the work",
        idempotencyKey: "test:missing-refs:v1",
        contextRefs: [{ type: "obsidian-note" as const, path: "/tmp/note.md", title: "Note" }],
      },
      async () => ({ stdout: JSON.stringify({ ok: true, output: "done" }), stderr: "" }),
    );

    expect(result.record.status).toBe("failed");
    expect(result.record.error).toMatch(/did not include runtime identifiers/i);
  });
});
