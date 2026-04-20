import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MemoryHealth } from "@ocmc/shared";
import { MemoryHealthSchema } from "@ocmc/shared";

const execFileAsync = promisify(execFile);

function discoverWorkspaces(openclawHome: string): string[] {
  return readdirSync(openclawHome)
    .filter((entry) => /^workspace(?:-.+)?$/.test(entry))
    .map((entry) => path.join(openclawHome, entry))
    .filter((entry) => {
      try {
        return statSync(entry).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

function latestDaily(memoryDir: string): string | null {
  if (!existsSync(memoryDir)) {
    return null;
  }
  const entries = readdirSync(memoryDir)
    .filter((entry) => /^\d{4}-\d{2}-\d{2}\.md$/.test(entry))
    .sort();
  return entries.at(-1) ?? null;
}

function ensureTodayMemory(memoryDir: string, todayFile: string) {
  mkdirSync(memoryDir, { recursive: true });
  if (existsSync(todayFile)) {
    return false;
  }
  const todayLabel = path.basename(todayFile, ".md");
  writeFileSync(
    todayFile,
    `# ${todayLabel}\n\n## What moved\n- Auto-created by Mission Control memory doctor.\n\n## Key decisions\n- Pending\n\n## Blockers and risks\n- Pending\n\n## What matters next\n- Pending\n`,
    "utf8",
  );
  return true;
}

async function readQmdStatus(): Promise<{ healthy: boolean; message: string }> {
  const qmdIndex = path.join(os.homedir(), ".cache", "qmd", "index.sqlite");
  if (!existsSync(qmdIndex)) {
    return { healthy: false, message: "qmd index.sqlite is missing" };
  }
  try {
    const { stdout, stderr } = await execFileAsync("qmd", ["status"], {
      cwd: os.homedir(),
      maxBuffer: 1024 * 1024 * 10,
    });
    const text = (stdout || stderr).trim();
    return { healthy: true, message: text || "qmd status ok" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { healthy: false, message };
  }
}

export async function collectMemoryHealth(
  openclawHome: string,
  recordedAt: string,
  apply = false,
  today = new Date().toISOString().slice(0, 10),
): Promise<MemoryHealth[]> {
  const qmdStatus = await readQmdStatus();

  return discoverWorkspaces(openclawHome).map((workspacePath) => {
    const workspaceId = path.basename(workspacePath);
    const agentsPath = path.join(workspacePath, "AGENTS.md");
    const memoryPath = path.join(workspacePath, "MEMORY.md");
    const memoryDir = path.join(workspacePath, "memory");
    const todayFile = path.join(memoryDir, `${today}.md`);
    const hasAgentsMd = existsSync(agentsPath);
    const hasMemoryMd = existsSync(memoryPath);
    const memoryDirPresentBefore = existsSync(memoryDir);

    let applyError: string | null = null;
    if (apply) {
      try {
        ensureTodayMemory(memoryDir, todayFile);
      } catch (error) {
        applyError = error instanceof Error ? error.message : String(error);
      }
    }

    const memoryDirPresent = existsSync(memoryDir) || memoryDirPresentBefore;
    const hasTodayDaily = existsSync(todayFile);
    const latest = latestDaily(memoryDir);
    const status: MemoryHealth["status"] =
      !hasAgentsMd || !hasMemoryMd || applyError
        ? "error"
        : !hasTodayDaily || !qmdStatus.healthy
          ? "warning"
          : "ok";
    const qmdMessage = applyError ? `${qmdStatus.message}; apply error: ${applyError}` : qmdStatus.message;

    return MemoryHealthSchema.parse({
      workspaceId,
      workspacePath,
      hasAgentsMd,
      hasMemoryMd,
      memoryDirPresent,
      hasTodayDaily,
      latestDaily: latest,
      qmdHealthy: qmdStatus.healthy,
      qmdMessage,
      status,
      recordedAt,
      rawJson: JSON.stringify(
        {
          workspaceId,
          workspacePath,
          hasAgentsMd,
          hasMemoryMd,
          memoryDirPresent,
          hasTodayDaily,
          latestDaily: latest,
          qmdHealthy: qmdStatus.healthy,
          qmdMessage,
          applyError,
        },
        null,
        2,
      ),
    });
  });
}
