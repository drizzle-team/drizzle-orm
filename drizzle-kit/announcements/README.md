# Announcement manifest

This directory is the source of truth for drizzle-kit's announcement manifest.
It is served over jsDelivr from the `main` branch at:

```
https://cdn.jsdelivr.net/gh/drizzle-team/drizzle-orm@main/drizzle-kit/announcements/v1.json
```

The file is **not** shipped in the npm tarball and **not** copied into `dist` —
editing `v1.json` and merging to `main` is the entire publish pipeline.

A breaking schema change ships as a sibling `v2.json`; old drizzle-kit binaries
keep reading `v1.json` forever, so there is no in-file schema version field to
bump — the filename is the compatibility mechanism.

## Schema

```ts
type Manifest = {
  disabled?: boolean;
  entries: Entry[];
};

type Entry = {
  id: string;
  range: string;
  template: string;
  data: Record<string, string>;
  message?: string;
  expires?: string;
};
```

- **`disabled`** — root-level kill switch. See "Kill switch" below.
- **`entries`** — evaluated in array order. See "Matching" below.
- **`id`** — stable identifier for this entry, used when referencing it in this
  runbook (e.g. "retire entry `rc-ga-nudge`").
- **`range`** — a semver range matched against the installed drizzle-kit
  version. See "Range authoring" below — this is the part most likely to be
  gotten wrong.
- **`template`** — the id of a built-in template shipped with the client. The
  only one currently shipped is `new-version`, which requires `data.package`,
  `data.tag`, and `data.version` (all three required). Each value is
  restricted to the character class `A-Za-z0-9@/._-` (no spaces, no shell
  metacharacters) — an entry with a value outside that class is skipped
  entirely. An unknown `template` id is also silently skipped, so future
  template types can be added without breaking old binaries.
- **`message`** — optional freeform text, shown only on human TTYs (never to
  agents, never under `--output json`). It is sanitized (ANSI/control
  characters stripped) and capped at 3 lines / 500 characters; anything past
  the cap is truncated with an ellipsis.
- **`expires`** — optional ISO date. Past this date the entry self-retires
  even if a CDN edge or a client-side cache is still serving a stale copy of
  the manifest.

Unknown fields anywhere in the manifest are tolerated, not rejected — this
keeps old binaries forward-compatible with future schema growth.

### Example entry

```json
{
  "id": "rc-ga-nudge",
  "range": ">=1.0.0-0 <2.0.0",
  "template": "new-version",
  "data": {
    "package": "drizzle-kit",
    "tag": "latest",
    "version": "1.0.0"
  },
  "expires": "2026-12-31"
}
```

## Matching

Entries are evaluated in array order. The **first** entry whose `range`
matches the installed version — and that also passes validation, hasn't
expired, and has a known template with valid `data` — is the only one
rendered. Array order is the priority order: at most one notice prints per
invocation, no matter how many entries the manifest accumulates. If a
version falls inside two overlapping ranges, the **earlier** entry in the
array wins; the later one is never considered.

`entries: []` is a valid manifest state — it renders nothing.

## Kill switch

Root-level `disabled: true` is the break-glass switch: it stops **all**
rendering, unconditionally, and takes precedence over every entry regardless
of range or expiry. Use it when something needs to be silenced immediately
and there isn't time to reason about which individual entries are at fault.

To retire a single announcement instead of silencing everything, delete its
entry from the `entries` array — there is no per-entry `enabled` flag.

## Range authoring (read this before adding an entry)

During the rc line, the installed drizzle-kit version is a prerelease, e.g.
`1.0.0-rc.7`. The client matches ranges with prerelease-inclusive semantics,
but that does **not** lift a range's numeric lower bound. A plain `^1.0.0` or
`>=1.0.0` **never** matches `1.0.0-rc.7` — semver prerelease precedence puts
`1.0.0-rc.7` below `1.0.0`, so the comparison fails before prerelease
inclusion is even considered.

Any range meant to target the rc line must use a prerelease-inclusive lower
bound. Recommended form:

```
>=1.0.0-0 <2.0.0
```

Also valid: `^1.0.0-0`, `1.x`, `*`.

If an entry silently never fires even though the installed version "obviously"
falls in range, this is almost always the cause — check the lower bound.

The complement applies to **upper** bounds. Under prerelease-inclusive
matching, a plain `<1.0.0` admits every `1.0.0-*` prerelease — a range meant
to target only the 0.x line would leak its notice to every rc install. A
range that must stop below the 1.0 line ends at `<1.0.0-0`:

```
>=0.31.11 <1.0.0-0
```

The shipped `rc-nudge-0x` entry uses exactly this form: it fires for 0.x
releases that carry the announcement client and never for the rc line.

## Client behavior (summary)

- Fetched at most once per day per machine; a fresh manifest fetch only
  happens once that daily window has elapsed.
- 1.5-second fail-silent timeout — any network error, timeout, or malformed
  response is treated the same as "nothing to show".
- Skipped entirely in CI and when an opt-out environment variable is set.
- Output goes to stderr only; stdout is never touched.
- Plain `GET` request, no query parameters.

## Update runbook

1. Edit `v1.json` in a PR, get it reviewed, merge to `main`.
2. jsDelivr's `@main` edge cache is at most 12 hours, so routine updates
   propagate on their own with no further action.
3. For urgent changes — most commonly flipping the kill switch — purge the
   CDN cache manually instead of waiting out the edge cache:

   ```
   curl https://purge.jsdelivr.net/gh/drizzle-team/drizzle-orm@main/drizzle-kit/announcements/v1.json
   ```

   This endpoint is rate-limited to a handful of purges per URL per hour.
   After purging, verify the live content directly:

   ```
   curl https://cdn.jsdelivr.net/gh/drizzle-team/drizzle-orm@main/drizzle-kit/announcements/v1.json
   ```

There is no CI workflow that auto-purges on manifest change — this is a
manual step by design, since manifest edits are infrequent and the fail-silent
client tolerates staleness.
