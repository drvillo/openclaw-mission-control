import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MemoryHealth } from "@ocmc/shared";
import { MemoryHealthSchema } from "@ocmc/shared";

const execFileAsync = promisify(execFile);
const QMD_BIN = "/opt/homebrew/bin/qmd";

type QmdStatus = { healthy: boolean; message: string };

type CollectMemoryHealthOptions = {
  today?: string;
  qmdProbe?: () => Promise<QmdStatus>;
};

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

function loadOpenClawConfig(openclawHome: string): Record<string, unknown> {
  try {
    const text = readFileSync(path.join(openclawHome, "openclaw.json"), "utf8");
    return JSON.parse(text.replace(/,\s*([}\]])/g, "$1")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function canonicalSharedMemoryRoot(openclawHome: string): string {
  const config = loadOpenClawConfig(openclawHome);
  const memory = (config.memory ?? {}) as Record<string, unknown>;
  const qmd = (memory.qmd ?? {}) as Record<string, unknown>;
  const paths = Array.isArray(qmd.paths) ? qmd.paths : [];
  for (const candidate of paths) {
    const record = candidate as Record<string, unknown>;
    if (typeof record.path === "string" && record.path.includes("OpenClaw Memory")) {
      return record.path;
    }
  }
  return path.join(openclawHome, "workspace", "memory");
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

function assessMainWorkspaceLinks(workspacePath: string, expectedMemoryDir: string, expectedMemoryFile: string) {
  const memoryLink = path.join(workspacePath, "memory");
  const memoryFileLink = path.join(workspacePath, "MEMORY.md");

  try {
    const dirIsLink = lstatSync(memoryLink).isSymbolicLink();
    const fileIsLink = lstatSync(memoryFileLink).isSymbolicLink();
    if (!dirIsLink || !fileIsLink) {
      return {
        pathStatus: "missing_link" as const,
        pathMessage: "main workspace memory paths are not symlinks to the canonical shared memory store",
        workspaceMemoryTarget: dirIsLink ? readlinkSync(memoryLink) : null,
        workspaceMemoryFileTarget: fileIsLink ? readlinkSync(memoryFileLink) : null,
      };
    }
    const workspaceMemoryTarget = readlinkSync(memoryLink);
    const workspaceMemoryFileTarget = readlinkSync(memoryFileLink);
    if (workspaceMemoryTarget !== expectedMemoryDir || workspaceMemoryFileTarget !== expectedMemoryFile) {
      return {
        pathStatus: "misconfigured" as const,
        pathMessage: "main workspace memory links do not point at the canonical shared memory store",
        workspaceMemoryTarget,
        workspaceMemoryFileTarget,
      };
    }
    return {
      pathStatus: "ok" as const,
      pathMessage: "main workspace memory links resolve to the canonical shared memory store",
      workspaceMemoryTarget,
      workspaceMemoryFileTarget,
    };
  } catch {
    return {
      pathStatus: "missing_link" as const,
      pathMessage: "main workspace memory links are missing",
      workspaceMemoryTarget: null,
      workspaceMemoryFileTarget: null,
    };
  }
}

async function readQmdStatus(openclawHome: string): Promise<QmdStatus> {
  const xdgConfigHome = path.join(openclawHome, "agents", "main", "qmd", "xdg-config");
  const xdgCacheHome = path.join(openclawHome, "agents", "main", "qmd", "xdg-cache");
  const qmdIndex = path.join(xdgCacheHome, "qmd", "index.sqlite");
  if (!existsSync(qmdIndex)) {
    return { healthy: false, message: `qmd index.sqlite is missing at ${qmdIndex}` };
  }
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: xdgConfigHome,
    XDG_CACHE_HOME: xdgCacheHome,
  };
  try {
    const { stdout, stderr } = await execFileAsync(QMD_BIN, ["status"], {
      cwd: openclawHome,
      maxBuffer: 1024 * 1024 * 10,
      env,
    });
    const statusText = (stdout || stderr).trim() || "qmd status ok";
    await execFileAsync(QMD_BIN, ["get", "qmd://obsidian-openclaw-memory/MEMORY.md"], {
      cwd: openclawHome,
      maxBuffer: 1024 * 1024 * 10,
      env,
    });
    return { healthy: true, message: `${statusText.split("\n", 1)[0]}; qmd get ok` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { healthy: false, message };
  }
}

export async function collectMemoryHealth(
  openclawHome: string,
  recordedAt: string,
  options: CollectMemoryHealthOptions = {},
): Promise<MemoryHealth[]> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const qmdStatus = options.qmdProbe ? await options.qmdProbe() : await readQmdStatus(openclawHome);
  const sharedMemoryRoot = canonicalSharedMemoryRoot(openclawHome);

  return discoverWorkspaces(openclawHome).map((workspacePath) => {
    const workspaceId = path.basename(workspacePath);
    const agentsPath = path.join(workspacePath, "AGENTS.md");
    const isMainWorkspace = workspaceId === "workspace";
    const memoryScope = isMainWorkspace ? "shared" : "local";
    const memoryDir = isMainWorkspace ? path.join(sharedMemoryRoot, "daily") : path.join(workspacePath, "memory");
    const memoryPath = isMainWorkspace ? path.join(sharedMemoryRoot, "MEMORY.md") : path.join(workspacePath, "MEMORY.md");
    const todayFile = path.join(memoryDir, `${today}.md`);
    const hasAgentsMd = existsSync(agentsPath);
    const hasMemoryMd = existsSync(memoryPath);
    const memoryDirPresent = existsSync(memoryDir);
    const hasTodayDaily = existsSync(todayFile);
    const latest = latestDaily(memoryDir);
    const pathAssessment = isMainWorkspace
      ? assessMainWorkspaceLinks(workspacePath, memoryDir, memoryPath)
      : {
          pathStatus: "not_applicable" as const,
          pathMessage: "local workspace memory paths are direct files",
          workspaceMemoryTarget: null,
          workspaceMemoryFileTarget: null,
        };
    const status: MemoryHealth["status"] = !hasAgentsMd
      ? "missing_agents_md"
      : pathAssessment.pathStatus !== "ok" && pathAssessment.pathStatus !== "not_applicable"
        ? "path_misconfigured"
        : !hasMemoryMd
          ? "missing_memory_md"
          : !qmdStatus.healthy
            ? "qmd_unhealthy"
            : !hasTodayDaily
              ? "daily_missing"
              : "ok";

    return MemoryHealthSchema.parse({
      workspaceId,
      workspacePath,
      hasAgentsMd,
      hasMemoryMd,
      memoryDirPresent,
      hasTodayDaily,
      latestDaily: latest,
      qmdHealthy: qmdStatus.healthy,
      qmdMessage: qmdStatus.message,
      memoryScope,
      pathStatus: pathAssessment.pathStatus,
      pathMessage: pathAssessment.pathMessage,
      canonicalMemoryRoot: sharedMemoryRoot,
      memoryDirPath: memoryDir,
      memoryFilePath: memoryPath,
      todayFilePath: todayFile,
      workspaceMemoryTarget: pathAssessment.workspaceMemoryTarget,
      workspaceMemoryFileTarget: pathAssessment.workspaceMemoryFileTarget,
      status,
      recordedAt,
      rawJson: JSON.stringify(
        {
          workspaceId,
          workspacePath,
          memoryScope,
          canonicalMemoryRoot: sharedMemoryRoot,
          memoryDirPath: memoryDir,
          memoryFilePath: memoryPath,
          todayFilePath: todayFile,
          hasAgentsMd,
          hasMemoryMd,
          memoryDirPresent,
          hasTodayDaily,
          latestDaily: latest,
          pathStatus: pathAssessment.pathStatus,
          pathMessage: pathAssessment.pathMessage,
          workspaceMemoryTarget: pathAssessment.workspaceMemoryTarget,
          workspaceMemoryFileTarget: pathAssessment.workspaceMemoryFileTarget,
          qmdHealthy: qmdStatus.healthy,
          qmdMessage: qmdStatus.message,
        },
        null,
        2,
      ),
    });
  });
}
