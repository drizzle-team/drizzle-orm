# Releasing Drizzle Postgres

How `@drizzle-team/postgres` gets published, what the pre-publish checks catch, and why CI provisions Postgres the way it does. Drizzle Postgres lives in the `postgres` folder of the drizzle-orm monorepo. Its workflows are in the monorepo's `.github/workflows`: `postgres-ci.yml` (the test gates, run for pull requests and pushes that change `postgres/`), `postgres-publish.yml` (manual release) and `postgres-preview.yml` (pkg.pr.new previews). The facts below were checked on 2026-08-11.

To release, bump `version` in `postgres/package.json`, merge it, and run the Drizzle Postgres publish workflow from the Actions tab. It fails early if that version is already on npm, then runs every job of `postgres-ci.yml` before it publishes.

## Publishing

Releases use npm trusted publishing (OIDC). There is no `NPM_TOKEN` anywhere. `npm publish` in CI generates provenance by itself, because the repo and the package are both public.

Trusted publishing cannot create a package that does not exist yet (npm/cli#8544). The bootstrap order for a new package is:

1. A human runs `npm login` and then `npm publish --access public` from a built checkout. This one version has no provenance.
2. Add the trusted publisher on npmjs.com (package Settings, Trusted Publisher): organization `drizzle-team`, repository `drizzle-orm`, workflow `postgres-publish.yml`, no environment, allowed action `npm publish`.
3. Verify that one CI publish succeeds.
4. Only then set Publishing access to "Require two-factor authentication and disallow tokens". If you set it before step 2, CI is locked out.

Pitfalls:

- npm does not validate the trusted-publisher fields on save. A wrong workflow filename (full path, wrong case, or a renamed file) shows up only at publish time, as `ENEEDAUTH` or `E404`. If `postgres-publish.yml` is renamed, update the npmjs.com record the same day.
- `npm publish` must stay in `postgres-publish.yml` itself. A reusable workflow (`workflow_call`) makes npm check the caller's filename. The gates can be a reusable workflow (`postgres-ci.yml`), because they do not publish.
- npm skips OIDC silently on every failure path. If a publish fails with a token-shaped error, run it again with `--loglevel verbose` and look for `oidc` in the log.
- `actions/setup-node` with `registry-url` writes a placeholder `_authToken` and points `NPM_CONFIG_USERCONFIG` at it. When OIDC fails, this turns a clear "not authenticated" into a confusing `E401` or `E404`.
- The first publish of a scoped package needs `--access public`, or npm answers `402`. `publishConfig.access` in `package.json` covers CI.
- npm scans every publish for malware, which delays installability by 5 to 15 minutes. `npm deprecate` and `npm unpublish` do not work during that window, so a post-publish install test will be unreliable.
- Never cache the package manager in a release build (`package-manager-cache: false`).

A token-based pipeline is not worth building. Classic tokens no longer exist. Granular tokens expire after at most 90 days, and npm is removing direct publishing for tokens that bypass 2FA.

## Tarball checks

`bun run verify:publish` (run it in `postgres/`) packs the tree once and runs four validators on that tarball. Each one catches a failure that the others miss. This was verified by deleting files from a packed tarball:

| Broken tarball | pack-check | publint | attw | smoke-pack |
|---|---|---|---|---|
| An exports target removed (`dist/cf.{js,d.ts}`) | catches | catches | catches | catches |
| An internal module removed (`dist/connection.{js,d.ts}`) | misses | misses | catches | catches |
| An internal `.js` removed, its `.d.ts` kept | misses | misses | misses | catches |

- **pack-check** owns what no tool covers: the allowlist of packed paths (no `.map` files), orphaned `dist/*.js` files that have no `src/*.ts`, and `private` or `protected` members in a `.d.ts` file. Two copies of Drizzle Postgres in one project are only compatible in types when the declarations have no such members, and the build removes them.
- **publint --strict** checks the exports map: `types` before `import`, `./` prefixes, and files excluded by `files`.
- **attw** must run with `--profile esm-only`. Without it, every subpath reports false positives for node10 resolution and CommonJS consumers.
- **smoke-pack** installs the tarball and imports every subpath. It runs under Node, because Bun resolves `exports` more permissively and would hide errors that Node users hit. `./cf` is expected to fail with `ERR_UNSUPPORTED_ESM_URL_SCHEME`, because it imports `cloudflare:sockets`. The check pins that exact code, so a broken exports map still fails.

Do not add `"sideEffects": false`, even though publint suggests it. `./buffer-polyfill` has side effects, and bundlers would drop it.

If a `prepare` script is ever added, publint and attw must lint the shared tarball instead of packing again, or the pack triggers `prepare`.

## CI Postgres

CI runs `postgres/test/setup-pg.sh` against the Postgres server that the `ubuntu-24.04` runner image already has. A `services: postgres` container cannot replace it: the script writes its own `pg_hba.conf` (trust, md5 and scram side by side), turns on SSL with a generated certificate, and sets `wal_level = logical`. The auth, TLS and replication tests depend on all three.

- The runner image keeps `initdb` and `pg_ctl` in `/usr/lib/postgresql/<major>/bin`, which is not on `PATH`. The workflow adds it, and it prints `postgres --version` so that a major version change by an image update is visible in the log.
- The supported floor is Postgres 14: the pgoutput `binary` and `messages` options need it. There is no ceiling. A matrix across major versions was declined because it repeats the same wire-protocol tests; add one only if a version-specific bug appears.
- Runners are slower than a laptop, so CI passes `--timeout 20000` and `DRIZZLE_POSTGRES_TEST_TIMEOUT_MS=20000`. The replication and concurrency tests are the most sensitive.
- When `pg_ctl -w start` fails, the reason is only in `postgres/test/.pgdata/server.log`, so the workflow prints that file on failure.
