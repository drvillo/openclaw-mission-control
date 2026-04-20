import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const nextRoot = path.join(appRoot, ".next");
const standaloneRoot = path.join(nextRoot, "standalone", "apps", "web");
const standaloneNextRoot = path.join(standaloneRoot, ".next");
const staticSource = path.join(nextRoot, "static");
const staticTarget = path.join(standaloneNextRoot, "static");
const publicSource = path.join(appRoot, "public");
const publicTarget = path.join(standaloneRoot, "public");

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

await mkdir(standaloneNextRoot, { recursive: true });

if (await exists(staticSource)) {
  await cp(staticSource, staticTarget, { recursive: true, force: true });
}

if (await exists(publicSource)) {
  await cp(publicSource, publicTarget, { recursive: true, force: true });
}

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      standaloneRoot,
      copiedStatic: await exists(staticTarget),
      copiedPublic: await exists(publicTarget),
    },
    null,
    2,
  ) + "\n",
);

