# Pinned external semantic-layer distribution

`openclaw-semantic-layer.tgz` is a built snapshot of the independently owned
`@openclaw/semantic-layer` package from
`/Users/fonkey-oc/.openclaw/lib/semantic-layer`, captured on 2026-11-09.
It is a dependency distribution, not a new Mission Control workspace package.
The implementation remains maintained outside this repository.

The private package has no published registry or Git distribution. Previously,
both consumers used a developer-machine absolute `file:` path and the lockfile
resolved it to `../lib/semantic-layer`. Neither location exists in a clean CI
checkout. Both consumers now use this repository-relative archive; pnpm pins its
integrity in the lockfile. Frozen installs remain mandatory and require no host
OpenClaw installation, network credentials, or sibling checkout.

The archive includes the unchanged package manifest, TypeScript source/types,
freshly compiled JavaScript, tests, README, tsconfig and upstream lockfile. It
contains no node_modules, local state, environment files or meeting-note data.
No runtime stub or semantic feature removal is involved.

SHA-256: `37d5acc8a3b70d69674fe1d3c75511da657db65e248e90316dc0afca39051e83`

## Refreshing the dependency

1. Stage the external package's `src`, `package.json`, `pnpm-lock.yaml`,
   `tsconfig.json` and `README.md` in a clean temporary `package/` directory.
   Do not copy node_modules or an existing dist directory.
2. In that directory, using pnpm 10.32.1, run `pnpm install --frozen-lockfile`,
   `pnpm typecheck`, `pnpm build`, and `pnpm test`.
3. From the Mission Control repository root, package the verified directory:

   ```sh
   COPYFILE_DISABLE=1 tar -czf vendor/openclaw-semantic-layer.tgz \
     -C /path/to/staging --exclude=node_modules package
   shasum -a 256 vendor/openclaw-semantic-layer.tgz
   ```

4. Update the checksum above. Regenerate the root lockfile with
   `pnpm install --lockfile-only --force` (pnpm must re-read the replaced archive).
5. Verify a clean checkout with `pnpm install --frozen-lockfile`,
   `pnpm typecheck`, `pnpm build`, and `pnpm -r test`. Review the extracted
   source diff against the previous archive before committing the update.

When the upstream package gains a published immutable distribution, prefer that
instead of carrying a snapshot here. Do not restore an absolute host path.
