import { openMissionControlDb } from "@ocmc/db";
import { DATABASE_PATH, FATHOM_RECORDINGS_ROOT } from "./config";
import { backfillMeetingAssertionAssociations, backfillMeetingNotes } from "./meetings-ingestion";
import { refreshMissionControlState } from "./refresh";

type WorkerCommand = "refresh" | "backfill-meetings" | "backfill-assertion-associations";

type CliOptions = {
  command: WorkerCommand;
  rootDir?: string;
  dbPath?: string;
};

function parseArgs(argv: string[]): CliOptions {
  let command: WorkerCommand = "refresh";
  let rootDir: string | undefined;
  let dbPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument) {
      continue;
    }
    if (argument === "refresh" || argument === "backfill-meetings" || argument === "backfill-assertion-associations") {
      command = argument;
      continue;
    }
    if (argument === "--root") {
      rootDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--db-path") {
      dbPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--json") {
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { command, rootDir, dbPath };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "backfill-meetings") {
    const db = openMissionControlDb(options.dbPath ?? DATABASE_PATH);
    const summary = backfillMeetingNotes(db, {
      rootDir: options.rootDir ?? FATHOM_RECORDINGS_ROOT,
    });
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    return;
  }

  if (options.command === "backfill-assertion-associations") {
    const db = openMissionControlDb(options.dbPath ?? DATABASE_PATH);
    const summary = backfillMeetingAssertionAssociations(db);
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    return;
  }

  const snapshot = await refreshMissionControlState();
  process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
