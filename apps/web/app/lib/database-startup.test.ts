// @vitest-environment node
import { test, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { openMissionControlDb } from "@ocmc/db";

test("database startup tolerates a concurrent worker write", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mc-startup-"));
  const filePath = path.join(directory, "mission-control.sqlite");
  openMissionControlDb(filePath).close();
  const writer = new Worker(`
    const { workerData, parentPort } = require("node:worker_threads");
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(workerData);
    db.exec("BEGIN IMMEDIATE;");
    parentPort.postMessage("locked");
    setTimeout(() => { db.exec("COMMIT;"); db.close(); }, 250);
  `, { eval: true, workerData: filePath });
  try {
    await once(writer, "message");
    const db = openMissionControlDb(filePath);
    try {
      expect(db.prepare("SELECT count(*) AS count FROM identities").get()?.count).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  } finally {
    await writer.terminate();
    rmSync(directory, { recursive: true, force: true });
  }
});
