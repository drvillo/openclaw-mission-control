import { refreshMissionControlState } from "./refresh";

async function main() {
  const snapshot = await refreshMissionControlState();
  process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
