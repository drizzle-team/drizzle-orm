# PostgreSQL Driver Test Suite — Derived from postgres.js & node-postgres Issues

## Overview

This document clusters **3258 classified issues** — drawn from a 3258-issue corpus spanning **postgres.js (798)** and **node-postgres (2460)** — into **43 test modules**. Each module groups real-world, issue-derived failure modes into concrete, runnable test cases so that a PostgreSQL driver can be validated against the accumulated bug history of the two most widely used Node.js Postgres clients.

## Methodology

The full issue corpus was pulled via the GitHub API across both repositories. Each issue underwent content-based classification into a 26-category driver taxonomy (connection, pooling, parameters, types, transactions, and so on). Within each bucket, issues were clustered into representative test cases capturing the underlying defect or behavioral expectation. Every section then went through adversarial verification to confirm the test cases reflect genuine, reproducible driver behavior rather than user error, followed by gap analysis to surface untested areas.

## Category Distribution

| Module | Issues | Bugs+Regr | High-testable |
|---|---:|---:|---:|
| parameters | 315 | 95 | 171 |
| pooling | 250 | 99 | 45 |
| runtime-portability | 250 | 166 | 0 |
| api-ergonomics | 228 | 30 | 20 |
| lifecycle-reconnect | 207 | 150 | 34 |
| connection | 196 | 73 | 34 |
| docs | 163 | 2 | 1 |
| errors-notices | 162 | 71 | 39 |
| results | 141 | 56 | 76 |
| other | 131 | 14 | 0 |
| build-native | 126 | 91 | 0 |
| query-protocol | 93 | 35 | 24 |
| tls-ssl | 90 | 42 | 12 |
| cursors-streaming | 90 | 44 | 18 |
| performance | 80 | 33 | 0 |
| transactions | 79 | 23 | 35 |
| auth | 72 | 38 | 7 |
| types/datetime | 72 | 41 | 47 |
| types/json | 62 | 36 | 53 |
| types/array | 53 | 41 | 42 |
| prepared-statements | 52 | 24 | 19 |
| types/numeric | 46 | 15 | 38 |
| concurrency | 37 | 17 | 5 |
| cancellation-timeout | 36 | 14 | 14 |
| copy | 34 | 19 | 3 |
| listen-notify | 33 | 17 | 11 |
| types/custom | 29 | 11 | 7 |
| types/bytea | 21 | 13 | 18 |
| security | 19 | 8 | 4 |
| replication | 16 | 10 | 0 |
| encoding | 15 | 10 | 2 |
| types/composite | 14 | 2 | 6 |
| types/text | 12 | 9 | 6 |
| types/geometric | 8 | 0 | 3 |
| types/oid | 8 | 7 | 0 |
| types/binary-format | 4 | 2 | 2 |
| types/bool | 3 | 0 | 3 |
| types/domain | 3 | 1 | 1 |
| types/uuid | 2 | 0 | 2 |
| types/range | 2 | 1 | 2 |
| types/other | 2 | 0 | 0 |
| types/enum | 1 | 0 | 1 |
| types/hstore | 1 | 0 | 1 |

## Table of Contents

- [Connection](#connection) (196 issues)
- [TLS / SSL](#tls-ssl) (90 issues)
- [Auth](#auth) (72 issues)
- [Pooling](#pooling) (250 issues)
- [Connection Lifecycle & Reconnect](#connection-lifecycle-reconnect) (207 issues)
- [Query Protocol](#query-protocol) (93 issues)
- [Prepared Statements](#prepared-statements) (52 issues)
- [Parameters](#parameters) (315 issues)
- [Data Types — numeric](#data-types-numeric) (46 issues)
- [Data Types — datetime](#data-types-datetime) (72 issues)
- [Data Types — bool](#data-types-bool) (3 issues)
- [Data Types — json](#data-types-json) (62 issues)
- [Data Types — array](#data-types-array) (53 issues)
- [Data Types — text](#data-types-text) (12 issues)
- [Data Types — bytea](#data-types-bytea) (21 issues)
- [Data Types — uuid](#data-types-uuid) (2 issues)
- [Data Types — geometric](#data-types-geometric) (8 issues)
- [Data Types — range](#data-types-range) (2 issues)
- [Data Types — enum](#data-types-enum) (1 issues)
- [Data Types — composite](#data-types-composite) (14 issues)
- [Data Types — domain](#data-types-domain) (3 issues)
- [Data Types — custom](#data-types-custom) (29 issues)
- [Data Types — binary-format](#data-types-binary-format) (4 issues)
- [Data Types — hstore](#data-types-hstore) (1 issues)
- [Data Types — oid](#data-types-oid) (8 issues)
- [Data Types — other](#data-types-other) (2 issues)
- [Copy](#copy) (34 issues)
- [LISTEN / NOTIFY](#listen-notify) (33 issues)
- [Cursors & Streaming](#cursors-streaming) (90 issues)
- [Transactions](#transactions) (79 issues)
- [Cancellation & Timeouts](#cancellation-timeouts) (36 issues)
- [Errors & Notices](#errors-notices) (162 issues)
- [Results](#results) (141 issues)
- [Encoding](#encoding) (15 issues)
- [Replication](#replication) (16 issues)
- [Performance](#performance) (80 issues)
- [Concurrency](#concurrency) (37 issues)
- [Runtime & Portability](#runtime-portability) (250 issues)
- [API Ergonomics](#api-ergonomics) (228 issues)
- [Security](#security) (19 issues)
- [Build & Native Bindings](#build-native-bindings) (126 issues)
- [Docs](#docs) (163 issues)
- [Other](#other) (131 issues)



## Connection

_Covers everything that happens before the first query runs: parsing connection strings/URLs, resolving env-var and OS defaults, opening the transport (TCP, unix socket, custom stream), DNS/multi-host selection, building the startup packet, and surfacing connect success/failure deterministically. Bugs here block all usage, so correctness and clear errors are non-negotiable._

### Connection-string / URL password & special-character parsing
**Why it matters / failure mode:** Userinfo and query components routinely contain reserved URL characters. Naive `new URL()` / regex parsers throw `Invalid URL`/`URIError` or silently corrupt credentials, producing auth failures that look like server bugs. This is the single most reported connection defect and hits **both drivers**.
- **Test:** A percent-encoded password (`%23` → `#`, `%40` → `@`) in `postgres://u:p%40ss%23@host/db` decodes to the literal bytes `p@ss#` and authenticates with that exact value. _(refs: node-postgres#2331, node-postgres#2401, postgres.js#399, postgres.js#735)_
- **Test:** A password ending in or containing `/` (e.g. `pa/ss`) parses without throwing `Invalid URL`/`Invalid URI`; the database/path segment is unaffected. _(refs: node-postgres#3013, node-postgres#3376)_
- **Test:** A password containing a literal `?` either parses correctly when percent-encoded, or raises a clear "invalid connection string" error when raw — never truncates at `?` and treats the remainder as query params. _(refs: node-postgres#34, node-postgres#57, node-postgres#3557)_
- **Test:** A password containing a space (percent-encoded `%20`) decodes to a single space and connects. _(refs: node-postgres#258)_
- **Test:** A password containing `%` or `\` parses without `URIError: URI malformed`; the decoded value matches the original byte-for-byte. _(refs: node-postgres#133, postgres.js#890, postgres.js#735)_
- **Test:** A URL-encoded `@` in the username (`user%40host`) decodes to `user@host` and is sent as the role name — host parsing is not derailed by the embedded `@`. _(refs: node-postgres#2288, node-postgres#2401)_
- **Test:** A connection string with an empty password (`postgres://user:@host/db`) parses to `password=""` and connects without error. _(refs: node-postgres#854)_
- **Test:** An invalid/malformed URL throws a meaningful error message, not `Cannot read properties of undefined (reading 'searchParams')` or a generic TypeError. _(refs: node-postgres#3513, node-postgres#1086, node-postgres#1181)_

### Connection-string field extraction & defaults
**Why it matters / failure mode:** Passing a URI string where an object is expected, or omitting fields, has historically produced char-indexed objects, `host="base"`, or defaulting to the OS user — connecting to the wrong place silently.
- **Test:** `new Pool(connectionString)` / `new Pool({ connectionString })` with `postgres://user@host:5433/db` yields host=`host`, port=`5433`, user=`user`, database=`db` — not a string treated as `{0:'p',1:'o',...}` and not `localhost:5432`. _(refs: node-postgres#1228, node-postgres#1263, node-postgres#1141)_
- **Test:** A URL with no pathname (`postgres://user@host` / `postgres://host`) defaults the database name to the username instead of throwing `Cannot read property 'slice' of null`. _(refs: postgres.js#3, postgres.js#141)_
- **Test:** A connectionString containing only a bare database token does not get mis-parsed so that host becomes `base`; host defaults to `localhost`. _(refs: node-postgres#3108)_
- **Test:** Standard `postgres://user:pass@host:123/base` round-trips to user/password/host/port/database correctly regardless of the underlying URL implementation (browser/polyfill). _(refs: node-postgres#3126, node-postgres#3032, node-postgres#3187)_
- **Test:** An explicit user in the connection string authenticates as that user and never silently falls back to the OS username. _(refs: node-postgres#1168, node-postgres#1538)_
- **Test:** When both `connectionString` and explicit option keys (`user`, `password`) are supplied, the explicit options override/merge with the parsed string rather than being ignored. _(refs: node-postgres#3327, postgres.js#832)_
- **Test:** A `parse()`/serialize round-trip (`toString`) of a parsed config reproduces an equivalent, re-parseable connection string. _(refs: node-postgres#2267)_

### Environment variables & OS defaults
**Why it matters / failure mode:** libpq semantics require PG* env vars and sensible fallbacks. Wrong precedence or reading env at the wrong time causes "role does not exist" against the OS username.
- **Test:** A Client/Pool constructed with no host reads `PGHOST` (including DNS hostnames, not only IPs) at connect time. _(refs: node-postgres#3137, node-postgres#1497, node-postgres#2769)_
- **Test:** Username defaults from `PGUSER`/`PGUSERNAME` per libpq; only when unset does it fall back to the OS username, and an unset OS `USER` does not yield `undefined`. _(refs: postgres.js#19, node-postgres#847, node-postgres#1658)_
- **Test:** When no database is configured, the database name defaults to the (resolved) username, matching psql. _(refs: node-postgres#788, postgres.js#141)_
- **Test:** PG* env vars set before Pool instantiation are honored at connect time (read lazily), not snapshotted at module load. _(refs: node-postgres#2769)_
- **Test:** An explicit `host` in config takes precedence over `PGHOST`. _(refs: node-postgres#2963)_

### Unix domain sockets
**Why it matters / failure mode:** Cloud SQL / local sockets are common; drivers must treat an absolute/socket path as a socket (not DNS-resolve it), and not double-append `.s.PGSQL.<port>`. Hits **both drivers**.
- **Test:** Setting `host` to a socket directory path (e.g. `/var/run/postgresql` or `/cloudsql/proj:region:inst`) connects over the unix socket and runs a query returning rows — no `getaddrinfo`/EPIPE/ECONNREFUSED. _(refs: node-postgres#16, node-postgres#122, node-postgres#1617, node-postgres#1827, node-postgres#2415, node-postgres#3146, postgres.js#484, postgres.js#950)_
- **Test:** A connection string `postgres:///dbname` (empty host) connects via the default unix socket without injecting a TCP host/port. _(refs: node-postgres#1493)_
- **Test:** A `?host=/run/postgresql` query param or percent-encoded socket host in the URL is decoded and used as the socket path. _(refs: postgres.js#984, postgres.js#346, postgres.js#1057, node-postgres#2976)_
- **Test:** A unix-socket connection string allows specifying a database name distinct from the username. _(refs: node-postgres#484)_
- **Test:** The socket path is used as-is (no `.s.PGSQL.<port>` double-append) including under any native/alternate client path. _(refs: node-postgres#277, node-postgres#287)_

### Startup packet & startup parameters
**Why it matters / failure mode:** PostgreSQL 14+/15+ strictly rejects a startup packet that is not null-terminated (`invalid startup packet layout: expected terminator as last byte`). Startup params (user, database, application_name, options, search_path, TimeZone) must be sent as distinct, properly encoded key/value pairs. Hits **both drivers**.
- **Test:** The startup message ends with a single null terminator byte; connecting to PostgreSQL 15+ succeeds (no FATAL terminator error), including for parameterized inserts. _(refs: node-postgres#62, node-postgres#63, node-postgres#88, postgres.js#542)_
- **Test:** `user` and `database` are sent as separate startup parameters; supplying both never concatenates into a malformed role name. _(refs: node-postgres#349)_
- **Test:** A configured `application_name` appears in `pg_stat_activity.application_name` for the connection, including for implicit BEGIN/COMMIT/ROLLBACK queries. _(refs: node-postgres#1223, node-postgres#3392)_
- **Test:** When no application_name is set, a default `fallback_application_name` identifying the driver is sent and visible in `pg_stat_activity`. _(refs: node-postgres#1883)_
- **Test:** An `options`/`PGOPTIONS` parameter (e.g. `-c search_path=myschema -c timezone=UTC`) is forwarded in the startup packet and takes effect on the session. _(refs: node-postgres#1095, node-postgres#1482, node-postgres#2214, node-postgres#2416)_
- **Test:** A connect-time `TimeZone` option sets `SHOW TimeZone` to the requested value (e.g. UTC) on the session. _(refs: node-postgres#983, postgres.js#873)_
- **Test:** A connect-time `DateStyle` option/hook is reflected by `SHOW datestyle` on that session. _(refs: postgres.js#645, postgres.js#969)_
- **Test:** The `server_version` parameter-status received during startup is exposed on the connection object without issuing `SELECT version()`. _(refs: node-postgres#2002)_
- **Test:** The backend PID from `BackendKeyData` is exposed on the client (e.g. `client.processID`) without an extra query. _(refs: node-postgres#2665)_

### Default schema / search_path on connect
**Why it matters / failure mode:** A "schema"/currentSchema option that silently does nothing leads to `relation does not exist`. The driver must either set `search_path` itself or refuse to forward `schema` as a server param (which PG rejects as `unrecognized configuration parameter`).
- **Test:** A `schema`/`search_path`/`currentSchema` connection option causes `SHOW search_path` to include that schema and makes unqualified table references resolve there. _(refs: node-postgres#1023, node-postgres#1123, node-postgres#1199, node-postgres#1421, node-postgres#1499, node-postgres#2629, postgres.js#535)_
- **Test:** A `schema` querystring param is NOT forwarded as a raw startup parameter (it would trigger `unrecognized configuration parameter "schema"`); it is translated into `search_path`. _(refs: postgres.js#367)_
- **Test:** When no schema option is given, the role's configured default `search_path` is respected (driver does not override it to `public` only). _(refs: node-postgres#2419, node-postgres#850)_
- **Test:** An `onconnect`/connect hook runs a configured statement (e.g. `SET search_path = ...` / `SET DATESTYLE`) on every newly opened pooled connection before it serves queries. _(refs: postgres.js#1146, postgres.js#645)_

### Config validation & non-string option coercion (regression guard)
**Why it matters / failure mode:** Passing a non-string startup value (object, number) historically crashed inside `Writer.addCString`/`Buffer.byteLength` with `ERR_INVALID_ARG_TYPE` instead of a clear error — a recurring 8.x regression. **Known footgun: validate/coerce every value that goes into the startup packet.**
- **Test:** Passing an object-valued `options` (or any object where a string param is expected) throws a clear, descriptive validation error — never `ERR_INVALID_ARG_TYPE` / Buffer byteLength TypeError from deep in protocol encoding. _(refs: node-postgres#2290, node-postgres#2306, node-postgres#2755, node-postgres#2960, node-postgres#3587)_
- **Test:** Numeric options passed as strings (`max:'20'`, `idle_timeout:'10'`, `connect_timeout:'5'`, `port:'5433'`) are coerced to numbers so pool sizing/timers behave correctly. _(refs: postgres.js#622, node-postgres#3311)_
- **Test:** Calling `connect()` does not mutate the user-supplied config object (no side effects on the passed options). _(refs: node-postgres#1059)_
- **Test:** Using a wrong option name (`username` instead of `user`) does not silently kill the connect promise; it fails authentication clearly or surfaces an unknown-option signal. _(refs: node-postgres#2193)_
- **Test:** An undefined `connectionString`/`host` produces a clear configuration error (not a misleading "Server does not support SSL" or `getaddrinfo ENOTFOUND undefined`). _(refs: node-postgres#1391, node-postgres#1086)_

### DNS, multi-host & failover
**Why it matters / failure mode:** IPv6-first `localhost` resolution broke connections under Node 17+; multi-host strings and round-robin DNS must be tried in order with fresh resolution.
- **Test:** Connecting to `localhost` falls back to IPv4 when the server listens only on IPv4, avoiding `ECONNREFUSED ::1` under Node 17+ DNS ordering. _(refs: node-postgres#2643, node-postgres#2970)_
- **Test:** A connection string with multiple comma-separated hosts parses into valid host/port pairs (database field not corrupted) and tries each host in order until one connects. _(refs: node-postgres#1470, node-postgres#2308, postgres.js#812)_
- **Test:** With `target_session_attrs=read-write`/`primary`, the driver connects only to a writable primary among the listed hosts. _(refs: node-postgres#932, node-postgres#2781)_
- **Test:** When a hostname resolves to multiple IPs, the driver tries alternate addresses on failure and distributes successive new connections across them (round-robin), re-resolving rather than caching a stale IP (`hostaddr` off). _(refs: node-postgres#1733, node-postgres#2772, node-postgres#2911, node-postgres#1748)_
- **Test:** An unresolvable host rejects the connect promise with a consistent `ENOTFOUND` error (catchable, same message across Node versions); a transient failure surfaces as catchable `EAI_AGAIN`. _(refs: node-postgres#791, node-postgres#1506, node-postgres#2091)_

### Connect lifecycle: promise resolution, errors, no silent hangs
**Why it matters / failure mode:** `client.connect()` must always settle (resolve or reject) — historically it hung indefinitely or "failed silently," and async usage threw `callback is not a function`. This is a high-frequency support burden across platforms.
- **Test:** `client.connect()` returns a promise that resolves on success and rejects (catchable in try/catch / `.catch`) on failure — never throws `callback is not a function` and never returns an unsettled promise. _(refs: node-postgres#1716, node-postgres#2019, node-postgres#2235, node-postgres#2246)_
- **Test:** Connecting to an unreachable/refused endpoint rejects with `ECONNREFUSED`; a blocked route rejects with `ETIMEDOUT` after the configured `connect_timeout` rather than hanging. _(refs: node-postgres#2222, node-postgres#1180, node-postgres#3169)_
- **Test:** Connecting to a non-Postgres server (wrong port / MySQL) fails fast with a clear error instead of looping, crashing, or emitting `Unrecognized message code`. _(refs: node-postgres#1694, node-postgres#254)_
- **Test:** Connecting with a database that does not exist rejects with SQLSTATE `3D000` (`database "x" does not exist`). _(refs: node-postgres#1196, node-postgres#1999)_
- **Test:** `pool.connect()` always invokes its callback / settles its promise (success or error) and never hangs indefinitely on any platform. _(refs: node-postgres#2282, node-postgres#2300, node-postgres#2397, node-postgres#2250, node-postgres#2227)_
- **Test:** A lazy/manual connect option establishes the connection on demand (before first query) rather than auto-connecting on first query. _(refs: postgres.js#60)_

### Custom transport (socket / Duplex stream)
**Why it matters / failure mode:** Cloud SQL connectors, SOCKS proxies, Cloudflare Workers, and SSH tunnels require supplying a custom stream. The driver must route I/O over it and not assume `net.Socket`-only methods exist.
- **Test:** A caller-provided `net.Socket`/Duplex stream (or `stream` factory) is used as the connection transport and queries run over it. _(refs: node-postgres#2503, node-postgres#3195, postgres.js#284, postgres.js#938, postgres.js#1070)_
- **Test:** When a custom Duplex stream is supplied, the driver does not call socket-only methods like `setNoDelay` unconditionally (guard for absence) — no `setNoDelay is not a function`. _(refs: node-postgres#2896)_
- **Test:** A pre-connected socket passed in config is used as-is without re-initiating connection; `socketOptions` only govern default socket creation. _(refs: node-postgres#3629)_

### libpq keyword/value connection strings & service files
**Why it matters / failure mode:** Tooling and ops emit libpq `key=value` DSNs and `service=`/`pg_service.conf` configs; supporting them avoids forcing manual translation.
- **Test:** A libpq keyword/value string (`host=h user=u dbname=d port=5433`) parses into equivalent client config and connects. _(refs: node-postgres#1756, node-postgres#2125)_
- **Test:** A `service=` parameter resolves connection settings from `pg_service.conf`. _(refs: node-postgres#416)_
- **Test:** `parse()` accepts an RDS/Secrets-Manager JSON blob (host/port/username/password/dbname) and produces valid config. _(refs: node-postgres#2185)_

### ✅ Verification notes
- Correctness: expected behaviors are sound per PostgreSQL semantics (startup-packet terminator strictness from PG14, SQLSTATE 3D000 for missing DB, `schema` correctly NOT forwarded as a raw startup GUC, database defaulting to username per libpq, `options=-c key=value` forwarding, empty-password parse to `""`).
- Correction (line ~29): cites `PGUSERNAME` as a libpq default — libpq only defines `PGUSER`. Drop `PGUSERNAME`; test username fallback against `PGUSER` only (postgres.js#19, node-postgres#847).
- Omitted high-signal test (bug, testable=high): **node-postgres#3418** — parsing a connection URL with query params should expose them consistently in a documented property (e.g. `options`), distinct from the PGOPTIONS-forwarding case on the startup-packet line. Add a test asserting URL query params are surfaced on the parsed config as documented.


## TLS / SSL

_Covers how the driver decides whether to use TLS, negotiates the Postgres SSLRequest handshake, resolves trust/verification (CA, self-signed, hostname/SNI), presents client certificates, and surfaces errors. TLS is the single most error-prone connection path: both node-postgres and postgres.js have repeated, overlapping bug/regression history here, so a new driver needs deterministic coverage of config parsing, negotiation framing, and verification semantics._

### SSL config type coercion (boolean / string / object)
**Why it matters / failure mode:** Historically `ssl` was treated as an object via the `in` operator, so `ssl: true`, `ssl: false`, or `ssl: 'require'` crashed with `Cannot use 'in' operator to search for 'key' in true/false`. This is a hard regression that broke whole major versions.
- **Test:** `ssl: true` establishes a TLS connection against an SSL-enabled server and never throws a TypeError about the `in` operator. _(refs: node-postgres#2406, node-postgres#2411, node-postgres#2892)_
- **Test:** `ssl: false` connects in plaintext (no SSLRequest sent) and never throws `Cannot use 'in' operator ... in false`; explicit false must win over any default SSL auto-detection. _(refs: node-postgres#2449, node-postgres#2754, node-postgres#848)_
- **Test:** `ssl: 'require'` (string) is accepted and enables SSL rather than throwing a TypeError. _(refs: node-postgres#2659)_
- **Test:** `ssl: { ca, key, cert }` object is honored (not coerced/ignored because it is non-boolean), and its fields reach `tls.connect`. _(refs: node-postgres#1069)_

### Connection-string sslmode parsing
**Why it matters / failure mode:** `sslmode` in URLs must be parsed into SSL config, not leaked into the database name or treated as falsey. Both drivers mishandled `sslmode` values.
- **Test:** `?sslmode=disable` disables SSL and the token is stripped from the dbname; no SSLRequest is sent. _(refs: node-postgres#1949, postgres.js#177)_
- **Test:** `?sslmode=require` enables SSL on; per spec `require` encrypts but does not verify the CA/hostname (rejectUnauthorized effectively false), so a self-signed server cert still connects. _(refs: node-postgres#2375, node-postgres#2607)_
- **Test:** `?sslmode=no-verify` sets `rejectUnauthorized=false` (SSL on, no cert verification). _(refs: node-postgres#2281, node-postgres#2607)_
- **Test:** `?sslmode=verify-full` / `verify-ca` enables SSL with certificate verification (rejectUnauthorized true), and `verify-full` additionally validates hostname. _(refs: node-postgres#1884, node-postgres#2934)_
- **Test:** `?ssl=true` in the URL enables a secure connection. _(refs: node-postgres#275, node-postgres#532)_
- **Test:** sslmode is configurable via the Pool/Client config object, not only the connection string. _(refs: node-postgres#3563)_

### connectionString + explicit ssl merge precedence
**Why it matters / failure mode:** When both a connection string and an `ssl` object are passed, several regressions wiped or ignored the explicit `ssl`. Deep-merge precedence must be deterministic.
- **Test:** Given `connectionString` plus an explicit `ssl: { ca }`, the explicit ssl object is preserved and used (not overwritten by sslmode parsed from the string). _(refs: node-postgres#1709, node-postgres#2380, node-postgres#3355)_

### SSLRequest negotiation framing
**Why it matters / failure mode:** Postgres SSL is an in-band upgrade: client sends the 8-byte SSLRequest (code 80877103) and reads exactly one byte (`S` = proceed, `N` = decline) before StartupMessage. Ordering/framing bugs produced `unsupported frontend protocol 1234.5679`.
- **Test:** With SSL enabled the driver sends the SSLRequest BEFORE the StartupMessage; the server never reports `unsupported frontend protocol 1234.5679`. _(refs: node-postgres#2085, node-postgres#2089, node-postgres#2128)_
- **Test:** The client reliably reads the single-byte `S` reply (even if delivered in its own TCP segment / late `data` event) and completes the TLS handshake. _(refs: node-postgres#1160, node-postgres#1521)_
- **Test:** SSL upgrades the existing TCP socket in place; the driver opens exactly one TCP connection, not a second one. _(refs: node-postgres#3045)_
- **Test:** Writing during/after the TLS upgrade uses a valid stream and correct encoding — no `this.stream.write is not a function` and no `ERR_UNKNOWN_ENCODING: Unknown encoding: 1`. _(refs: node-postgres#3294, postgres.js#218)_

### Server lacks SSL support / prefer fallback
**Why it matters / failure mode:** On an `N` reply the driver must either error clearly or fall back per sslmode. Bugs left dangling sockets (open handles) or gave misleading errors.
- **Test:** With SSL required against a server that replies `N`, the driver raises a clear `server does not support SSL connections` error and closes the socket (no leaked open handle). _(refs: node-postgres#1262, node-postgres#553, node-postgres#2079)_
- **Test:** `sslmode=prefer` attempts SSL first and transparently falls back to a plaintext connection when the server declines, instead of erroring. _(refs: node-postgres#2720, node-postgres#2775, node-postgres#2572)_
- **Test:** `sslmode=disable` performs no SSL handshake attempt, so connecting to a non-SSL server does not produce a `server does not support SSL` error. _(refs: node-postgres#3089)_
- **Test:** Connecting WITHOUT SSL to a server whose pg_hba.conf requires SSL surfaces the FATAL `no pg_hba.conf entry ... SSL off` as a catchable error with a readable message (not garbled bytes / unhandled error event). _(refs: node-postgres#390, node-postgres#2494)_

### Self-signed certs and rejectUnauthorized
**Why it matters / failure mode:** The most common real-world case (Heroku/RDS self-signed). `rejectUnauthorized:false` must skip chain validation cleanly.
- **Test:** With `ssl: { rejectUnauthorized: false }` the client connects over TLS to a server presenting a self-signed cert without raising `self-signed certificate in certificate chain`. _(refs: node-postgres#2009, node-postgres#2946, node-postgres#2880, postgres.js#38, postgres.js#359, postgres.js#597)_

### Custom CA / sslrootcert (verified TLS)
**Why it matters / failure mode:** Providing a CA must enable real verification (rejectUnauthorized true) so users do not need to disable validation.
- **Test:** Providing `ssl.ca` (custom CA bundle) verifies the server cert and connects with `rejectUnauthorized:true` — validation is NOT silently disabled. _(refs: node-postgres#1523, node-postgres#1540, node-postgres#3600, postgres.js#571)_
- **Test:** `sslmode=require` plus a `sslrootcert` CA file connects against an SSL-enabled server. _(refs: node-postgres#643, node-postgres#1413)_
- **Test:** `sslrootcert=system` loads the OS trusted CA roots and enables verify-full TLS instead of throwing. _(refs: node-postgres#3101, postgres.js#689)_

### Client certificate authentication
**Why it matters / failure mode:** Servers requiring `clientcert` reject the connection unless the cert/key are actually forwarded to `tls.connect`. A regression made the `ssl.key` property non-enumerable so it was dropped during copy.
- **Test:** With `ssl: { ca, key, cert }`, the client certificate is presented and a server requiring a client cert accepts the TLS connection (no `connection requires a valid client certificate`). _(refs: node-postgres#2392, node-postgres#2405, node-postgres#2424, node-postgres#727)_
- **Test:** Even after `ssl.key` is stored non-enumerably, it is still copied into the TLS options. _(refs: node-postgres#2392)_
- **Test:** Connection-string `sslcert`/`sslkey`/`sslrootcert` paths are loaded and presented as the client cert chain. _(refs: node-postgres#2024)_
- **Test:** Supplying `ca/key/cert` keeps SSL ON (does not fall back to SSL off). _(refs: node-postgres#2414)_

### Hostname verification, SNI, and servername
**Why it matters / failure mode:** Endpoint-routing providers (Neon) need SNI; IP connections need IP-altname validation; users need to override the verified name without disabling verification.
- **Test:** The TLS handshake sends SNI (server_name) derived from the host so SNI-routing providers accept the connection. _(refs: postgres.js#705)_
- **Test:** An explicit `ssl.servername` is passed to `tls.connect` for SNI/verification and is NOT overridden by `host`. _(refs: node-postgres#2803, node-postgres#2773)_
- **Test:** When connecting by IP, the IP is passed to `tls.connect` so it is validated against the cert's IP altnames, and no DEP0123 servername deprecation warning is emitted. _(refs: node-postgres#2263, node-postgres#1950)_
- **Test:** A user-supplied `ssl.checkServerIdentity` function is forwarded to the TLS connection and used for hostname verification. _(refs: node-postgres#1185, node-postgres#2178, postgres.js#62)_

### Malformed cert material → catchable error (no crash)
**Why it matters / failure mode:** Bad PEM strings caused process-killing uncaughtExceptions instead of a rejected connect.
- **Test:** Malformed `ca`/`key`/`cert` PEM rejects the connect promise/callback with a clear PEM/certificate error and does NOT crash the process via an uncaught exception. _(refs: node-postgres#2307, node-postgres#2004, node-postgres#836)_

### Direct TLS negotiation (PG 17)
**Why it matters / failure mode:** PostgreSQL 17 supports `sslnegotiation=direct`, starting the TLS handshake immediately after TCP connect (no SSLRequest preamble).
- **Test:** With `sslnegotiation=direct` against a PG17 server, the driver begins the TLS handshake immediately after TCP connect (skipping the SSLRequest byte exchange). _(refs: node-postgres#3346, postgres.js#993)_

### TLS handshake robustness / races
**Why it matters / failure mode:** Intermittent `socket disconnected before secure TLS connection` from races between TCP connect and the TLS upgrade across hosted runtimes (Fly.io, Deno, Cloudflare).
- **Test:** The TLS upgrade after TCP connect does not race; repeated connects do not intermittently fail with `socket disconnected before secure TLS connection`. _(refs: node-postgres#3401, postgres.js#763, postgres.js#1044, postgres.js#1083)_

### SSL environment variables
**Why it matters / failure mode:** libpq-compatible env vars must configure TLS for parity with psql.
- **Test:** `PGSSLCERT`, `PGSSLKEY`, `PGSSLROOTCERT` configure the client cert, key, and CA root respectively. _(refs: node-postgres#2723)_
- **Test:** `PGSSLMODE=require` initiates an SSL request (and `PGSSLMODE=no-verify` ≡ `ssl.rejectUnauthorized:false`). _(refs: node-postgres#3294, node-postgres#2607)_

### TLS protocol options and credential refresh
**Why it matters / failure mode:** Advanced options (protocol restriction, cert rotation) must pass through to the TLS layer and apply to new connections.
- **Test:** `ssl.secureOptions` is forwarded to `tls.connect` so TLS protocol versions can be restricted. _(refs: node-postgres#1769)_
- **Test:** Updating the pool's secureContext / client certificate causes subsequently created connections to use the refreshed credentials without recreating the pool. _(refs: node-postgres#2893, node-postgres#2618)_

### ✅ Verification notes
- Correction (line ~15, `?sslmode=require`): the rationale "per spec `require` encrypts but does not verify the CA/hostname" is imprecise. Per libpq, `require` does NOT verify *only when no root CA is present*; if a root CA (sslrootcert) is supplied, libpq's `require` verifies the cert like `verify-ca`. node-postgres deliberately diverges (it always sets `rejectUnauthorized:false` for `require`, per #2375), which is what the test actually asserts. Keep the test outcome (self-signed connects), but reword the justification: this is node-postgres driver behavior, not strict libpq spec.
- Clarification (lines ~16/78, `no-verify`): `no-verify` is NOT a standard libpq `sslmode` value (libpq has disable/allow/prefer/require/verify-ca/verify-full). It is a node-postgres extension mapping to `rejectUnauthorized:false`. Expectations are correct and grounded in #2281/#2607, but the test should label it driver-specific rather than implying libpq parity.
- All other expected behaviors check out against PostgreSQL/libpq semantics: in-band SSLRequest (80877103) + single-byte S/N read (lines 26-28), one-TCP-socket in-place upgrade (#3045, line 29), prefer fallback (line 35), verify-ca vs verify-full hostname distinction (line 17), sslnegotiation=direct skipping the SSLRequest preamble on PG17 (line 69), and sslrootcert=system (line 47).
- Grounding: every test maps to its cited refs. Minor: #2892 (line 7) is really "ssl:true + no CA uses default trust," not the `in`-operator crash, but it legitimately supports the ssl:true-connects assertion.
- Coverage: all high-signal (kind=bug/regression AND testable=high) refs are present — #848, #1709, #2307, #2375, #2380, #2392, #2406, #2411, #2449, postgres.js#177. No high-signal omissions. (#3144 Cloudflare Workers is kind=question and only mentioned in prose, line 72 — optionally add an explicit ref.)


## Auth

_This area covers how the driver authenticates to PostgreSQL across every wire-protocol auth method (cleartext, MD5, SCRAM-SHA-256, SSL/cert, peer/trust, GSSAPI/OAUTH), how it resolves credentials (static, env, `.pgpass`, async functions), and how it surfaces auth failures. Auth is the first thing every connection does, so a single edge-case bug here blocks the user entirely and must fail safely (catchable error) rather than crash the process._

### Credential resolution & defaults
**Why it matters / failure mode:** Drivers must resolve the effective user/password/host from a precedence chain (explicit option → connection string → env vars → OS user → `.pgpass`). Getting defaults wrong sends the wrong username in the startup packet or an empty password, producing confusing 28P01 / "no user name specified" errors.
- **Test:** When `user` is not supplied and `PGUSER` is unset, the startup packet must carry the OS login username (not empty, not a hardcoded "postgres"); connecting to a role matching the OS user authenticates. _(refs: node-postgres#1719, node-postgres#1780)_
- **Test:** The startup packet always includes a non-empty `user` parameter; a config that resolves to no username must fail client-side with a clear error, never produce server "no PostgreSQL user name specified in startup packet". _(refs: node-postgres#1780)_
- **Test:** A username containing special characters (e.g. `IAM:master`, `success computer`) is transmitted verbatim and authenticates when credentials are valid. _(refs: node-postgres#1528, node-postgres#2285)_
- **Test:** Connecting with an explicit valid user/password authenticates as that exact role and the session's `current_user` equals it, enforcing that role's privileges. _(refs: node-postgres#1628, node-postgres#1647)_

### `.pgpass` / PGPASSFILE support
**Why it matters / failure mode:** When no password is given, libpq reads `~/.pgpass` (or `$PGPASSFILE`). Both drivers have repeatedly mishandled this — wrong hostname matching, lost client context, or ignoring the file entirely. This is a both-driver footgun.
- **Test:** With no password supplied and a matching `~/.pgpass` line (`host:port:db:user:password`), the driver reads and uses that password to authenticate. _(refs: node-postgres#455, postgres.js#964)_
- **Test:** With `$PGPASSFILE` pointing to a custom file, the driver reads credentials from that file rather than defaulting host to `localhost` or ignoring it. _(refs: postgres.js#964)_
- **Test:** The hostname used for `.pgpass` matching is the unmodified host the user connected to (not a reverse-resolved/canonicalized form), so the correct line matches. _(refs: node-postgres#475)_
- **Test:** `.pgpass` wildcard fields (`*`) match any port/db/user, and the first matching line wins. _(refs: node-postgres#455)_
- **Test:** The `.pgpass` lookup runs with access to connection parameters (client context preserved) and never throws a TypeError / "Invalid context call". _(refs: node-postgres#2319)_

### Dynamic credentials (async password/username functions)
**Why it matters / failure mode:** AWS RDS IAM tokens and rotation require a fresh credential per physical connection. A function/Promise password must be resolved at connect time, re-invoked on every new connection, and not accidentally passed as a literal `[object Promise]` into SCRAM (a real crash source).
- **Test:** When `password` is a (sync or async) function, it is invoked at connect time and its resolved string is used to authenticate. _(refs: node-postgres#1873, node-postgres#2396, postgres.js#615)_
- **Test:** The password function is re-invoked on EACH new connection (e.g. pool growth / reconnect), so a rotated password takes effect without restarting. _(refs: node-postgres#1924, node-postgres#2301, node-postgres#2513, postgres.js#615)_
- **Test:** A function-valued `user`/`username` is likewise resolved per-connection, supporting username rotation alongside password. _(refs: node-postgres#2679, postgres.js#881)_
- **Test:** When an async password resolves to a Promise/thenable, the driver awaits it to a string before SCRAM; it must never feed a non-resolved value into `createHmac` (no "client password must be a string" from an un-awaited promise). _(refs: node-postgres#3223, node-postgres#2757)_

### SCRAM-SHA-256 handshake correctness
**Why it matters / failure mode:** SCRAM is the modern default (PG 10+). The biggest cluster here: parallel/concurrent connections sharing SCRAM state corrupt the handshake ("Last message was not SASLResponse", "expected password response, got message type 109"). Marked testable=high and seen in BOTH drivers — strong signal.
- **Test:** Opening N connections in parallel (e.g. 50) against a scram-sha-256 server: all complete the client-first → server-first → client-final → server-final exchange and authenticate; no shared mutable SASL state leaks between connections. _(refs: postgres.js#123, postgres.js#142, node-postgres#3222, node-postgres#2608)_
- **Test:** Connecting with a scram-sha-256 role and the correct password succeeds and the proof verifies against the server signature. _(refs: node-postgres#2661, node-postgres#1508)_
- **Test:** The auth state machine handles the exact server message sequence; receiving an unexpected message type (e.g. 109 `r`/RowDescription-class) during the password phase yields a clear protocol error, not silent corruption. _(refs: postgres.js#430, postgres.js#668)_
- **Test:** SASL channel binding: client advertises `gs2-cbind-flag` correctly (`n,,` when not binding) and includes/omits cbind data consistently in client-first and client-final. _(refs: node-postgres#1508, node-postgres#3222)_

### SCRAM input validation & error handling
**Why it matters / failure mode:** A missing/non-string password reaching SCRAM throws a raw `createHmac` TypeError deep in the driver instead of a catchable, descriptive error. SASL errors were also previously swallowed. Errors must surface to the caller.
- **Test:** Connecting to a SCRAM server with `password` undefined/null/non-string fails fast with a clear error ("client password must be a string") BEFORE the SASL exchange — not an internal `createHmac` TypeError. _(refs: node-postgres#2757, node-postgres#3210, node-postgres#2371)_
- **Test:** Any error thrown during the SASL/SCRAM exchange propagates to the connection's error callback/promise (caller can `catch` it); it is never swallowed or emitted as an unhandled event. _(refs: node-postgres#1927, node-postgres#2371)_
- **Test (security):** The client rejects a server-supplied SCRAM iteration count below a safe minimum (reject `i=1`; enforce e.g. `i >= 4096`) to prevent a malicious server weakening the hash. _(refs: node-postgres#3655)_

### Unsupported / negotiated SASL mechanisms
**Why it matters / failure mode:** If the server offers only mechanisms the driver can't do, the user needs a clear "unsupported mechanism" error, not a hang or cryptic crash. Forward-looking mechanisms (OAUTHBEARER, GSSAPI) should be reachable.
- **Test:** When the server advertises only an unsupported SASL mechanism, the driver fails with an explicit "only SCRAM-SHA-256 supported / unsupported mechanism" error naming the offered mechanism(s). _(refs: node-postgres#3361, node-postgres#3505)_
- **Test:** When the server offers SCRAM-SHA-256 among others, the driver selects SCRAM-SHA-256. _(refs: node-postgres#3361, node-postgres#2943)_
- **Test (feature):** SASL `OAUTHBEARER` flow: given a bearer-token provider, the driver authenticates against a PG18 server requesting OAUTHBEARER. _(refs: node-postgres#3687)_

### MD5 & legacy / FIPS password auth
**Why it matters / failure mode:** MD5 (`md5(md5(password+user)+salt)`) is still used by older servers. Historical regressions tied Buffer/string/OpenSSL handling (Node 6 era), and FIPS environments disable MD5 entirely — the driver must degrade gracefully.
- **Test:** Against an md5-auth role, the driver computes `'md5' + md5(md5(password+username) + salt)` correctly and authenticates with valid credentials. _(refs: node-postgres#1000, node-postgres#1899, node-postgres#1018)_
- **Test:** MD5 auth produces identical, correct results regardless of Node/OpenSSL version (no Buffer-encoding regression); binary salt bytes are handled as bytes, not as a UTF-8 string. _(refs: node-postgres#1003, node-postgres#1019, node-postgres#1029, node-postgres#1080)_
- **Test:** In a FIPS environment where MD5 is unavailable, the driver still connects when the server offers SCRAM (does not unconditionally call md5 at client creation / crash with a disabled-algorithm error). _(refs: node-postgres#3268, node-postgres#2943)_

### Cleartext, empty, trust & peer (passwordless) auth
**Why it matters / failure mode:** Several auth paths need no password or a literal empty password. Passing `undefined` where the server expects an empty/cleartext password, or sending a password when the server said "trust", produces spurious 28P01 failures. Peer/trust over unix sockets is a recurring both-driver gap.
- **Test:** When the server requests cleartext password (AuthenticationCleartextPassword), the driver sends the password as-is and authenticates. _(refs: node-postgres#2632)_
- **Test:** A role with an empty password authenticates when `password: ''` is supplied (empty string is sent, not treated as "no password"). _(refs: node-postgres#2297)_
- **Test:** Connecting to a `trust`-auth server (e.g. `POSTGRES_HOST_AUTH_METHOD=trust`) with no password succeeds and does not error with "password authentication failed". _(refs: node-postgres#2524)_
- **Test:** Connecting over a unix-domain socket to a `peer`/`ident`/trust-configured server with no password succeeds in the pure-JS path (parity with native). _(refs: node-postgres#202, node-postgres#613, node-postgres#2160, postgres.js#308)_

### Auth-failure surfacing (no unhandled crashes)
**Why it matters / failure mode:** The single most damaging class: a wrong/missing password caused an UNHANDLED `'error'` event that crashed the process instead of a rejectable error. testable=high. The spec contract: invalid auth → catchable `DatabaseError` with SQLSTATE `28P01`.
- **Test:** Connecting with a wrong password rejects the connect promise / fires the callback with a `DatabaseError` whose `code === '28P01'` ("password authentication failed"); no unhandled `'error'` event, no process crash. _(refs: node-postgres#599, node-postgres#746, node-postgres#2846, node-postgres#1511, node-postgres#2690)_
- **Test:** The same failure through a Pool surfaces as a handleable rejection on the acquiring caller (Pool does not emit an unhandled `'error'`). _(refs: node-postgres#599)_
- **Test:** Connecting to a server that requires a password while supplying none fails with a clear auth error (regression guard from pg 8.9.0), not a silent hang. _(refs: node-postgres#2904)_
- **Test:** A password containing special characters, supplied via config object or percent-encoded in a connection-string URL, is decoded correctly and authenticates. _(refs: postgres.js#680)_

### SSL/certificate, IAM-token & GSSAPI auth
**Why it matters / failure mode:** Cert-based and GSSAPI auth let users connect without a DB password; IAM tokens are long passwords over SSL. The JS path historically diverged from native (fell back to password, or hung on very long tokens).
- **Test:** With a client certificate/key configured and an SSL connection, the driver authenticates via the cert (`cert`/`clientcert` auth) without falling back to or requiring a password. _(refs: node-postgres#1358, node-postgres#2548)_
- **Test:** An AWS IAM-generated token used as the password over SSL authenticates in the pure-JS client identically to native. _(refs: node-postgres#1843, postgres.js#288)_
- **Test:** A very long (1000+ char) token password is sent fully and the handshake completes without hanging or truncation. _(refs: postgres.js#288)_
- **Test (feature):** When the server requests GSSAPI/Kerberos, the driver performs the GSS exchange (honoring `krbsrvname`) and authenticates, with optional GSS encryption. _(refs: node-postgres#1443, node-postgres#2526, node-postgres#3276, postgres.js#1095)_

### ✅ Verification notes
**Corrections (expected-behavior / protocol accuracy):**
- Line 31 ("SCRAM handshake correctness" sub-bullet): the parenthetical "message type 109 `r`/RowDescription-class" is factually wrong. ASCII byte 109 = `'m'`, not `'r'` (114). RowDescription is `'T'` (84) and the AuthenticationRequest message is `'R'` (82) — none of which is 109. The "got message type 109" error from postgres.js (#430/#668) is the symptom of a *misaligned/garbage read* during the auth phase (the parser reading a data/length byte as a message-type byte), not a RowDescription. The expected behavior ("clear protocol error, not silent corruption") is correct; only the type annotation is wrong and should be removed or fixed to "byte 0x6D='m', i.e. an out-of-sequence/misaligned read".

**Minor / grounding caveats (correct PG semantics but weakly tied to the cited refs):**
- Line 32 (SASL channel binding, `n,,` gs2 header): the `gs2-cbind-flag` = `n,,` for non-channel-bound SCRAM-SHA-256 is correct, but channel binding is not actually the subject of the cited issues (#1508 is auth-success/unsupported-error; #3222 is concurrency "Last message was not SASLResponse"). This is a reasonable protocol-correctness add but is extrapolated, not grounded in those refs.
- Line 17 (`.pgpass` `*` wildcards / first-match-wins): correct PostgreSQL `.pgpass` semantics, but #455 only covers "read credentials from .pgpass" generally — the wildcard/first-match detail is an extrapolation (still valid to test).
- Line 38 (SCRAM iteration floor): #3655 only asserts rejecting a too-low count (example `i=1`); the concrete `i >= 4096` threshold is illustrative ("e.g.") and may not match the driver's actual minimum — keep it as a lower-bound assertion (reject `i=1`) rather than hard-coding 4096.

**Otherwise correct:** MD5 formula on line 48 (`'md5' + md5(md5(password+username)+salt)`) is accurate; empty-password (#2297), trust/peer passwordless (#202/#613/#2160/#308), 28P01 surfacing without unhandled 'error' (#599/#746/#2846/#1511/#2690), and async-credential resolution claims are all sound.

**Omitted high-signal tests:** none. All seven kind=bug & testable=high refs are covered — node-postgres#599, #746, #1508, #2661, #2757 and postgres.js#123, #680 each map to an existing test bullet. Coverage of high-signal items is complete.


## Pooling

_Covers acquiring/releasing physical connections, bounding concurrency (min/max), idle reaping and connection lifetime, graceful shutdown, leak prevention, error-driven client eviction, session-state isolation, pool observability, and interop with external poolers. A driver's pool is the single most common source of production hangs, leaks, and "too many clients" outages, so deterministic behavior here is load-bearing._

### Release & client lifecycle (check-in / use-after-release)
**Why it matters / failure mode:** Failing to return clients on every code path (success, error, transaction abort) silently exhausts the pool; reusing a stale client reference after release corrupts another caller's connection. This is the highest-volume cluster across BOTH drivers.
- **Test:** Acquire a client (`pool.connect()` / `sql.reserve()`), run a query, call `release()`/`done()`; pool's idle count returns to its pre-acquire value and the same physical backend is reused on the next acquire. _(refs: node-postgres#1673, node-postgres#3011, node-postgres#3463, postgres.js#163)_
- **Test:** Acquire a client WITHOUT ever running a query, then release; it must return to the pool (not leak). Repeat `max+5` times against a `max:N` pool and confirm no hang and idle count restored. _(refs: node-postgres#137, node-postgres#227, postgres.js#751)_
- **Test:** Call `release()`/`done()` twice on the same client; the second call throws a clear "already released" error and does not double-return the client or corrupt pool state (idle count must not exceed actual physical connections). _(refs: node-postgres#111, node-postgres#2515)_
- **Test:** Run a query on a client AFTER it has been released; the query rejects/throws (e.g. "client has been released") rather than silently executing on a connection now owned by another caller. _(refs: node-postgres#771, node-postgres#1039, node-postgres#2302)_
- **Test:** Calling `client.end()` on a pool-owned client must either close that physical connection (removing it from the pool) or throw a guard error — it must NOT silently return a now-dead client to the idle set. _(refs: node-postgres#159, node-postgres#1414, node-postgres#1430)_
- **Test:** `release(true)` (destroy flag) closes the underlying connection and removes it from the pool; the pool then creates a fresh replacement on next acquire so size invariants hold. _(refs: node-postgres#1997)_
- **Test:** Releasing inside a `.then()`/promise chain must not abort the chain — subsequent `resolve`/`reject` handlers still run and the query result is delivered. _(refs: node-postgres#1112, node-postgres#1710)_
- **Test:** A client held across `BEGIN ... COMMIT/ROLLBACK` is NOT auto-returned mid-transaction; it stays checked out until explicit `release()`, so a `ROLLBACK` issued after work still executes on the same connection (no "Client was closed and is not queryable"). _(refs: node-postgres#35, node-postgres#2512)_

### Pool exhaustion, queueing & max bound
**Why it matters / failure mode:** When all `max` connections are checked out, extra requests must QUEUE and run when a slot frees — never silently drop the callback, hang forever, or open a connection beyond `max`. Both drivers had bugs where exhaustion deadlocked or callbacks were lost.
- **Test:** With `max:N`, issue `N+M` concurrent `pool.connect()`/`pool.query()` calls; exactly `N` run immediately, the remaining `M` queue, and each queued request resolves (in submission order, FIFO) as earlier clients release. None are dropped. _(refs: node-postgres#801, node-postgres#1331, node-postgres#1556, node-postgres#2452, node-postgres#2927)_
- **Test:** Under sustained concurrent load the pool NEVER opens more than `max` backend connections (verify via `SELECT count(*) FROM pg_stat_activity WHERE ...`). Cover `max:1`, `max:3`, `max:50`. _(refs: node-postgres#931, node-postgres#1289, node-postgres#1907, node-postgres#3476, postgres.js#369, postgres.js#42)_
- **Test:** A server-side `too many clients already` (53300) must be treated as transient: the pool queues/retries the acquire rather than marking the pool permanently failed. _(refs: node-postgres#557, node-postgres#1270)_
- **Test:** When the pool is full and zero idle clients exist, releasing one checked-out client immediately services the oldest waiting request (no `isFull && _idle===undefined` deadlock). _(refs: node-postgres#2693, node-postgres#801)_
- **Test:** `max:50` with 20 concurrent queries runs all 20 in parallel (not batched in groups of 10); measured concurrency equals 20. _(refs: node-postgres#1907, node-postgres#1948, node-postgres#2462)_
- **Test:** Leaked (never-released) clients eventually exhaust the pool so new `pool.connect()` blocks/queues — confirming the bound is real — and the system recovers once leaked clients are released. _(refs: node-postgres#224, node-postgres#1768, node-postgres#2785)_

### Min / max / size configuration
**Why it matters / failure mode:** Misread config (undefined max → 1, poolSize 0 → default 10, ignored min) breaks capacity planning silently. BOTH drivers shipped regressions here.
- **Test:** `max: undefined` falls back to the documented default pool size, NOT to 1. _(refs: postgres.js#833)_
- **Test:** Setting min/max via the connection/config object overrides defaults and is honored under load (open up to `max`, retain at least `min`). _(refs: node-postgres#445, node-postgres#846, node-postgres#975)_
- **Test:** `poolSize:0` / disable-pooling semantics are deterministic: queries still execute and callbacks fire, and clients are destroyed on release rather than pooled. (Guard the historic bug where 0 fell back to default 10 or broke all functionality.) _(refs: node-postgres#319, node-postgres#392, node-postgres#853, node-postgres#1227)_
- **Test:** A configured `min` keeps at least that many idle connections established immediately at pool start and after idle periods, even with bursty release patterns and short `idleTimeoutMillis` (never drop below `min`). _(refs: node-postgres#1278, node-postgres#1869, node-postgres#2011, node-postgres#3009, node-postgres#3508, node-postgres#3576, postgres.js#672)_

### Idle timeout, reaping & connection lifetime
**Why it matters / failure mode:** Idle connections must be reaped after `idleTimeoutMillis` (server-side load), but a CHECKED-OUT client must never be reaped mid-use. Max-lifetime recycling prevents stale long-lived connections.
- **Test:** An idle client is closed after `idleTimeoutMillis` elapses; the underlying backend disappears from `pg_stat_activity` and a `remove` event fires. _(refs: node-postgres#1044, node-postgres#1404, node-postgres#2718, postgres.js#518)_
- **Test:** A client that is currently CHECKED OUT is never terminated by the idle timer even if held longer than `idleTimeoutMillis`; using it after a long pause does not throw "Client was closed and is not queryable" (race-condition guard). _(refs: node-postgres#1892, node-postgres#2938)_
- **Test:** `idleTimeoutMillis` disabled/0: pooled connections stay open and are reused across queries (postgres.js: `idle_timeout:0` disposes-or-reuses consistently without error). _(refs: node-postgres#2431, postgres.js#208)_
- **Test:** `maxLifetimeSeconds`/connection-TTL: a connection older than the configured lifetime is closed and replaced on release; younger connections are reused. Default lifetime/idle values must match documented defaults. _(refs: node-postgres#2027, node-postgres#2965, node-postgres#2139, node-postgres#3298)_
- **Test:** Pool idle/connection timers are `unref`'d (or `allowExitOnIdle`/event-loop-exit honored) so an otherwise-idle process exits without an explicit `pool.end()`. _(refs: node-postgres#2078, postgres.js#918)_

### Graceful shutdown (pool.end)
**Why it matters / failure mode:** `end()` must drain in-flight work, close every connection, resolve exactly once, and render the pool unusable afterward. BOTH drivers had `end()` hangs and premature-resolve bugs.
- **Test:** `pool.end()` resolves/invokes its callback ONLY after all already-issued queries have completed (their callbacks/promises settle first). Ordering: last `pool.query()` resolves before `end()` resolves. _(refs: node-postgres#1979, node-postgres#2163, node-postgres#2328, node-postgres#3113)_
- **Test:** After `pool.end()` resolves, zero backend connections remain established (verify `pg_stat_activity`), enabling e.g. `DROP DATABASE`. _(refs: node-postgres#1445, node-postgres#1695, node-postgres#2766, node-postgres#3280)_
- **Test:** `pool.end()` always resolves (no infinite hang) even when there are idle clients to close, the server is shutting down, or more queries were queued than `max`. _(refs: node-postgres#1802, node-postgres#1988, node-postgres#2034, node-postgres#2199, node-postgres#2341, node-postgres#2778, postgres.js#861)_
- **Test:** `pool.end()` is idempotent: a second call does not throw "Called end on pool more than once". _(refs: node-postgres#1858)_
- **Test:** Using the pool after `end()` (`pool.query()`/`connect()`) throws "Cannot use a pool after calling end on the pool". _(refs: node-postgres#1477, node-postgres#1635, node-postgres#1670, node-postgres#3635)_
- **Test:** A pool emits an `end` event when shut down, and (postgres.js) a reserved-then-released connection does not block `sql.end()` from resolving. _(refs: node-postgres#2399, postgres.js#925)_
- **Test:** Optional drain mode: `pool.end({drain})` finishes queued queries before closing; non-drain may cancel pending queued queries and still terminate without hanging. _(refs: node-postgres#1980, postgres.js#861)_

### Error-driven eviction & tainted-client recovery
**Why it matters / failure mode:** A broken or transaction-tainted connection returned to the pool poisons the next caller. The pool must detect connection-level failures, destroy the bad client, replace it, and keep query-level errors (constraints) recoverable.
- **Test:** A client whose backend is killed / errors mid-query is removed from the pool (not returned to idle) and a replacement is created so subsequent acquires succeed — including the `max:1` case where the single slot must be reborn. _(refs: node-postgres#631, node-postgres#948, node-postgres#1460, node-postgres#2243, node-postgres#2641)_
- **Test:** A query that raises a recoverable error (constraint violation 23505, statement timeout) leaves the client usable: the next query on that same checked-out client succeeds rather than the client being permanently killed. _(refs: node-postgres#673, node-postgres#1290, node-postgres#1777)_
- **Test:** A client returned to the pool while in an ABORTED transaction (after an error, or open `BEGIN`) is rolled back / reset before reuse, so the next acquirer is not stuck in `25P02` aborted-transaction state. _(refs: node-postgres#154)_
- **Test:** When a failed client with queued queries is destroyed, those queued queries are reassigned to a healthy client or errored back to their callers — never silently lost. _(refs: node-postgres#632)_
- **Test:** Optional `DISCARD ALL`/session-reset on release: when enabled, session state from the prior checkout (temp tables, prepared statements, SET) is cleared before the next caller uses the connection. _(refs: node-postgres#391)_

### Session-state isolation & per-connection setup hooks
**Why it matters / failure mode:** Because pooled connections are physical and reused, `SET`/GUC/`search_path`/RLS state set on one checkout silently leaks to the next caller unless reset, or must be reliably (re)applied per new connection. Cross-checkout leakage is a correctness/security bug.
- **Test:** A `SET`/GUC variable (e.g. `search_path`, custom RLS param) issued on a checked-out client affects subsequent queries on THAT SAME connection while held. _(refs: node-postgres#1134, node-postgres#2619, node-postgres#2809, postgres.js#501)_
- **Test:** The pool exposes a `connect`/setup hook that runs exactly once per NEW physical connection (e.g. `SET datestyle`, `SET application_name`); a property/setting applied in the hook is reliably present on every client subsequently checked out. _(refs: node-postgres#703, node-postgres#1393, node-postgres#3086, node-postgres#3151, node-postgres#3617, postgres.js#553)_
- **Test:** The `connect` event fires ONLY when a new backend connection is created, NOT on every reused `pool.query()`; running a setup query in the hook does not emit a queued-query deprecation warning. _(refs: node-postgres#3301, node-postgres#3617)_
- **Test:** Per-checkout state isolation: session state set by one caller is reset/isolated (when configured) so the next acquirer does not observe leaked GUCs. _(refs: postgres.js#501, node-postgres#2897)_

### Connect-error propagation & acquire timeout
**Why it matters / failure mode:** A failed connect or an exhausted pool must surface ONE catchable error — not resolve an Error as a client, not double-emit a crashing `error` event, and not hang forever. BOTH drivers had crash/duplicate-error bugs.
- **Test:** When the backend is unreachable (ECONNREFUSED), `pool.connect()` rejects/returns the error and does NOT resolve an Error object as a usable client. _(refs: node-postgres#1142, node-postgres#1795)_
- **Test:** A failed `pool.connect()` surfaces the error exactly once (via callback or rejected promise); it must not additionally emit an unhandled pool `error` event that crashes the process. async/await usage yields a catchable rejection, no UnhandledPromiseRejection. _(refs: node-postgres#1170, node-postgres#1301, node-postgres#2758)_
- **Test:** On connect failure the callback receives `(err, undefined, doneNoop)` — `client` is undefined and no usable `release` is handed out, so callers can't `.query` on undefined and don't wrongly release. _(refs: node-postgres#2028, node-postgres#2492)_
- **Test:** `connectionTimeoutMillis` / acquire timeout: when no free client or new connection is available within the timeout, `pool.connect()`/`pool.query()` rejects with a timeout error instead of hanging indefinitely. The wait-for-pooled-connection time counts toward the timeout. _(refs: node-postgres#2704, postgres.js#824, postgres.js#1036)_
- **Test:** A connection-timeout firing during connect must close any backend socket that actually opened, leaving nothing tracked/idle (no leak). _(refs: node-postgres#3543)_

### Pool observability (stats & events)
**Why it matters / failure mode:** Operators need accurate live counts to detect leaks/exhaustion. Undefined or stale counters mask outages.
- **Test:** `pool.totalCount`, `pool.idleCount`, and `pool.waitingCount` are defined numbers that accurately reflect state: after acquiring K clients, `idleCount` drops by K and an active/used count rises by K; releasing restores them. _(refs: node-postgres#1090, node-postgres#1376, node-postgres#1402, node-postgres#3208, postgres.js#443, postgres.js#908)_
- **Test:** `waitingCount` reflects queued acquires and returns to zero once slots free; it must not grow unbounded while `idleCount` stays zero under correct release (leak-detection signal). _(refs: node-postgres#2366, postgres.js#919)_
- **Test:** The pool emits an `idle`/release event when a client becomes available again, so consumers can react without polling; a cumulative pending-query counter is exposed for monitoring. _(refs: node-postgres#2209, node-postgres#2402, node-postgres#2612, postgres.js#1100)_

### Multiple pools & config keying
**Why it matters / failure mode:** Distinct connection configs must map to distinct pools; otherwise a caller can be served a connection to the WRONG database. Config object mutation breaks cache keying.
- **Test:** Two pools/configs pointing at different databases serve connections to their respective DBs independently and never share/cross connections; each has its own independent `max`. _(refs: node-postgres#187, node-postgres#671, node-postgres#975, node-postgres#2878)_
- **Test:** Calling `connect` must NOT mutate the passed config object, so config-keyed pool caching stays consistent across calls. _(refs: node-postgres#1294)_
- **Test:** Shutting down one pool (`pg.end(connString)` / `pool.end()`) closes only that pool and leaves other pools open and usable. _(refs: node-postgres#867)_
- **Test:** A `password` (or other non-enumerable) field present in config is used to authenticate new connections even if not enumerable on the options object. _(refs: node-postgres#2488)_

### Reserve / dedicated single connection
**Why it matters / failure mode:** Workloads needing connection affinity (LISTEN/NOTIFY, sequential session work) need to pin one connection without ending the pool — and return it cleanly.
- **Test:** `sql.reserve()` / `pool.connect()`-style reserve hands out one dedicated connection that runs multiple sequential queries on the SAME backend and returns it to the pool on release; pool available-capacity decreases by exactly one while held. _(refs: postgres.js#603, postgres.js#616, node-postgres#2677)_
- **Test:** A reserved connection that runs no prior query (with `fetch_types:false`) still resolves `reserve()` rather than hanging. _(refs: postgres.js#751)_
- **Test:** After reserve+release, the pool's `end()` resolves and does not hang on the released reserved connection. _(refs: postgres.js#925)_

### External poolers (PgBouncer / PgPool-II / Supavisor)
**Why it matters / failure mode:** Transaction-mode poolers forbid session state and named prepared statements; the driver must work without relying on session-level features and must not spam redundant SETs. Affects BOTH drivers.
- **Test:** With prepared statements disabled (`prepare:false`) / unnamed-statement mode, repeated queries through a transaction-pooling PgBouncer do NOT fail with "prepared statement already exists" (42P05) or `StorePreparedStatement` errors, and parameterized (extended-protocol) queries return results without hanging. _(refs: postgres.js#172, node-postgres#1671, node-postgres#2327)_
- **Test:** The driver does not send startup `options=--client_encoding`/`search_path` parameters in a form PgBouncer rejects (connection succeeds), and does not issue a redundant `SET application_name`/`SET` on every acquisition. _(refs: node-postgres#270, node-postgres#423, node-postgres#2729)_
- **Test:** Queries through an external transaction pooler (PgPool-II, Supavisor, RDS Proxy) invoke the result callback/resolve consistently and do not intermittently return `CONNECTION_CLOSED` or silently hang the pool after multiple queries. _(refs: node-postgres#513, node-postgres#2218, postgres.js#93, postgres.js#970)_

### Client internals & listener hygiene
**Why it matters / failure mode:** Reusing client objects across checkouts must not accumulate listeners or call methods the underlying client lacks; custom Client classes must be honored.
- **Test:** Repeated pool queries do not accumulate user/error event listeners on a reused Client — no `MaxListenersExceededWarning`; listeners attached during a checkout are removed on release. _(refs: node-postgres#2229, node-postgres#3539)_
- **Test:** The pool guards calls like `client.ref()`/`unref()` — when the underlying client lacks the method it must not throw `client.ref is not a function`. _(refs: node-postgres#2582, node-postgres#2584, node-postgres#2585)_
- **Test:** A custom `Client` class passed to the Pool constructor is the class instantiated for every new pooled connection (and per-connection Client override is supported). _(refs: node-postgres#3035, node-postgres#2102)_
- **Test:** Stale `drain`/callback listeners from a previous checkout do not fire for the next user of a reused client; `drain` fires once when the queue empties, not multiple times. _(refs: node-postgres#192, node-postgres#272)_

### Implicit-acquire query path
**Why it matters / failure mode:** `pool.query()` must transparently acquire AND release a connection on every path (success, zero rows, error); a missed release here is the most insidious leak.
- **Test:** `pool.query()` acquires a connection, runs, and releases it automatically — even when the result has zero rows or the query errors — so repeated `pool.query()` calls reuse connections and never grow established backends beyond `max`. _(refs: node-postgres#1151, node-postgres#1741, node-postgres#2069, node-postgres#2264, node-postgres#2334)_
- **Test:** A row inserted via `pool.query()` is visible on a subsequent `pool.query()` read from the same pool (commit/release ordering is correct). _(refs: node-postgres#3286)_

### ✅ Verification notes
**Correctness (PostgreSQL semantics):** SQLSTATEs are all accurate (53300 too-many-clients, 25P02 in_failed_sql_transaction, 23505 unique_violation, 42P05 duplicate_prepared_statement). Transaction/abort/reset and reserve/affinity expectations are sound.
- CORRECTION (clarify, not wrong): The idle-timeout-disabled test (line ~36) conflates two OPPOSITE semantics under one bullet. node-postgres `idleTimeoutMillis:0` = never time out (connections stay open indefinitely), whereas postgres.js `idle_timeout:0` (postgres.js#208) = dispose used connections immediately. The bullet headline ("connections stay open and are reused") is node-postgres-only; the parenthetical postgres.js behavior is the inverse. Split into two assertions so the expectation per driver is unambiguous.
- Minor: connect-error callback shape (line ~69) asserts `(err, undefined, doneNoop)` — node-postgres#2492's intent is that NO release/done is handed out on connect error, while node-postgres ships a NOOP release to avoid `release is not a function` crashes. Keep but assert the NOOP is non-throwing AND that calling it does not return a (non-existent) client to the pool; don't assert a "usable" release.

**Grounding:** No hallucinated tests found — every cited ref maps to a real issue intent in the records.

**Omitted high-signal tests (kind=bug/regression AND testable=high) — add as refs to existing bullets:**
- node-postgres#351 (bug/high): acquire+release the default pool size repeatedly must keep serving queries, not hang once 10 connections reached. Add to the "Pool exhaustion, queueing & max bound" general queueing/recovery bullets (lines ~18/23).
- node-postgres#1085 (bug/high): after acquiring `poolSize` connections, releasing them must let subsequent connect callbacks fire rather than hang. Add to the exhaustion recovery bullet (line ~23) or the FIFO-queue bullet (line ~18).
- node-postgres#517 (bug/high): destroying a pooled client via `done(err)` must not permanently shrink the pool below configured size, so all queued queries still run. Add to "Error-driven eviction" (line ~52) alongside the replacement/`max:1`-reborn assertion, paired with #632 (line ~55).


## Connection Lifecycle & Reconnect

_Covers everything from opening a socket to tearing it down: connect success/failure, server-initiated disconnects and restarts, idle-connection death, transparent reconnect/failover, graceful `end()`/shutdown, and the timers/sockets/listeners left behind. These are the single largest source of "uncatchable crash" and "promise hangs forever" reports in both drivers — a correct driver must guarantee that **every** terminal connection event either settles a pending promise/callback or surfaces as a catchable event, and that shutdown always resolves and always frees handles._

### 1. Connect failure surfaces as a rejection (never an uncatchable crash, never both-null)
**Why it matters / failure mode:** Server down / wrong port / bad DB silently emits an unhandled `'error'` event that crashes the process, or invokes the callback with `(null, null)`, or hangs. This is the most-reported lifecycle bug and hits **both drivers**.
- **Test:** `connect()` to a port with no listener rejects/callbacks with an error whose code is `ECONNREFUSED` (or message clearly identifies connection refused); the process does not throw an unhandled `'error'` event. _(refs: node-postgres#350, node-postgres#418, node-postgres#785, node-postgres#641, postgres.js#136)_
- **Test:** `await client.connect()` to an unresolvable host rejects a catchable error (e.g. `ENOTFOUND`); no uncaught exception. _(refs: node-postgres#1385, node-postgres#1940)_
- **Test:** Connecting to a non-existent database name rejects/callbacks with the server's `3D000 database "x" does not exist` error rather than emitting an unhandled error event (verify on all platforms, incl. Windows). _(refs: node-postgres#1217, node-postgres#1233)_
- **Test:** Connecting to a wrong port / non-Postgres listener surfaces a clear connection error, never a `TypeError: cannot read 'name'/'type'/protocol of undefined`. _(refs: node-postgres#1940, node-postgres#2474)_
- **Test:** When all resolved addresses fail (e.g. IPv4 + IPv6 localhost both refused), the rejected `AggregateError.message` is non-empty and reflects the first underlying error. _(refs: node-postgres#3312)_
- **Test:** A server that accepts the TCP connection then immediately closes it (before/at handshake) rejects the connect promise/callback rather than leaving it pending. _(refs: node-postgres#534, postgres.js#457)_
- **Test:** A raw-socket `ECONNRESET` occurring during the connect handshake is delivered as a rejection, not an uncaught exception. _(refs: node-postgres#3658, node-postgres#350)_

### 2. Connecting to a non-Postgres endpoint fails fast (no crash, no spin)
**Why it matters / failure mode:** Pointing the driver at MySQL/HTTP/etc. caused crashes on undefined protocol messages or a 100%-CPU infinite loop.
- **Test:** Connecting to a non-Postgres server (e.g. MySQL/HTTP) rejects with a protocol/connection error within a bounded time; no `TypeError` crash and no busy-loop. _(refs: node-postgres#1005, node-postgres#2099, node-postgres#2111)_

### 3. Connect timeout is enforced and cleans up
**Why it matters / failure mode:** Sockets that accept but never complete the handshake hang `connect()` forever; serverless reuse intermittently errors.
- **Test:** With `connectionTimeoutMillis = N`, a connect to a host that accepts TCP but never responds rejects after ~N ms with "Connection terminated due to connection timeout" and destroys the half-open socket (no leaked handle). _(refs: node-postgres#3559, node-postgres#2338, postgres.js#815, postgres.js#734)_
- **Test:** `pool.connect()` always settles within the connection timeout, never hangs indefinitely. _(refs: node-postgres#2338, node-postgres#2317)_

### 4. Multi-host failover walks the host list and terminates
**Why it matters / failure mode:** A down/unresponsive primary should fail over; bugs caused infinite retry loops (`retries` never incremented) and queries hanging when all hosts are down.
- **Test:** Given two hosts where the first refuses/times out on connect, the driver connects to the second host and the query succeeds. _(refs: postgres.js#988, postgres.js#815, node-postgres#760)_
- **Test:** With all configured hosts down, queries reject within `connect_timeout` (do not hang forever); the retry counter advances so the host list is actually exhausted. _(refs: postgres.js#1174, postgres.js#988)_
- **Test:** `target_session_attrs`/prefer-standby selection falls back to the primary when no standby is reachable rather than looping forever. _(refs: postgres.js#1174)_

### 5. Server-initiated termination / restart is a catchable event (admin shutdown 57P01)
**Why it matters / failure mode:** `terminating connection due to administrator command` (57P01) and restart-driven drops were thrown as unhandled `'error'` events / `uncaughtException`, crashing the app on **both drivers** and across OSes.
- **Test:** When the server terminates the backend (restart / `pg_terminate_backend`), the in-flight query's callback/promise receives the `57P01` error AND a catchable `'error'` event fires on client (and `pool.on('error')` for pooled clients); the process does not crash. _(refs: node-postgres#465, node-postgres#478, node-postgres#683, node-postgres#821, node-postgres#1707, node-postgres#2499, node-postgres#2509, node-postgres#2762, node-postgres#2635, postgres.js#600)_
- **Test:** No secondary crash after the termination error — specifically no `Cannot call method 'sync' of undefined` / `Cannot read property 'handleCommandComplete'|'handleRowDescription' of null` when late protocol messages arrive on a nulled connection. _(refs: node-postgres#478, node-postgres#1872, node-postgres#2556)_
- **Test:** After a server crash + recovery, the pool establishes fresh connections and subsequent queries succeed. _(refs: node-postgres#2535, node-postgres#2635, node-postgres#1060)_

### 6. Abrupt mid-query disconnect rejects the active query (no silent hang)
**Why it matters / failure mode:** When the connection drops mid-query, the active query promise was left unsettled forever, or the callback never fired — the #1 "query hangs forever" symptom on **both drivers**.
- **Test:** Killing the connection while a query is in flight rejects that query with "Connection terminated unexpectedly" within a bounded time. _(refs: node-postgres#1700, node-postgres#1783, node-postgres#2283, node-postgres#288, node-postgres#504, postgres.js#600, postgres.js#708)_
- **Test:** A query issued on a client whose connection was already lost rejects/callbacks with a connection error immediately, instead of never returning. _(refs: node-postgres#1322, node-postgres#1500, node-postgres#1991, node-postgres#182)_
- **Test:** A query issued mid-transaction after the connection was lost rejects immediately rather than hanging. _(refs: node-postgres#1454)_
- **Test:** Connection loss while a cursor/stream is active surfaces a catchable error, not a process crash. _(refs: node-postgres#1449)_
- **Test:** No protocol-corruption fallout: after an abrupt drop the client/pool does not reuse the socket and emit `invalid frontend message type 0`. _(refs: node-postgres#1352)_

### 7. Idle connection death is detected and recovered (ECONNRESET / ETIMEDOUT / socket closed)
**Why it matters / failure mode:** NAT/firewall/server idle timeouts silently kill the socket; the next query then crashed with `This socket is closed` / `ECONNRESET` / `ETIMEDOUT` / `write after end` / `CONNECTION_CLOSED`. Massive overlap across **both drivers**.
- **Test:** A pooled connection whose socket was closed by the server while idle is detected and removed from the pool; the next acquire returns a fresh working connection (no `This socket is closed`, no `write after FIN`). _(refs: node-postgres#97, node-postgres#473, node-postgres#1012, node-postgres#1013, node-postgres#1517, node-postgres#2112, node-postgres#1942, postgres.js#43, postgres.js#921, postgres.js#457)_
- **Test (postgres.js transparent reconnect):** After an idle server-side close (`CONNECTION_CLOSED`/`CONNECTION_ENDED`), the next `sql\`...\`` transparently opens a new connection and resolves with the correct result. _(refs: postgres.js#43, postgres.js#601, postgres.js#921, postgres.js#179, postgres.js#148)_
- **Test:** An `ECONNRESET`/`ETIMEDOUT` on an idle connection is emitted as a catchable `'error'` (client) / `pool.on('error')` event and never crashes via an unhandled `'error'` event. _(refs: node-postgres#314, node-postgres#584, node-postgres#585, node-postgres#1877, node-postgres#1900, node-postgres#2162, node-postgres#2710, node-postgres#2764, node-postgres#2924, postgres.js#179, postgres.js#600)_
- **Test:** A write issued just as the socket closes surfaces a clean error, never `ERR_STREAM_WRITE_AFTER_END` or `null is not an object (socket.write)`. _(refs: node-postgres#725, node-postgres#2432, node-postgres#1830, postgres.js#121, postgres.js#1066, postgres.js#1154)_
- **Test:** Idle-connection death does not leak: the dead socket is fully torn down so TCP connections don't accumulate (no "too many open connections"). _(refs: node-postgres#1627, node-postgres#1517, postgres.js#116)_

### 8. Network-loss / failover queries time out instead of hanging ~15 min
**Why it matters / failure mode:** When the network drops without a FIN, a pending query blocked on the OS socket timeout (minutes) instead of the configured timeout; macOS vs Linux behaved differently.
- **Test:** With `query_timeout`/statement timeout set, a query whose network was severed rejects at the configured timeout (not the ~15-min OS timeout), and the client is then marked broken so subsequent queries don't silently hang. _(refs: node-postgres#1824, node-postgres#1322, node-postgres#3399, node-postgres#458, node-postgres#2038)_
- **Test:** After network connectivity is restored, `pool.query()` succeeds again (pool self-heals) rather than permanently timing out. _(refs: node-postgres#2973, node-postgres#1060, node-postgres#1075)_
- **Test:** An idle standalone/LISTEN client emits an `'error'`/`'end'` event when its network connection is severed, so a subscriber can re-establish. _(refs: node-postgres#1771, node-postgres#1351, node-postgres#3003, postgres.js#159, postgres.js#540)_

### 9. TCP keepalive is configurable and honored
**Why it matters / failure mode:** Without keepalive, intermediaries silently drop idle connections; some runtimes lack `setKeepAlive`.
- **Test:** With `keepAlive: true` (+ `keepAliveInitialDelayMillis`), the socket has SO_KEEPALIVE enabled; an idle connection past an intermediary timeout is kept alive / its drop is detected promptly rather than at OS timeout. _(refs: node-postgres#909, node-postgres#1113, node-postgres#2362, node-postgres#2764)_
- **Test:** In a runtime where `socket.setKeepAlive` is unavailable, connecting does not throw a `TypeError` (feature-detect gracefully). _(refs: postgres.js#404)_

### 10. `end()` always resolves and never hangs (the universal footgun)
**Why it matters / failure mode:** `client.end()`/`pool.end()`/`sql.end()` hung forever in many edge cases — after failed connect, on a never-connected client, when called twice, after a server disconnect, or when the socket was already destroyed. Confirmed **regression** in node-postgres v8 and postgres.js 3.4.4. Prime correctness target on **both drivers**.
- **Test:** `end()` always returns a promise that resolves (or invokes its callback) — including when the socket was already destroyed/closed, when no socket was ever opened, and when a connect previously failed. _(refs: node-postgres#1381, node-postgres#1382, node-postgres#2923, node-postgres#2777, node-postgres#1779, node-postgres#3152, node-postgres#2108, node-postgres#2788, postgres.js#32)_
- **Test:** `end()` called a second time after the client already ended resolves immediately instead of hanging. _(refs: node-postgres#2716)_
- **Test:** `end()` after a server-side disconnection / after a query already rejected (ECONNRESET) resolves rather than returning a never-settling promise. _(refs: node-postgres#2648, postgres.js#1097, postgres.js#1130)_
- **Test:** `end()` while a query is in flight rejects that query with a "Connection terminated" error and does **not** produce an `UnhandledPromiseRejectionWarning`. _(refs: node-postgres#1803, node-postgres#1833, node-postgres#2329)_
- **Test:** `client.end()` with `true`/drain semantics waits for already-queued queries to finish before disconnecting (graceful), but `end()` after a normal completed query never throws "Connection terminated". _(refs: node-postgres#15, node-postgres#2982)_
- **Test (postgres.js):** `sql.end({ timeout: null })` resolves even when no socket exists; `sql.end()` resolves after pending queries (incl. DDL) complete. _(refs: postgres.js#32, postgres.js#129, postgres.js#843, postgres.js#682)_

### 11. After `end()`, the process exits — sockets, timers, and the event loop are released
**Why it matters / failure mode:** Lingering idle connections, idle timers, and queued queries kept the Node event loop open so processes never exited (or exited only after long delays).
- **Test:** After `end()` resolves, the underlying TCP socket is fully closed (zero open handles) and the process exits promptly; `end()`'s resolution is gated on the socket actually closing. _(refs: node-postgres#120, node-postgres#320, node-postgres#1545, node-postgres#2146, node-postgres#3287, node-postgres#713, node-postgres#739, node-postgres#740, postgres.js#502)_
- **Test:** A single top-level shutdown call (`pg.end()` / `sql.end()`) closes **all** pooled and non-pooled connections so the process exits. _(refs: node-postgres#467, node-postgres#1193, node-postgres#1600)_
- **Test:** `end()` clears the query queue and all idle/reconnect timers so no `'socket is closed'` write or stray timer fires afterward; listeners (e.g. `notification`) are removed. _(refs: node-postgres#130, node-postgres#1600, node-postgres#1354, postgres.js#502)_
- **Test:** Idle pooled connections are `unref`'d so a process can exit naturally even without calling `end()` (and the driver never blocks process exit when there are no active connections). _(refs: postgres.js#869, node-postgres#2590, node-postgres#117 → postgres.js#117)_
- **Test:** A failing `pool.query()` rejects/emits an error rather than letting the process exit silently with no result. _(refs: node-postgres#2226, node-postgres#2788)_
- **Test:** A public API exists to immediately destroy the socket without a graceful round-trip; `using`/`Symbol.dispose` calls `end()` on scope exit. _(refs: node-postgres#1244, postgres.js#886)_

### 12. Client reuse / state after `end()` is well-defined
**Why it matters / failure mode:** Whether a Client can reconnect after `end()` was inconsistent — some paths produced `invalid frontend message type 0`; internal flags were left stale.
- **Test:** Calling `connect()` on a `Client` that was previously connected and ended throws exactly `Client has already been connected. You cannot reuse a client` (deterministic, documented). _(refs: node-postgres#2678, node-postgres#1167, node-postgres#2205, node-postgres#1663)_
- **Test:** After `end()`, the client's internal `connecting`/`connected`/`ending`/`ended` flags are reset to a consistent terminal state. _(refs: node-postgres#2765)_
- **Test:** The instance exposes whether it has been ended (status/`ended` flag) so callers can avoid double-`end()`. _(refs: postgres.js#487)_
- **Test (postgres.js reconnect contract):** Since `sql` reconnects transparently, after a `CONNECTION_ENDED`/server restart the next query opens a fresh connection and succeeds (no "cannot reuse" — different model than node-postgres `Client`). _(refs: postgres.js#601, postgres.js#682, postgres.js#148, node-postgres#1352, node-postgres#1558)_

### 13. Query issued before connect, and other ordering, settle deterministically
**Why it matters / failure mode:** Calling `query()` before `connect()` silently never fired the callback.
- **Test:** Calling `client.query(...)` before `client.connect()` invokes the callback / rejects with a clear error rather than silently never firing. _(refs: node-postgres#1998)_
- **Test:** `query()` after the connection was closed by a stream error emits/rejects a catchable error rather than throwing synchronously. _(refs: node-postgres#538, node-postgres#725)_

### 14. Failed connects and teardown leak no resources
**Why it matters / failure mode:** Repeated failed connects leaked file descriptors ("Too many open files"); an SSL-mismatch connect error left the socket open so the process couldn't exit; teardown null-dereferenced on already-closed sockets.
- **Test:** Repeated failed connect attempts do not leak file descriptors/sockets (open-handle count returns to baseline). _(refs: node-postgres#417, node-postgres#2907)_
- **Test:** When SSL is requested but unsupported by the server, the connection error also closes the underlying socket so the process can exit. _(refs: node-postgres#2907)_
- **Test:** Retrying connect after an initial failure does not accumulate duplicate event listeners. _(refs: node-postgres#434)_
- **Test:** Releasing/ending a client whose socket already closed does not throw a null-dereference (`null.close()` / cloudflare teardown) or `ERR_STREAM_WRITE_AFTER_END`. _(refs: node-postgres#3689, node-postgres#2432, node-postgres#883)_

### 15. Reconnect/backoff timers are sane (monotonic, never negative)
**Why it matters / failure mode:** Reconnect backoff used wall-clock time, producing negative `setTimeout` durations and `TimeoutNegativeWarning`; concurrent reconnects called `net.connect` with an undefined port.
- **Test:** Reconnect backoff uses a monotonic clock and never computes a negative delay (no `TimeoutNegativeWarning`), even across system clock adjustments. _(refs: postgres.js#316, postgres.js#1061)_
- **Test:** Concurrent reconnection attempts never call `net.connect` with `undefined` port/host (no `ERR_MISSING_ARGS`). _(refs: postgres.js#252)_

### 16. Lifecycle observability: connect/disconnect/error hooks
**Why it matters / failure mode:** Apps need to re-sync state on (re)connect and detect drops; several issues request first-class events.
- **Test:** A connect/`onConnect` hook fires after each successful (re)connection, and a disconnect/error hook fires on socket close/error; both reflect actual socket state transitions. _(refs: postgres.js#391, postgres.js#159, postgres.js#240, postgres.js#426, postgres.js#540, node-postgres#288)_
- **Test:** A non-error socket close (server closes cleanly mid-stream) still emits an `'end'`/`'error'` event rather than silently hanging. _(refs: node-postgres#288, node-postgres#527)_

### 17. Long-running queries return their result (no spurious "Connection terminated")
**Why it matters / failure mode:** Queries running minutes long (Redshift/RDS, large SQL) hung or emitted "Connection terminated unexpectedly" despite completing server-side.
- **Test:** A long-running query (minutes, no timeout configured) that completes server-side resolves with its result and does not emit "Connection terminated unexpectedly". _(refs: node-postgres#1792, node-postgres#1863, node-postgres#2017, node-postgres#2018, node-postgres#3107)_
- **Test:** Running many parallel queries/connections (stress) does not intermittently emit "Connection terminated unexpectedly" (guard against the Node v20 regression). _(refs: node-postgres#3083, postgres.js#715)_

### ✅ Verification notes
**Correctness of expectations (PostgreSQL semantics):** Spot-checked and largely sound.
- `3D000 database "x" does not exist` (line 9) is correct (SQLSTATE 3D000 = invalid_catalog_name).
- `57P01` / "terminating connection due to administrator command" (line 32) is correct for fast/smart shutdown and `pg_terminate_backend`. Good that section 5 (graceful 57P01 ErrorResponse) is kept distinct from section 6 (abrupt drop → "Connection terminated unexpectedly"); an *immediate* restart/crash drops without a 57P01 message, so the "restart" wording in §5 should be read as fast/smart shutdown, not SIGKILL.
- "Connection terminated due to connection timeout" (line 21), `SO_KEEPALIVE`/`keepAliveInitialDelayMillis` (line 60), AggregateError on all-addresses-fail (line 11), and "Client has already been connected. You cannot reuse a client" (line 83) all match real driver behavior.
- FLAG (minor/misleading): line 69 `client.end(true)` "drain" semantics. This reflects the historical node-postgres 0.x behavior cited in #15; modern `pg` `Client.end()` takes no drain argument and rejects in-flight/queued queries with "Connection terminated". Keep as a deliberate contract for the new driver, but do not present pending-query draining as standard node-postgres behavior.

**Grounding:** All cited refs map to real records; no hallucinated test cases. A few supporting refs are thin (empty-intent: node-postgres#504, #527, #2710) but are used only as secondary corroboration, which is acceptable.

**Omitted high-signal tests (kind=bug/regression AND testable=high) to add:**
- node-postgres#394 (bug/high): After `pg.end()` destroys the default pool, a subsequent `pg.connect()`/`pool.query()` with the same connection string creates a fresh working pool and returns results. Belongs in §11/§12 — currently only crash-recovery (#2535/#2635) is covered, not the explicit end()-then-reconnect-same-pool path.
- node-postgres#718 (bug/high): When `connect()` itself fails, any queries queued before the connection settled receive error callbacks/rejections rather than hanging forever. §13 covers query-before-connect (#1998) and §6 covers query-on-already-lost-connection, but not the "queued during a failing connect" case.
- node-postgres#1165 (bug/high): A connection-terminated error is emitted as a catchable client `'error'` event rather than crashing the process as an unhandled exception. Conceptually adjacent to §5 (#683/#821) but not cited; add it to the §5 server-termination ref set.


## Query Protocol

_Covers how the driver frames, sends, and parses Postgres wire-protocol messages — choosing between the simple and extended (Parse/Bind/Execute) query paths, preserving query text exactly, handling multi-statement strings, pipelining, and recovering from malformed input. This is the foundation of correctness: a single framing or protocol-selection bug silently corrupts results, desyncs the connection, or crashes the parser._

### Simple vs. extended protocol selection for multi-statement strings

**Why it matters / failure mode:** The single most common cluster across BOTH drivers. The extended protocol (used whenever parameters are present, or when statements are prepared) can carry exactly one command per Parse; the simple protocol (`Q`) accepts many semicolon-separated commands. Drivers that always prepare reject legitimate multi-statement SQL with `cannot insert multiple commands into a prepared statement`; drivers that mis-route silently drop statements.

- **Test:** A parameter-free string `SELECT 1; SELECT 2; SELECT 3` sent on the simple-query path executes all three commands in order and yields the result of the last (or all results in array form), with no error. _(refs: node-postgres#83, #141, #1190, #1763, #2919, postgres.js#748)_
- **Test:** The SAME multi-statement string sent through the parameterized/extended path (any `$n` present, or forced prepare) is rejected by the server with SQLSTATE `42601` and message `cannot insert multiple commands into a prepared statement` — the driver must surface this error, not swallow it. _(refs: node-postgres#33, #897, #911, #946, #1400, #1932, #3095, postgres.js#538, #1030)_
- **Test:** An explicit "simple/unsafe" mode (`sql.simple()` / `prepare:false` unsafe / `simpleQuery`) executes a multi-statement DDL script (e.g. `CREATE TABLE a(...); CREATE TABLE b(...); INSERT ...`) in one round trip without preparing. _(refs: postgres.js#47, #86, #472, #714, #1030, node-postgres#2100, #1589)_
- **Test:** A `.sql` file body with multiple statements executes fully via the simple path; the driver must NOT split on `;` naively — semicolons inside dollar-quoted bodies, string literals, and comments must stay intact (`CREATE FUNCTION ... $$ ... ; ... $$` runs as one statement). _(refs: node-postgres#1763, #2167, postgres.js#86)_

### Implicit-transaction semantics & result-resolution timing for multi-statement simple queries

**Why it matters / failure mode:** Postgres wraps a multi-command simple query in one implicit transaction, and a `CommandComplete` for an early statement does NOT mean the whole query succeeded — a later `ErrorResponse` rolls everything back. Drivers that resolve the promise on the first `CommandComplete` (before `ReadyForQuery`/Sync) lose the trailing error and report false success. Conversely, the implicit transaction breaks statements that cannot run inside a transaction block.

- **Test:** `INSERT ...; SELECT 1/0` as one simple query: the divide-by-zero `ErrorResponse` must reject the call, and the earlier INSERT must be rolled back (row count after = 0) because the implicit transaction aborts. _(refs: node-postgres#1717)_
- **Test:** A query promise resolving on `CommandComplete` during an implicit-transaction commit must still reject if an `ErrorResponse` arrives before `ReadyForQuery` — resolution is deferred until Sync/RFQ. _(refs: postgres.js#1090)_
- **Test:** `CREATE INDEX CONCURRENTLY ...` sent as the only statement on the simple path succeeds; if the driver auto-wraps single simple statements in `BEGIN/COMMIT`, it must NOT, since CIC cannot run inside a transaction block (would error `25001`). _(refs: postgres.js#198)_

### Protocol message framing & parser robustness

**Why it matters / failure mode:** TCP delivers wire bytes in arbitrary chunks; a parser must buffer until a full message (length-prefixed) is available and never read past the buffer. Bugs here cause `insufficient data left in message`, `invalid message format`, out-of-range reads, infinite loops, or crashes on unrecognized message codes.

- **Test:** A large `RowDescription`/`DataRow` whose bytes arrive split across multiple socket chunks is reassembled correctly (length prefix honored) with no `RangeError`/out-of-range read and no partial parse. _(refs: node-postgres#39, #2053, #191)_
- **Test:** The parser handles every server message type it can legally receive — including `CopyData` (`d`/code 91), `CopyDone`, `NoticeResponse`, `ParameterStatus`, `NotificationResponse` — without throwing `Unrecognized message code`. _(refs: node-postgres#364)_
- **Test:** Receiving an unknown/unexpected message header byte produces a clean, catchable protocol error (not `TypeError: Cannot read property 'name' of undefined`, not a null-deref crash). _(refs: node-postgres#1239, #1881, #3082)_
- **Test:** Malformed/garbage bytes during the connect/startup phase (e.g. a non-Postgres server, or an unterminated C-string) terminate with an error and never enter an infinite C-string scan loop. _(refs: node-postgres#1048, #2959)_
- **Test:** Messages from older server versions (9.4) parse without `invalid message format`. _(refs: node-postgres#1121)_

### NUL bytes & C-string termination in outbound messages

**Why it matters / failure mode:** Query text and identifiers are sent as NUL-terminated C-strings. A NUL (`\0`) embedded in user SQL truncates the message on the wire, yielding the opaque server error `invalid message format`. The driver should reject it client-side with a clear error before sending.

- **Test:** A query string containing a `\0` byte is rejected client-side with a descriptive error (e.g. references a zero/NUL byte) and is NOT written to the socket — no `invalid message format` from the server, connection stays usable. _(refs: node-postgres#1115, #1758)_
- **Test:** Outbound strings (query text, bind parameter text, statement/portal names) are encoded with exactly one trailing NUL and correct length prefix, so the server never returns `invalid string in message`. _(refs: node-postgres#64)_

### Identifier quoting & query-text fidelity (no mangling)

**Why it matters / failure mode:** The driver must transmit the SQL text byte-for-byte. Bugs that strip schema qualifiers, mishandle quoted identifiers, or misinterpret bytes lead to wrong-table results or `relation/column does not exist`.

- **Test:** `SELECT * FROM "user"` (or any reserved/lowercased name) returns rows of the table literally named `user`, not `current_user`/system output. _(refs: node-postgres#28)_
- **Test:** A schema-qualified reference `myschema.mytable` (and `INSERT INTO myschema.mytable ...`) reaches the server unchanged — the schema prefix is not dropped and produces no `Unexpected token`/parse error. BOTH drivers hit variants of this. _(refs: node-postgres#1732, postgres.js#190)_
- **Test:** A quoted, case-sensitive schema/identifier `"DOCUMENT".tbl` resolves to the exact-case relation and is not folded or unquoted. _(refs: node-postgres#1897)_
- **Test:** `SET search_path TO "weird-schema"` with a hyphen succeeds when quoted; an unquoted hyphenated identifier errors (matching server behavior) — driver must not auto-quote or auto-unquote. _(refs: node-postgres#2429)_
- **Test:** A non-breaking space (U+00A0) or other non-ASCII whitespace inside SQL is sent as-is and produces the server's syntax error for those literal bytes — the driver must not silently normalize it (and the error must be reported, not hidden behind a "query ran anyway"). _(refs: node-postgres#1960, #1562)_

### psql meta-commands are not SQL

**Why it matters / failure mode:** Backslash commands (`\d`, `\l`, `\gexec`) are client-side psql features, not wire protocol. Sent as a query they must produce a server syntax error, and the driver must surface it rather than appear to hang or succeed.

- **Test:** Sending `\d`, `\l`, or `\gexec` as a query rejects with SQLSTATE `42601` (`syntax error at or near "\"`); only real SQL executes. _(refs: node-postgres#898, #1985, #3209)_

### Pipelining & FIFO request/response ordering

**Why it matters / failure mode:** Multiple queries written before earlier replies arrive must come back matched to the correct caller, in FIFO order, even within a transaction. Desync here mismatches results to callbacks/promises.

- **Test:** Issuing N queries back-to-back on one connection (writing before responses return) resolves each with its own correct result set in submission order. _(refs: node-postgres#611, #663, #2646, #3193, postgres.js#236)_
- **Test:** Pipelined statements inside a transaction preserve ordering and per-statement results; an error in one pipelined statement aborts the transaction and surfaces to the correct caller. _(refs: postgres.js#343, #951)_
- **Test:** Batch execution — multiple Bind/Execute messages before a single Sync — returns each execute's results without per-statement round trips. _(refs: node-postgres#2257)_

### Bind/extended-protocol message encoding & portal/Sync state

**Why it matters / failure mode:** The Bind message has a strict layout; an off-by-one in result-format encoding or a portal/Sync state-machine bug desyncs the connection (`PortalSuspended` mismatch, "unclean server" under pgbouncer).

- **Test:** The Bind message encodes result-column formats as an Int16 count followed by that many Int16 format codes (0=text/1=binary), exactly per spec — verified against a known byte layout. _(refs: node-postgres#3487)_
- **Test:** After any query error on the extended path, the driver sends `Sync` and waits for `ReadyForQuery`, leaving the connection in a clean state reusable for the next query (no "unclean server"/portal-state error, safe under pgbouncer). _(refs: node-postgres#2451, #2055)_
- **Test:** Parameterized queries can be sent in a single unnamed-statement extended round trip (Parse/Bind/Execute/Sync) without leaving a named prepared statement pinned on a pooled/pgbouncer connection. _(refs: node-postgres#1573, #2326)_

### Parameterization limits & constructs that must use the simple path

**Why it matters / failure mode:** Some statements cannot accept bound parameters or cannot be planned the same way under the extended protocol. The driver must give a usable path (inline value / simple query) and a clear error otherwise.

- **Test:** `SET request.jwt.claims TO $1` errors with a syntax error at `$1` (SET cannot bind parameters); the driver must offer an inline/`set_config(...)` route so the value can be applied. _(refs: postgres.js#640)_
- **Test:** `CREATE INDEX IF NOT EXISTS ...` and other utility statements (`CHECKPOINT`) execute and return success when sent (utility commands have no result set but complete normally). _(refs: node-postgres#1862, #1257)_
- **Test:** A `::date`/cast expression and operator-class operators (intarray `|`) parse and execute via the driver identically to psql — the extended path must not alter operator/cast resolution. _(refs: node-postgres#444, #1646)_
- **Test:** `SELECT * FROM setof_returning_fn(NULL)` and a derived-table subquery with alias + `LIMIT/OFFSET` execute without spurious `syntax error`/`subquery in FROM must have an alias` introduced only by the parameterized path. _(refs: node-postgres#343, #1989)_

### Extended- vs simple-protocol planning parity

**Why it matters / failure mode:** Under the extended protocol Postgres may build a generic plan and (historically) avoid parallelism, surprising users who see different behavior than the CLI. The driver should expose a way to match CLI behavior.

- **Test:** A query eligible for parallel workers launches them (matching CLI) rather than being forced single-worker by extended-protocol portal/row-count limits — offer a path (simple query / fetch-all) that does not cap the plan. _(refs: node-postgres#3344)_
- **Test:** A `CASE` expression short-circuits its branches the same way as the CLI; eager evaluation differences traceable to extended-protocol planning are surfaced/avoidable. _(refs: node-postgres#3354)_

### CTE (WITH) statements including data-modifying CTEs

**Why it matters / failure mode:** WITH queries spanning multiple tables and data-modifying CTEs are valid single statements and must round-trip correctly (they are NOT multi-statement and must not be split).

- **Test:** A multi-table `WITH a AS (...), b AS (...) SELECT ...` returns the same rows as a GUI client. _(refs: node-postgres#1557, #2339)_
- **Test:** A data-modifying CTE inserting a parent then child via `WITH ins AS (INSERT ... RETURNING) INSERT ...` executes as one statement and reports affected rows. _(refs: node-postgres#1589, postgres.js#396)_

### Query return value / event-emitter API surface

**Why it matters / failure mode:** A 7.0 regression broke consumers (Sequelize) that call `.on()` on the object returned by `client.query()`. Guard against re-breaking the public shape.

- **Test:** `client.query(...)` returns a value exposing `.on('row'|'end'|'error', ...)` (event-emitter / submittable contract) so ORM consumers keep working. _(refs: node-postgres#1372, #1377)_

### Binary result format

**Why it matters / failure mode:** With binary mode requested, the Bind result-format codes must be 1 and results decoded via binary type parsers.

- **Test:** With binary results enabled, `DataRow` values arrive in binary wire format and decode correctly through binary type parsers (e.g. int4, timestamp) — round-tripping to the same JS values as text mode. _(refs: node-postgres#3317, #3487)_

### ✅ Verification notes

**Expected-behavior correctness (PostgreSQL semantics):** All testable expectations are sound. Spot-checked SQLSTATEs and protocol facts are correct: 42601 for `cannot insert multiple commands into a prepared statement` (line 10) and for psql backslash/`SET $1` syntax errors (lines 53, 75); 25001 for `CREATE INDEX CONCURRENTLY` inside a txn block (line 20); implicit-transaction rollback of an earlier INSERT on a later divide-by-zero in one simple query (line 18); NBSP/U+00A0 not being treated as whitespace and producing a server syntax error (line 47); `invalid string in message` as a real protocol-violation error (line 37); Bind result-format = Int16 count + per-column Int16 codes, 1=binary (lines 67, 104). No wrong expectations found.

**Grounding corrections (minor; do not weaken the tests, fix the citations/labels):**
- Line 27: "CopyData (`d`/code 91)" is factually inconsistent. The CopyData backend message byte is `d` = ASCII **100**, not 91; decimal 91 (`[`) is not a Postgres message type at all. Keep the test (handle CopyData/CopyDone/NoticeResponse/etc. without `Unrecognized message code`) but drop or fix the "/code 91" label — it appears copied verbatim from the #364 issue text and is wrong.
- Line 47: ref **node-postgres#1562 is mis-cited** here. Its intent is regex/backslash-escape consistency (same row count as psql, backslash escapes interpreted consistently) — unrelated to non-breaking-space normalization. The NBSP test is grounded solely in #1960. Net effect: #1562's actual intent (escape-sequence parity) is currently **untested** in the section. Add a dedicated test: a query with `\`-escape / regex sequences (e.g. `E'...'` / `~` regex) returns the same row count as psql, with backslash escapes interpreted consistently (ref node-postgres#1562).
- Line 11: ref **node-postgres#1589 is mis-cited** as a multi-statement DDL-script example; #1589 is a single data-modifying CTE (parent+child inserts) — already correctly cited at line 92. Remove it from line 11.
- Line 28: ref node-postgres#3082's intent (undefined active-query crash on `handleRowDescription` for a plain `SELECT 1`) is a different crash path than "unknown message header byte"; acceptable as a parser-robustness cite but slightly off-topic.

**Omitted high-signal tests (kind=bug/regression AND testable=high):** None. All eleven such issues are covered — node-postgres#28, #946, #1115, #1732, #1989, #2167, #3487; postgres.js#190, #198, #538, #1090.

**Non-blocking coverage gaps (medium-signal bugs, not required):** node-postgres#751 (INTERSECT/multi-statement spurious `syntax error at end of input`), node-postgres#2914 (UPDATE of an individual array element `elos[1]=1100`), and postgres.js#677 (table-alias + correlated subquery wrongly failing with `missing FROM-clause entry`) are not cited anywhere; consider adding to the parameterization/SQL-fidelity sections.


## Prepared Statements

_Covers the extended-query protocol (Parse/Bind/Describe/Execute/Close), named-statement lifecycle and caching, parameter binding and type inference, plan invalidation, and pooler/PgBouncer interaction. This is the hottest correctness area for any driver: both postgres.js and node-postgres have repeated bugs here, and a wrong cache key or stale "already parsed" flag silently corrupts results._

### Named-statement reuse, caching & re-prepare semantics
**Why it matters / failure mode:** Drivers cache "this statement is already parsed on this connection" to skip re-Parse. If the cache key or invalidation is wrong, a query is silently never re-prepared, or the wrong text is executed under a reused name.
- **Test:** Execute the same named (`name` supplied) parameterized query N times on one connection; assert exactly one Parse/ParseComplete occurs and subsequent calls only Bind/Execute (verify via `pg_prepared_statements` showing one entry, and server-side parse count). _(refs: node-postgres#207, node-postgres#863, node-postgres#1074, node-postgres#2940, postgres.js#478)_
- **Test:** A named statement reused across multiple `query()` calls must actually Execute the server-side prepared plan with new param values each call, returning per-call-correct rows — not re-parse the original text nor return the first call's result. _(refs: node-postgres#3295, node-postgres#1074)_
- **Test:** Reissue the same statement `name` with a DIFFERENT query text. Define and assert deterministic behavior: raise a clear client-side error ("prepared statement name X already used with different text" / "must be unique") rather than silently executing the originally cached text. _(refs: node-postgres#1813, node-postgres#345, postgres.js#943)_
- **Test:** Two different parameterized INSERT/SELECT texts (different columns) sent sequentially on one connection each prepare independently; the second must not reuse the first's cached plan/columns. _(refs: node-postgres#815, postgres.js#303)_
- **Test:** A named statement whose text differs only by a leading SQL comment should be treated per the configured policy; provide an option (comment-strip / explicit name) so such queries can reuse one prepared statement instead of erroring "must be unique" on every call. _(refs: node-postgres#2735)_

### Parameter count & binding ("requires 0 parameters")
**Why it matters / failure mode:** A recurring class of bugs where the driver Parses with the wrong declared param count or Binds the wrong number of values, producing `bind message supplies N parameters but statement requires 0`.
- **Test:** A named statement with `$1` (e.g. `INSERT ... VALUES($1)`) executed with one bound value succeeds; never errors "supplies 1 parameters but requires 0". _(refs: node-postgres#415, node-postgres#784, node-postgres#903)_
- **Test:** A statement using a CTE with `VALUES ($1, $2)` placeholders registers the correct parameter count at Parse time and binds all params. _(refs: node-postgres#1630)_
- **Test:** Two long parameterized queries with differing param counts executed sequentially on one connection must not cross-contaminate parameter counts (statement-2 uses statement-2's count). _(refs: postgres.js#303)_
- **Test:** `ANY($1)` with a `text[]`/`int[]` argument binds the array correctly and returns matching rows (array param, single placeholder). _(refs: postgres.js#806, postgres.js#221)_

### Cached-plan invalidation (schema change, rollback, OID)
**Why it matters / failure mode:** Server plans become invalid after DDL or rolled-back PREPARE; a driver that trusts a stale local "prepared" flag fails with `cached plan must not change result type`, `relation with OID does not exist`, or skips a needed re-Parse.
- **Test:** Prepare+execute a statement, then ALTER the table's result type (add/drop/retype a selected column), then re-execute: driver must transparently re-Parse and succeed, not surface `cached plan must not change result type`. _(refs: postgres.js#120)_
- **Test:** Inside a transaction that PREPAREs (server-side) then ROLLBACKs, the driver must drop its belief that the statement exists and re-prepare on next use; no assumption the rolled-back statement survived. _(refs: node-postgres#600)_
- **Test:** A statement is marked "prepared" only on ParseComplete (not optimistically). After an Execute that errors, a retry must not assume Parse already succeeded. _(refs: node-postgres#665)_
- **Test:** A parameterized `INSERT ... SELECT ... UNION ALL` executes without `relation with OID #### does not exist` (stale type/relation cache). _(refs: node-postgres#1579)_

### PgBouncer / transaction-pooler name collisions
**Why it matters / failure mode:** Under transaction-pooling proxies the same backend is shared, so globally/unique-per-driver-instance statement names collide as `prepared statement "X" already exists` or vanish as `does not exist`. Affects BOTH drivers strongly.
- **Test:** With prepared statements disabled (simple/unnamed mode), running the same query repeatedly and in parallel through a transaction pooler must NOT raise `prepared statement "X" already exists` or `... does not exist`. _(refs: postgres.js#40, postgres.js#547, postgres.js#960, postgres.js#76, node-postgres#1255)_
- **Test:** Named statements are tracked per physical connection; releasing/reacquiring a pooled connection must not leak a statement name into another session nor assume a name prepared on a different backend exists. _(refs: node-postgres#139)_
- **Test:** Behavior under PgBouncer transaction mode is documented and testable: either unnamed/simple protocol works, or named prepared use is explicitly unsupported with a clear error. _(refs: node-postgres#2266)_

### Disable prepared / simple & unnamed-statement modes
**Why it matters / failure mode:** Users need a way to force the simple or unnamed-extended path (pooler compatibility, plan-with-values). Misrouting leaves queries silently prepared.
- **Test:** A config flag (`prepare:false` / `.simple()`) forces queries onto the simple/unnamed protocol; assert no named entries appear in `pg_prepared_statements`. _(refs: node-postgres#1933, postgres.js#41, postgres.js#76)_
- **Test:** With `prepare:false` and a multi-statement query (e.g. after `SET search_path`), the query is sent as a single simple-protocol message, not split/prepared. _(refs: postgres.js#943)_
- **Test:** A parameterized query with no name uses the extended protocol as an UNNAMED statement (empty statement name), not server-side `PREPARE`/`EXECUTE`/`DEALLOCATE`; repeated use does not accumulate named statements on the server. _(refs: node-postgres#1772, postgres.js#997)_

### Describe / ParameterDescription without execution
**Why it matters / failure mode:** `.describe()` must Parse + Describe only — never Execute. Bugs here double-execute side-effecting statements.
- **Test:** `describe()` on a parameterized statement returns inferred parameter type OIDs (ParameterDescription) and result column descriptions (RowDescription) without running it. _(refs: node-postgres#1236, node-postgres#1903, postgres.js#221, postgres.js#275)_
- **Test:** `describe()` on an INSERT/`unsafe` mutating statement must NOT execute the INSERT — assert zero rows written afterward and exactly one Describe round-trip (no double execution). _(refs: postgres.js#424, postgres.js#275)_

### Parameter type inference
**Why it matters / failure mode:** When a param type can't be inferred from context, Postgres returns `could not determine data type of parameter $1`; drivers must let ParameterDescription or explicit casts resolve it, and must not feed query-typing arrays into result parsing.
- **Test:** A parameterized `SELECT` wrapped in `CREATE VIEW ... AS` binds/infers `$1`'s type (via ParameterDescription) rather than failing with `could not determine data type of parameter $1`. _(refs: postgres.js#1102)_
- **Test:** `sql\`SELECT ${[1,2,3]}::int[]\`` (or equivalent) uses ParameterDescription-inferred types to bind the array correctly. _(refs: postgres.js#221)_
- **Test:** A query `types` option used for PARAMETER typing must not be forwarded to RESULT-row parsing; a parameterized statement with `RETURNING` rows must not crash in `getTypeParser`. _(refs: node-postgres#2287)_

### Prepare-only, deallocate & lifecycle edge cases
**Why it matters / failure mode:** Full lifecycle support (prepare without execute, explicit deallocate, robust handling of degenerate input) and consistency with Postgres restrictions.
- **Test:** A named statement can be prepared WITHOUT values and executed later with values; preparing-only must not error about missing bind parameters. _(refs: node-postgres#24, node-postgres#903, postgres.js#122)_
- **Test:** A supported `DEALLOCATE`/close API removes the statement server-side AND clears the client's parsed-statement cache so the same name re-prepares cleanly afterward. _(refs: node-postgres#1889)_
- **Test:** Reusing a named prepared statement inside a transaction does not raise `cursor "X" already exists` (Bind/Execute reuse, not implicit cursor collision). _(refs: node-postgres#36)_
- **Test:** Executing a prepared statement with empty / whitespace-only / null text errors promptly with a clear message and never hangs the connection. _(refs: node-postgres#822)_
- **Test:** Binding parameters to a `DO` anonymous block errors consistently (Postgres disallows params there) rather than silently mis-binding. _(refs: node-postgres#812)_
- **Test:** `SET TRANSACTION ISOLATION LEVEL` issued as the first statement of a transaction succeeds even with prepared statements enabled (driver must not inject a prior prepare/describe round-trip that voids "before any query"). _(refs: postgres.js#164)_

### ✅ Verification notes

**Coverage (Q3): complete.** All high-signal records (kind=bug AND testable=high) are present:
np#36→L54, np#415→L15, np#600→L23, np#665→L24, np#815→L10, np#822→L55, np#1630→L16,
np#2287→L48, np#3295→L8, pgjs#120→L22, pgjs#164→L57, pgjs#303→L10/L17, pgjs#424→L42,
pgjs#1102→L46. No high-signal bug/regression test is omitted. (Uncited refs np#273, np#922,
np#1092, np#1990, np#3109, np#960 are all testable=low/medium and non-high-bug; safe to skip.)

**Corrections (verified live against PostgreSQL 14 via raw extended protocol):**

1. **L46 (postgres.js#1102) — expectation is WRONG per PG semantics.** A `$1` inside a
   `CREATE VIEW ... AS SELECT ...` is NOT a bindable parameter. Verified: protocol-level Parse
   succeeds, but `Describe(statement)` returns **ParameterDescription count = 0** (even with an
   explicit `$1::int` cast), and `Bind` of one value fails with
   `08P01: bind message supplies 1 parameters, but prepared statement "" requires 0`.
   So the driver canNOT "bind/infer `$1`'s type and succeed" — this is the SAME class as the
   `DO` block case (#812, L56): parameters are not permitted in utility/DDL statements.
   Fix the assertion to: *a parameterized `CREATE VIEW` either errors deterministically
   ("requires 0 parameters" / "could not determine data type of parameter $1" when uncast),
   or must be routed via the simple/unprepared protocol with the value inlined.* The current
   "should bind correctly" wording sets an unachievable expectation. (Harness sanity-checked:
   plain `SELECT $1::int`→count 1 oid 23; CTE `VALUES($1::int,$2::text)`→count 2 — so the
   0-count for CREATE VIEW is a real PG behavior, not a harness artifact. Confirms L16 is right.)

2. **L9 — mis-grounded ref.** `postgres.js#943` is cited for "reissue same name / different
   text → client error," but #943 is about `prepare:false`+`search_path` multi-statement simple
   queries (correctly cited at L36). Drop #943 from L9; the np#1813/np#345 cites are sufficient
   and correct. (Verified live: server-side `PREPARE q ...; PREPARE q ...` →
   `prepared statement "q" already exists`, matching the asserted deterministic-error behavior.)

3. **L55 (np#822) — nuance, not a hard error at protocol level.** Empty/whitespace-only Parse
   *succeeds* and yields `EmptyQueryResponse` (count 0) at the server; it does not raise a server
   error. The real, valid assertion is the "never hangs" part — the prompt "errors with a clear
   message" must be understood as a *client-side guard* (e.g. for null text), not a Postgres
   error. Keep the test but phrase the expectation as client-side validation + no hang.

- (Minor) L29 lumps `node-postgres#1255` (pgpool-II returning empty cached resultsets) in with
  the "already exists / does not exist" pooler-collision test. Different failure mode (wrong
  results vs. name collision); fine to keep as pooler coverage but consider a separate assertion.


## Parameters

_Covers how JS values are bound to SQL placeholders: null/undefined handling, array/IN expansion, type inference & casts, the hard distinction between bindable values vs. unbindable identifiers/keywords/contexts, the 16-bit parameter limit, value serialization, and (for postgres.js) the dynamic `sql()` helper. This is the highest-traffic correctness surface of any driver — most issues are user confusion that the driver must either satisfy or fail loudly and clearly on._

### NULL and undefined binding
**Why it matters / failure mode:** Drivers historically crashed (`.toString` on undefined), inserted empty string instead of NULL, or left a placeholder unbound producing a server syntax error. Both drivers hit this.
- **Test:** Binding JS `null` to a parameter inserts/compares as SQL `NULL` (e.g. into integer/uuid/text columns) with no "invalid input syntax for integer/uuid" error. _(refs: node-postgres#779, node-postgres#1649, node-postgres#1821)_
- **Test:** Binding JS `undefined` must not crash on `toString`; it either errors clearly or is sent as `NULL` per a documented, deterministic policy (never leaving `$1` unbound). _(refs: node-postgres#55, node-postgres#797)_
- **Test:** A configurable `transform.undefined = null` option sends `undefined` values as `NULL` instead of throwing `UNDEFINED_VALUE`. _(refs: postgres.js#630, postgres.js#134)_
- **Test:** `sql\`select ${null} is null\`` / a `null` param in an `IS NULL` comparison resolves its type via context or explicit cast without `42P18 could not determine data type`. _(refs: postgres.js#153, postgres.js#134, node-postgres#1775)_

### Arrays and the IN / = ANY pattern
**Why it matters / failure mode:** The single most repeated confusion in both repos: users pass a JS array to `IN ($1)` and get zero rows, a comma-string, or a syntax error. Correct PG idiom is `= ANY($1)` with the array bound as one array value.
- **Test:** A JS array bound to `WHERE col = ANY($1)` matches every element of the array (integer and text element types). _(refs: node-postgres#82, node-postgres#129, node-postgres#623, node-postgres#1272, node-postgres#1452, node-postgres#1490, node-postgres#2242, node-postgres#2485, node-postgres#3064, postgres.js#39)_
- **Test:** A JS number array bound against an integer column is serialized as an `int[]` literal (`{1,2,3}`), not a quoted string array, so no "invalid input syntax for integer" arises. _(refs: node-postgres#1008, node-postgres#1653, node-postgres#2495)_
- **Test:** A JS array bound into an `integer[]`/`text[]` column or a function expecting `text[]` is serialized to a proper Postgres array literal and inserts/binds as a real array, not a single string. _(refs: node-postgres#220, node-postgres#894, node-postgres#2461, node-postgres#2551)_
- **Test:** A string array passed to `= ANY($1)` binds without `42P18` indeterminate-type error (cast to `text[]` when needed). _(refs: postgres.js#175)_
- **Test:** A JS `Set` passed where an array is expected serializes its members the same as an `Array` for `= ANY($1)`. _(refs: node-postgres#2912)_
- **Test:** An empty array in an IN/ANY position produces valid SQL that matches zero rows (or throws a defined, documented error) — never a syntax error. _(refs: postgres.js#417, postgres.js#525)_
- **Test:** `unnest($1)` / `ARRAY[$1]` with an array param infers the element type (e.g. integer) rather than defaulting to `text`, so insert into a typed column succeeds. _(refs: node-postgres#2425, node-postgres#1776)_

### Type inference and explicit casts
**Why it matters / failure mode:** Parameters travel as text over the extended protocol; the server infers types from context. Wrong inference yields `operator does not exist`, `invalid input syntax`, or `could not determine data type`. Native vs JS bindings diverged in node-postgres.
- **Test:** A JS number bound against an integer column is treated as an integer (not the string `"123.456"`/`"8.0.3"`); no "invalid input syntax for integer" and no spurious date coercion of version-like strings. _(refs: node-postgres#996, node-postgres#1581, node-postgres#2626, node-postgres#2674, node-postgres#3165)_
- **Test:** A boolean JS param bound to a boolean column infers `bool` and does not fail with "could not determine data type". _(refs: node-postgres#167)_
- **Test:** A param used only in a context Postgres cannot infer (`$1 IS NULL`, polymorphic `anyelement`, `to_tsquery('english',$1)`, `array_cat`) surfaces a clear `42P18` and succeeds when an explicit cast (`$1::type`) is supplied. _(refs: node-postgres#578, node-postgres#1569, node-postgres#1623, node-postgres#1775, node-postgres#1885, postgres.js#36, postgres.js#77, postgres.js#557)_
- **Test:** Params in `UPDATE ... CASE`, `UPDATE ... FROM (VALUES ($1,$2))`, and `VALUES` lists inside CTEs infer the target column type (e.g. `smallint`/`int4`), not `text`, so no "operator does not exist: integer = text". _(refs: node-postgres#2130, node-postgres#2159, node-postgres#2724, postgres.js#539, postgres.js#842)_
- **Test:** A number bound to a function arg expecting `integer`/`numeric` binds as that type (or via `$1::numeric`) without "function ... does not exist" / "operator does not exist: integer = text". _(refs: node-postgres#1686, node-postgres#1965, postgres.js#1026)_
- **Test:** An interval param works as `$1::interval` / `now() + $1::interval`; the cast must follow the placeholder (`$1::timestamp`), not precede it (`timestamp $1` / `INTERVAL $1` → syntax error). _(refs: node-postgres#1593, node-postgres#1874, node-postgres#2536, postgres.js#247, postgres.js#433, postgres.js#772)_
- **Test:** A param after a type keyword (`DATE ${x}`, `TIMESTAMP ${x}`) binds as a typed literal or yields a clear cast-required message, not a bare `syntax error at or near "$2"`. _(refs: postgres.js#281, postgres.js#998)_
- **Test:** Native and JS bindings produce identical type inference for the same query and honor explicit `query.types`/type-OID hints. _(refs: node-postgres#312, node-postgres#373, node-postgres#859, node-postgres#145)_
- **Test:** An integer JS number is sent as `int8` (so int8 indexes are usable), not `numeric`. _(refs: postgres.js#125)_

### Placeholders inside string literals (not bound)
**Why it matters / failure mode:** `$1` inside a quoted string (`'%$1%'`, `'{$1}'`, jsonpath, `INTERVAL '$2 ms'`) is literal text, not a placeholder — yielding "bind message supplies N parameters but prepared statement requires M". Both drivers hit this constantly.
- **Test:** A `$1` inside a single-quoted literal is NOT substituted; binding a value then raises a clear parameter-count mismatch ("supplies 1 parameter but requires 0"). _(refs: node-postgres#503, node-postgres#578, node-postgres#976, node-postgres#1533, node-postgres#1693, node-postgres#2192, node-postgres#2479, node-postgres#2816, postgres.js#400, postgres.js#1020)_
- **Test:** A LIKE pattern must bind the value outside the literal: `LIKE $1` with `'%smith%'`, or `'%'||$1||'%'` — not `'%$1%'`; the correct form matches and the wrong form errors clearly. _(refs: node-postgres#14, node-postgres#327, node-postgres#503, node-postgres#1144, node-postgres#2574, postgres.js#897, postgres.js#994)_
- **Test:** A `$1` inside a JSONPath/jsonb string literal (`@>`, `jsonb_set`, `jsonb_path_query`) is not a bind placeholder; the value must be a real param outside the literal (or passed via path vars) to bind. _(refs: node-postgres#778, node-postgres#1590, node-postgres#1616, node-postgres#2577, node-postgres#2598, node-postgres#2697, node-postgres#2805, postgres.js#213)_
- **Test:** Params inside `to_tsquery`/`crosstab`/`dblink` string arguments cannot be bound from inside the literal; passed as proper params they work. A space-containing string bound to `$1` is one literal value, not split. _(refs: node-postgres#212, node-postgres#1637, node-postgres#1885, postgres.js#732)_
- **Test:** `$1`/`$$` inside a dollar-quoted `CREATE FUNCTION`/`DO` body are body text, not driver placeholders, and are passed through untouched. _(refs: postgres.js#779)_

### Identifiers and keywords are not parameterizable
**Why it matters / failure mode:** Bind params can only be values. Users try to parameterize table/column/schema names, ORDER BY columns, ASC/DESC, and DDL identifiers — getting either silent wrong results (no reordering) or syntax errors. The driver must make this deterministic.
- **Test:** A param used as an `ORDER BY $1` column is a constant, so rows are NOT reordered (or PG raises "non-integer constant in ORDER BY"); identifier injection (sql()) is required to actually sort. _(refs: node-postgres#300, node-postgres#832, node-postgres#1284, node-postgres#2233, postgres.js#251, postgres.js#306)_
- **Test:** A param for a table/column/schema/identifier in DML or DDL (`CREATE TABLE $1`, `CREATE SCHEMA $1`, `ORDER BY $1 ASC`) yields a clear server syntax error, never identifier substitution. _(refs: node-postgres#1276, node-postgres#1426, node-postgres#1632, node-postgres#1672, node-postgres#1767, node-postgres#1798, node-postgres#2132, node-postgres#2247, node-postgres#2259, node-postgres#2666, node-postgres#2776, node-postgres#2797, postgres.js#260, postgres.js#277, postgres.js#544, postgres.js#590)_
- **Test:** SQL keywords (`ASC`/`DESC`, `ALL`, `DEFAULT`, `NOT NULL`) cannot be supplied as bound values: `LIMIT $1` with `'ALL'` errors (`$1` is bigint), `IS $1` errors. _(refs: node-postgres#844, node-postgres#1360, node-postgres#1734, node-postgres#2673, node-postgres#1751, node-postgres#1761)_

### Contexts that disallow bind parameters
**Why it matters / failure mode:** Several statement classes (utility/DDL, `SET`, `DO` blocks, `IS [NOT]`, simple-protocol-only commands) reject parameters at parse time. The driver must surface PG's error, not a confusing internal one, and document inlining as the workaround.
- **Test:** `SET`/`SET LOCAL`/`SET search_path TO $1` raises a syntax error; `set_config()` or a safely-inlined literal is the correct path. _(refs: node-postgres#1194, node-postgres#1648, postgres.js#864)_
- **Test:** DDL utility statements that cannot prepare params (`CREATE VIEW ... WHERE x=$1`, `CREATE DATABASE`, `CREATE/ALTER ROLE ... PASSWORD $1`, `ALTER SEQUENCE RESTART WITH $1`, `ALTER TABLE ... SET DEFAULT $1`, `ALTER TYPE ADD VALUE $1`, `CREATE USER ... $1`) fail with a clear error; literal forms succeed. _(refs: node-postgres#440, node-postgres#505, node-postgres#1004, node-postgres#1188, node-postgres#1240, node-postgres#2511, node-postgres#2563, postgres.js#488, postgres.js#821, postgres.js#1060, postgres.js#454)_
- **Test:** Parameters supplied to a `DO $$ ... $$` anonymous block fail with parameter-count mismatch ("supplies N parameters but requires 0"). _(refs: node-postgres#1221, node-postgres#1904, node-postgres#2555, postgres.js#263)_
- **Test:** A multi-statement string with params errors ("cannot insert multiple commands into a prepared statement"), while the equivalent single statement binds correctly. _(refs: node-postgres#1396)_
- **Test:** Using `IS $1` / `IS NOT $1` raises a syntax error (IS predicates are not parameterizable). _(refs: node-postgres#1032, node-postgres#1751, node-postgres#1761)_

### Parameter count, limit, reuse, and indexing
**Why it matters / failure mode:** The wire protocol uses a 16-bit parameter count. Exceeding 65535 silently truncated/corrupted the Bind message; placeholder reuse and two-digit indices were misparsed; non-array `values` threw `.map`/`.replace` internal errors. Both drivers hit the limit.
- **Test:** Binding more than 65535 parameters is rejected client-side with a clear error, never silently truncated to a wrong 16-bit count or a corrupted Bind message. _(refs: node-postgres#581, node-postgres#1091, node-postgres#1116, node-postgres#1463, node-postgres#2292, node-postgres#2579, postgres.js#64, postgres.js#112)_
- **Test:** Reusing one positional placeholder (`$1` multiple times) binds the single supplied value to every occurrence; param count equals the number of DISTINCT placeholders. _(refs: node-postgres#1264, node-postgres#3132)_
- **Test:** Two-/multi-digit placeholders (`$10`, `$11`, ...) bind to the correct values, not misparsed as `$1`+`0`. _(refs: node-postgres#3226)_
- **Test:** Supplying N placeholders with an N-element array sends exactly N bind params (no "supplies X but requires Y" / "incorrect number of parameters"). _(refs: node-postgres#1747, node-postgres#3232)_
- **Test:** Passing a non-array as the `values` argument throws a clear "values must be an array" error, not `self.values.map is not a function`. _(refs: node-postgres#1043, node-postgres#1335, node-postgres#1357, node-postgres#2510, node-postgres#2570)_
- **Test:** Extra/missing params follow a deterministic documented policy (throw vs. ignore vs. bind-missing-as-null). _(refs: node-postgres#1307, node-postgres#2123)_
- **Test:** Only `$N` placeholders are recognized; `?` is passed through literally and rejected by the server (no silent `?`→`$` rewrite). _(refs: node-postgres#1100, node-postgres#1720, node-postgres#2176)_

### Value serialization and verbatim transmission
**Why it matters / failure mode:** Bound values must be sent verbatim (no escaping needed, no mutation of caller data) and serialized correctly for special JS types; a serializer throwing mid-query corrupted connection state. Both drivers hit escaping/first-char bugs.
- **Test:** A string containing single quotes / apostrophes / HTML / regex (`'\s\w+$'`) / commas is stored verbatim with no added escaping and no SQL injection or syntax error. _(refs: node-postgres#841, node-postgres#1020, node-postgres#3028, node-postgres#3353, postgres.js#169, postgres.js#891)_
- **Test:** A string param is sent in full — its first character is not stripped and the whole value is stored. _(refs: node-postgres#2357, node-postgres#2962)_
- **Test:** Passing a values array (or a query-string variable) to `query` does not mutate the caller's original array/variable (e.g. numbers not converted to strings in place). _(refs: node-postgres#750, node-postgres#799)_
- **Test:** A JS `BigInt` param serializes to its numeric text rather than throwing "Do not know how to serialize a BigInt"; a BigInt nested in a JSON param errors cleanly without leaving the connection stuck (ROLLBACK must not hang). _(refs: node-postgres#2395, node-postgres#1854)_
- **Test:** A JS object param serializes consistently as JSON (`JSON.stringify`), honoring a custom `toJSON` exactly once (no double-escaping), across native and JS bindings. _(refs: node-postgres#145, node-postgres#450)_
- **Test:** A JS array bound to a `json`/`jsonb` column requires JSON serialization (not a Postgres-array literal); a JSON string cast `::json` is sent as valid JSON (no "cannot deconstruct a scalar"). _(refs: node-postgres#1519, postgres.js#1055)_
- **Test:** Passing a `Promise` as a parameter throws rather than silently serializing to `'{}'`. _(refs: node-postgres#2304)_
- **Test:** If value serialization throws, serializer/writer state is reset and the prepared statement closed so the NEXT query is unaffected. _(refs: node-postgres#3573)_
- **Test:** A public `prepareValue` helper serializes `Date`/array/object to their Postgres parameter representation deterministically. _(refs: node-postgres#1740, node-postgres#786)_

### Multi-row / bulk insert binding
**Why it matters / failure mode:** Users want one INSERT with many rows; naive nesting produced row-constructor errors or wrong column inference. Type/column inference must consider all rows.
- **Test:** A multi-row INSERT with flattened `$1..$n` placeholders from an array of value-tuples inserts all rows correctly. _(refs: node-postgres#530, node-postgres#635, node-postgres#957, node-postgres#1641, node-postgres#1675, node-postgres#3029, node-postgres#3087)_
- **Test:** `INSERT ... SELECT $1 WHERE NOT EXISTS` and `INSERT ... SELECT` value lists (no extra parens around `$1..$n`) bind and execute without being parsed as a row constructor. _(refs: node-postgres#375, node-postgres#2909)_
- **Test:** A multi-row INSERT with implicit columns infers the column set/types from ALL rows, so a `null`/`undefined` in the first row's field does not null-out or drop that column for later rows. _(refs: postgres.js#1015, postgres.js#889)_

### postgres.js dynamic `sql()` helper (identifiers vs values vs fragments)
**Why it matters / failure mode:** postgres.js's `sql()` is overloaded for identifiers, IN-lists, VALUES, columns, and fragments; many regressions (`str.replace is not a function`, `UNDEFINED_VALUE`, `NOT_TAGGED_CALL`, columns rendered as `"a, b"`). High-signal because they are real implementation bugs, not user confusion.
- **Test:** `sql('table')` / `sql(['col1','col2'])` render as quoted identifier(s) resolving via search_path; an array renders multiple separate identifiers, not one joined `"a, b"`. _(refs: postgres.js#435, postgres.js#437, postgres.js#671, postgres.js#1101)_
- **Test:** `WHERE x IN ${sql([...])}` binds elements as value parameters — including a single-element array → `IN ($1)` and nested/tuple arrays — and never throws `str.replace is not a function`. _(refs: postgres.js#305, postgres.js#344, postgres.js#381, postgres.js#604, postgres.js#636, postgres.js#701, postgres.js#820, postgres.js#883, postgres.js#977, postgres.js#1108, postgres.js#1110)_
- **Test:** `sql(object)` / `sql(rows, 'a','b')` insert/values helpers bind each property value (not `undefined`/numeric keys), support `INSERT INTO t AS alias`, and build valid multi-row VALUES lists. _(refs: postgres.js#285, postgres.js#517, postgres.js#536, postgres.js#811, postgres.js#1042, postgres.js#1073, postgres.js#456)_
- **Test:** An `sql\`\`` fragment (e.g. a CAST or `now()`) used as a value inside an insert/update/VALUES helper is inlined as SQL, not bound blank or as a parameter, and does not throw `NOT_TAGGED_CALL`. _(refs: postgres.js#326, postgres.js#356, postgres.js#521, postgres.js#588, postgres.js#695, postgres.js#1071, postgres.js#405, postgres.js#413)_
- **Test:** An identifier with a JSON path operator or a dot (`company->>'name'`, `"meta.a"`) quotes only the column name, not the whole expression, and does not split on the dot. _(refs: postgres.js#511, postgres.js#572, postgres.js#731, postgres.js#1126)_
- **Test:** A plain interpolated string (full query body or subquery) is bound as a parameter → syntax error at `$1`; raw SQL requires `sql.unsafe`/the template itself, not value interpolation. _(refs: postgres.js#214, postgres.js#549, postgres.js#808, postgres.js#847)_
- **Test:** `sql(emptyObject)` / empty column array / mixed dynamic identifier + value helpers produce a clear descriptive error or correct rendering, not `UNDEFINED_VALUE`, `Could not infer helper mode`, or an obscure SQL syntax error. _(refs: postgres.js#414, postgres.js#419, postgres.js#434, postgres.js#466, postgres.js#644, postgres.js#712, postgres.js#1073, postgres.js#1149)_

### Reuse and round-trip semantics
**Why it matters / failure mode:** Minor but asserted behaviors: re-executing a prepared query with new values, and BIGINT precision on return.
- **Test:** A parameterized query can be re-executed with different parameter values, binding correctly each time. _(refs: node-postgres#2956)_
- **Test:** `BIGINT` results are returned as strings (or JS numbers only when within safe-integer range) to avoid precision loss. _(refs: node-postgres#924)_

### ✅ Verification notes

**Semantic / grounding corrections:**
- **Line 20 (`unnest($1)` element-type inference):** Overstated. PostgreSQL canNOT infer the element type of an *untyped* array parameter fed to `unnest($1)` — that is exactly what cited ref node-postgres#1776 says ("requires an explicit cast/type because an untyped parameter is ambiguous"). The two refs are in tension: `ARRAY[$1]` can pick up a type from assignment/operator context, but `unnest($1)` needs an explicit cast (`unnest($1::int[])`). The claim "unnest($1) ... infers the element type ... so insert into a typed column succeeds" is wrong for the unnest case. Split the test: ARRAY[$1] infers-from-context vs. unnest($1) requires-explicit-cast.
- **Line 9 (`transform.undefined = null`):** Mis-citation — postgres.js#134 concerns a `null` param's type determination in an `IS NULL` context, not the `transform.undefined` option. The only correct ref here is postgres.js#630. (#134 is already, correctly, cited on line 10.)
- **Line 30 (`DATE ${x}` / `TIMESTAMP ${x}`):** Slightly misleading. `DATE $1` / `TIMESTAMP $1` is ALWAYS a server syntax error (typed-literal grammar `type Sconst` only accepts a string constant, never a bind param). So "binds as a typed literal" is not an achievable outcome through that literal form; the only PG-correct result is the cast-required path (`$1::date` / `$1::timestamp`). Keep the "clear cast-required message" branch; drop/soften the "binds as a typed literal" branch.

Spot-checks that are CORRECT and well-grounded: 65535/16-bit limit (line 58), placeholder reuse = distinct-count (line 59), `$10`/`$11` greedy parse (line 60), `$1` inside string literals not bound + "supplies N but requires 0" (line 36), `LIMIT $1='ALL'`→bigint error & `IS $1` syntax error (lines 46/54), multi-statement→"cannot insert multiple commands" (line 53), array→`= ANY($1)` idiom (lines 14-15), JS array→json/jsonb needs JSON.stringify (line 73), BigInt serialization + JSON-BigInt clean error (line 71), no caller mutation (line 70), verbatim/first-char (lines 68-69).

**Omitted high-signal tests to add (kind=bug/regression AND testable=high):**
- **postgres.js#1002** (bug, high) — a JS number as a tagged-template param to `LIMIT ${50}` must bind correctly without a string/Buffer type error. Real coverage GAP: numeric `LIMIT $1` binding is tested nowhere (line 46 only covers the invalid `'ALL'` string case). Add a positive test (also covers question-high postgres.js#560, currently uncited).
- **postgres.js#519** (bug, high) — an array of objects with typed (`bytea`) values passed into a WHERE-IN `sql()` helper must build valid SQL without an "Undefined values" error. Add to the `sql()` IN/helper tests (line 87/92).
- **postgres.js#607** (bug, high) — `INSERT INTO tbl (${sql(columns)}) VALUES (...)` must emit the column identifiers correctly and execute without a syntax error. Add to the column-list rendering tests (line 88/92).
- **node-postgres#1642** (bug, high) — JS array for an `IN` clause must use `= ANY($1)` semantics, not a comma-joined single value. Behaviorally already covered by lines 14-15, but the ref is uncited; add it to those ref lists (citation-only, not a true coverage gap).


## Data Types — numeric

_Covers decoding/encoding of PostgreSQL numeric types (int2/4/8, float4/8, numeric/decimal) and their aggregates. The core tension: JS Number cannot losslessly hold int8 (>2^53) or arbitrary-precision NUMERIC, so the driver must pick a precision-safe default (string) and handle NULL/NaN/edge values without silent corruption. These are the single most-reported correctness bugs across both drivers._

### NUMERIC / DECIMAL default decoding (oid 1700) preserves precision
**Why it matters / failure mode:** NUMERIC is arbitrary-precision; decoding via `parseFloat`/Number truncates digits (e.g. `0.0268` → `0`) or drops precision silently. Both node-postgres and postgres.js have hit this — a strong cross-driver signal.
- **Test:** `SELECT 0.0268::numeric` returns the value intact, not `0`; assert no truncation to zero. _(refs: node-postgres#2957)_
- **Test:** A `numeric` value with more digits than JS float can hold (e.g. `12345678901234567890.12345`) round-trips losslessly — default decode is a JS **string** equal to the canonical PG text. _(refs: node-postgres#107, node-postgres#266, node-postgres#451)_
- **Test:** `numeric(8,2)` value `0.3` is returned as the string `"0.30"` (scale preserved), not a lossy float `0.3`. _(refs: node-postgres#849, node-postgres#884)_
- **Test:** A `numeric`/`decimal` column round-trips as a string by documented default; `SELECT '123.45'::decimal` → `"123.45"`. _(refs: node-postgres#811, node-postgres#1300, node-postgres#2818, postgres.js#270, postgres.js#726, postgres.js#978)_
- **Test:** `EXTRACT(EPOCH FROM ...)` (returns NUMERIC) decodes as a string, preserving sub-second precision rather than coercing to Number. _(refs: node-postgres#2841)_

### BIGINT / int8 default decoding as string (and aggregates)
**Why it matters / failure mode:** int8 exceeds `Number.MAX_SAFE_INTEGER` (2^53-1); decoding to Number silently corrupts large ids. Aggregates `COUNT()`/`SUM()` return int8/numeric and surprise users with string results — but string is the correct precision-safe default. Reported in both drivers.
- **Test:** `SELECT 9223372036854775807::int8` (max bigint) returns the exact string `"9223372036854775807"`, not a rounded Number. _(refs: node-postgres#1283, node-postgres#1450, node-postgres#1256)_
- **Test:** A bigint with the MSB set / low-order bits significant round-trips without losing low bits. _(refs: node-postgres#166)_
- **Test:** `COUNT(*)` over a table returns int8 delivered as a JS string by documented default (e.g. typeof === "string"). _(refs: node-postgres#378, node-postgres#639, node-postgres#1618, node-postgres#2344, postgres.js#249)_
- **Test:** `SUM(bigint_col)` / numeric aggregate returns a string, preserving precision beyond 2^53. _(refs: node-postgres#2631, postgres.js#746)_
- **Test:** A `bigserial` / int8 primary key is returned as a string by default. _(refs: postgres.js#105, postgres.js#486, postgres.js#978, node-postgres#1976)_

### Default float4/float8 parsing & precision (extra_float_digits)
**Why it matters / failure mode:** float4/float8 map cleanly to JS Number and should parse as numbers by default — but PG<12 defaults `extra_float_digits=0`, truncating the text representation and losing precision near MAX_SAFE_INTEGER. The driver must set `extra_float_digits` on connection.
- **Test:** float4/float8 columns decode to JS `number` by default (not string). _(refs: node-postgres#339)_
- **Test:** A `float8` equal to `Number.MAX_SAFE_INTEGER` (9007199254740991) round-trips exactly; verify the session sets `extra_float_digits=3` so the server emits full precision even on PG<12. _(refs: node-postgres#730, node-postgres#3092)_

### NULL handling for numeric/bigint (decode AND param encode)
**Why it matters / failure mode:** Classic regression: a NULL int8/numeric decodes to `NaN` instead of `null`; and passing JS `null` as a param serializes to the string `"NaN"` causing insert failures. Both drivers hit the param side (node-postgres#1613, postgres.js#336).
- **Test:** A NULL `bigint`/`numeric` column decodes to JS `null`, never `NaN`. _(refs: node-postgres#26)_
- **Test:** Passing JS `null` as a parameter for a NUMERIC column inserts SQL NULL (verify with `IS NULL`), not the literal `'NaN'`. _(refs: node-postgres#1613)_
- **Test:** Passing `null` for a nullable bigint column stores NULL and does not error with `invalid input syntax ... "NaN"`. _(refs: postgres.js#336)_

### NaN value round-trip for numeric
**Why it matters / failure mode:** PostgreSQL `numeric` (and float) supports a genuine `'NaN'` value distinct from NULL; the driver must not flatten it to `null` or leave it as the ambiguous string when the column actually holds NaN.
- **Test:** A `numeric` column holding `'NaN'::numeric` round-trips as JS `NaN` (Number.isNaN true), distinct from `null` and distinct from the string `"NaN"` of a normal value path. _(refs: node-postgres#1943)_
- **Test:** A NaN element inside a `numeric[]` array decodes to JS `NaN`, preserving array-element semantics. _(refs: node-postgres#1943)_

### Optional native BigInt parsing/serialization (opt-in, lossless)
**Why it matters / failure mode:** String default is safe but inconvenient; drivers offer opt-in int8→BigInt. Must be lossless and symmetric (encode JS BigInt back to int8/numeric). Nested/array contexts are a known footgun where BigInt gets silently coerced to Number.
- **Test:** With BigInt parsing enabled, `SELECT 9223372036854775807::int8` returns a JS `BigInt` equal to `9223372036854775807n`. _(refs: postgres.js#27, postgres.js#1148, node-postgres#2398)_
- **Test:** A bigint returned inside a nested/array/composite column retains full precision as BigInt and is NOT coerced to a lossy Number. _(refs: postgres.js#1106)_
- **Test:** A JS `BigInt` larger than 64 bits passed as a parameter into a NUMERIC column is sent as its exact decimal string and stored without truncation (read back equal). _(refs: postgres.js#874, node-postgres#3075)_

### Numeric parameter binding & range/type errors
**Why it matters / failure mode:** Sending numeric values as params must not provoke `inconsistent types deduced for parameter`, and genuine range violations must surface as catchable errors rather than crashes/unhandled rejections.
- **Test:** Inserting a numeric-string into a `numeric(9,6)` column via a bound parameter succeeds and round-trips without a type-deduction conflict. _(refs: node-postgres#1205)_
- **Test:** Inserting a value beyond int4 range (e.g. `-1001473594688`) into an `integer` column rejects with a catchable `out of range for type integer` error (no unhandled promise rejection). _(refs: node-postgres#1963)_
- **Test:** When a column OID is unknown/maps to text (e.g. CockroachDB), the value is returned as a string and a registered custom type parser can convert it — registration hook works. _(refs: node-postgres#1256, node-postgres#1260)_

### ✅ Verification notes

**Corrections (wrong/misleading expectations):**

1. **EXTRACT(EPOCH ...) return type is version-dependent (line 11, ref #2841).** The flat claim "EXTRACT(EPOCH FROM ...) returns NUMERIC ... decodes as a string" is only true on **PostgreSQL 14+**. Before PG14, `EXTRACT` returns `double precision` (float8, oid 701), which the driver decodes as a JS **Number**, not a string. As written the test will fail on PG<14, or silently assert the wrong type if it pins to a string. Fix: either gate this test to PG14+, or assert per-version (float8/Number on <14, numeric/string on >=14). Note the same nuance applies to the precision concern: on float8 the EPOCH value is subject to the extra_float_digits handling from the float section, not the lossless-string path.

2. **NaN round-trip contradicts the string-default design (lines 32-35, ref #1943).** The section's NUMERIC section establishes numeric (oid 1700) decodes to a **string** by default. Under that default, `'NaN'::numeric` decodes to the **string `"NaN"`**, not JS `NaN` — that is exactly node-postgres's actual behavior (the 1700 parser is identity/string). The test's expectation that NaN decodes to JS `NaN` (Number.isNaN true) is therefore inconsistent with the documented string default, and the sub-clause "distinct from the string \"NaN\" of a normal value path" is incoherent (a string-default driver yields strings for ALL numeric values, NaN included). Fix: for the **default** path assert `'NaN'::numeric` → string `"NaN"`; only assert JS `NaN` when number/BigInt parsing is explicitly enabled. The float-typed NaN case (`'NaN'::float8` → JS `NaN`) is the one that genuinely round-trips to Number.isNaN and is worth a separate, correct assertion. As written this is a real type-consistency bug in the spec.

3. **Grounding mismatch on ref #451 (line 8).** #451's recorded intent argues NUMERIC should be parsed to a *number/decimal rather than a raw string* — the opposite of the line-8 claim it is cited to support (lossless **string** default). The driver's documented resolution (string) is defensible, but citing #451 as evidence *for* the string default is misleading; it is better characterized as the request the string-default decision rejects. Keep the test, but don't lean on #451 as supporting evidence for string output.

**Minor (not blocking):** Line 24's `extra_float_digits=3` round-trip of MAX_SAFE_INTEGER is only strictly necessary on PG<12; PG12+ already emits shortest-round-trip output by default. Harmless as a robustness assertion but worth a comment so it isn't read as a PG12+ requirement.

**Coverage of high-signal (kind=bug AND testable=high) records:** all are present — node-postgres #26, #107, #166, #266, #451, #730, #1283, #1613, #1943 and postgres.js #270, #336, #874, #1106 are each mapped to a test. No omitted high-signal bug/regression issues.


## Data Types — datetime

_Covers decoding/encoding of `date`, `time`, `timetz`, `timestamp`, `timestamptz`, and `interval`. This is the single most error-prone area for PG drivers: the recurring failure is conflating a wall-clock value with an instant, applying the client's local timezone offset where none is warranted. Bugs here silently corrupt user data (off-by-one day, off-by-N hours) rather than throwing, so deterministic round-trip tests are mandatory._

### 1. `timestamp without time zone` must NOT be shifted by the local offset
**Why it matters / failure mode:** A `timestamp` carries no zone; the wall-clock fields are authoritative. Both drivers historically parsed it by feeding the string into a local-timezone `Date`, so the same row read in `TZ=America/New_York` vs `TZ=UTC` yields different instants. This is the highest-volume cluster and hits BOTH node-postgres and postgres.js.
- **Test:** Under `TZ` set to several zones (UTC, America/New_York, Asia/Kolkata), `SELECT '2020-06-01 13:45:00'::timestamp` must yield a JS Date whose **wall-clock fields equal 2020-06-01 13:45:00** (i.e. `getFullYear/Month/Date/Hours/Minutes` match in the active interpretation) and is identical across runs of the same configured semantics — not shifted by the host offset. _(refs: node-postgres#11, node-postgres#225, node-postgres#1071, postgres.js#563, postgres.js#999, postgres.js#1075)_
- **Test:** `SELECT timezone('UTC', now())::timestamp` and `SELECT * FROM generate_series('2020-01-01'::timestamp, '2020-01-01 03:00', '1 hour')` must each decode with **no ±1h DST/local shift**; consecutive series values differ by exactly 3600000 ms. _(refs: node-postgres#429, node-postgres#993, node-postgres#1868, node-postgres#655)_
- **Test:** Insert a JS `Date` into a `timestamp` (no tz) column with `TZ=UTC` and read back: the stored text must equal the Date's UTC wall-clock (unchanged time, no offset added). _(refs: node-postgres#1172, node-postgres#2141)_

### 2. `date` type: calendar day must survive (no previous-day shift, no spurious time)
**Why it matters / failure mode:** A bare `date` has no time and no zone. Parsing it as `new Date('1975-05-11')` (UTC midnight) then reading `getDate()` in a negative-offset zone returns the **10th**. Both drivers exhibit the off-by-one-day bug.
- **Test:** `SELECT '1975-05-11'::date` under negative-offset and positive-offset `TZ`: the result's calendar fields must still read **year 1975, month May, day 11** (no rollover to the 10th or 12th). _(refs: node-postgres#510, node-postgres#818, node-postgres#1844, node-postgres#2154, postgres.js#697)_
- **Test:** `date` and `timestamp` decoding must be internally consistent — a `date` does not silently acquire an ISO time/zone suffix or become a different calendar day than `timestamp '...'::date`. _(refs: node-postgres#156, node-postgres#1577)_
- **Test (feature/option):** With the date-as-string (or date-only) parser option enabled, `SELECT '2020-03-15'::date` returns the raw `'2020-03-15'` string, never a `Date` with a time/zone component. _(refs: node-postgres#3290, node-postgres#285)_

### 3. `timestamptz`: correct instant, independent of client zone
**Why it matters / failure mode:** `timestamptz` is an absolute instant; the wire value already carries an offset. The driver must decode it to the correct `Date` (same `getTime()`) regardless of session `TimeZone` or host `TZ`; session zone affects only text display. Frequent symptom: "adds N hours."
- **Test:** Round-trip a JS `Date` through a `timestamptz` column: `inserted.getTime() === selected.getTime()` under any `TZ` and any server `SET TimeZone`. _(refs: node-postgres#1150, node-postgres#2390, node-postgres#2525, node-postgres#2530, node-postgres#3278, postgres.js#388)_
- **Test:** The same `timestamptz` value selected from two different tables/queries in one connection decodes to identical instants. _(refs: node-postgres#1119)_
- **Test:** Timestamps with `hh:mm:ss` (non-integer-hour) offsets, e.g. `'2020-01-01 00:00:00+05:30'`, decode to the correct instant. _(refs: node-postgres#616)_

### 4. JS `Date` (and Date-likes) parameter serialization
**Why it matters / failure mode:** Binding a `Date` must produce an unambiguous ISO timestamp Postgres accepts — never `Date.prototype.toString()` (yields `time zone "gmt-0500" not recognized`) and never dependent on server `DateStyle`. Invalid Dates must fail loudly, not emit garbage.
- **Test:** Binding a `Date` to `timestamptz`/`timestamp` produces a value Postgres parses with **no `22023`/`22007` error** and is correct under server `DateStyle = MDY` and `YMD` alike. _(refs: node-postgres#1583, node-postgres#2061, node-postgres#2640, node-postgres#1765, node-postgres#1870)_
- **Test:** A Date-like from another realm/VM (matched via `util.types.isDate`, not `instanceof Date`) is serialized as a timestamp, not stringified as `[object Object]`/JSON. _(refs: node-postgres#2860)_
- **Test:** Serializing `new Date(undefined)` / an invalid Date **throws** (or yields an explicitly invalid sentinel) rather than emitting `0NaN-NaN-NaNTNaN:NaN:NaN.NaN+NaN:NaN`. _(refs: node-postgres#3318)_
- **Test:** An ISO-8601 string with explicit offset bound to a `timestamptz` is stored at the indicated instant, not reinterpreted as local. A native PG timestamp string with fractional seconds (`'2020-01-01 00:00:00.123'`) is not split on the `.` by the escaper. _(refs: node-postgres#1746, postgres.js#222)_
- **Test:** A `Date` param cast to `timestamp` compares equal to the same ISO timestamp stored in `jsonb`. _(refs: node-postgres#2088)_

### 5. Edge eras & sentinels: BC, Y10K (5-digit year), pre-2000 binary, ±Infinity
**Why it matters / failure mode:** Boundary years and infinity are routinely mishandled — truncated, returned as `Invalid Date`, or sign-flipped. Affects both text and binary paths.
- **Test:** `SELECT '0063-01-01 00:00:00 BC'::timestamp` decodes to a **BC/negative-year** Date, not an AD date. _(refs: node-postgres#424)_
- **Test:** A date with a 5-digit year (`year > 9999`) parses without truncating to 4 digits. _(refs: node-postgres#441)_
- **Test:** `SELECT 'infinity'::timestamp` → `Infinity`, `'-infinity'::timestamp` → `-Infinity` (or documented sentinel), never `Invalid Date`. _(refs: node-postgres#1026, postgres.js#728)_
- **Test (binary protocol):** A timestamp **before year 2000** read via the binary/extended protocol decodes to the correct date, not `Invalid Date`. _(refs: node-postgres#1832)_

### 6. `interval` parsing
**Why it matters / failure mode:** Interval text parsing has multiple distinct defects: missing `parseInt` radix (leading-zero fields), wrong sign on milliseconds of negative intervals, empty object for all-zero/`iso_8601` styles.
- **Test:** Interval fields with leading zeros (`'08'`, `'09'` minutes/seconds) parse as decimal, not `undefined`. _(refs: node-postgres#113)_
- **Test:** A negative interval has **all** components (including ms) negative so they sum consistently to a negative total. _(refs: node-postgres#1380)_
- **Test:** `'00:00:00'::interval` parses to a fully-zeroed interval object (defined `hours/minutes/seconds`), not `{}`. _(refs: node-postgres#2566)_
- **Test:** With `SET intervalstyle = 'iso_8601'`, `'3 months'::interval` still parses to a non-zero interval (months=3), not all-zeros. _(refs: node-postgres#3156)_

### 7. Sub-millisecond / microsecond precision
**Why it matters / failure mode:** PG timestamps carry microseconds; JS `Date` only milliseconds. The driver must truncate/round deterministically (and ideally offer full-precision access), not corrupt the value.
- **Test:** A timestamp with microseconds (`'2020-01-01 00:00:00.123456'`) decodes to a `Date` whose ms is a deterministic, documented truncation/rounding of `.123456` (i.e. 123 ms), and comparing the returned Date back reflects exactly that. _(refs: node-postgres#1200, node-postgres#1207)_
- **Test (feature):** A documented path exposes the full microsecond precision (raw string or extended value) without lossy `Date` coercion. _(refs: node-postgres#269)_

### 8. Custom type parsers must apply everywhere (incl. raw-string opt-out)
**Why it matters / failure mode:** Users need to override date/timestamp decoding (e.g. return raw strings). The parser registry must cover all code paths, including dynamic-column selects — but values *embedded inside* `json/jsonb` are JSON text and must NOT be force-parsed by the column type parser.
- **Test:** Registering a parser for OID 1114 (`timestamp`)/1184 (`timestamptz`)/1082 (`date`) makes those columns return the raw string; opting out of auto-Date conversion is honored on pooled connections. _(refs: node-postgres#285, node-postgres#783, node-postgres#1084, node-postgres#1350, node-postgres#2141, node-postgres#1577, postgres.js#161)_
- **Test:** A custom timestamp parser applies to columns selected via the dynamic-column helper (`sql(cols)` / `sql.unsafe`-style), not only literal columns. _(refs: postgres.js#1010)_
- **Test (negative):** A timestamp embedded in `json_build_object(...)` is returned as part of the JSON string and is **not** run through the type-1114 parser; the same column selected directly **is** parsed. _(refs: node-postgres#1743)_

### 9. `timetz` (oid 1266) and `time` handling
**Why it matters / failure mode:** `timetz` was simply unhandled in postgres.js, returning raw/unparsed; time-of-day types need defined decoding.
- **Test:** `SELECT '12:34:56+05:30'::timetz` (oid 1266) decodes to a defined, correct value rather than being passed through unhandled. _(refs: postgres.js#54)_

### 10. Session timezone is configurable and effective
**Why it matters / failure mode:** Users must be able to `SET TIME ZONE`/`SET TimeZone` (including in a pool `connect` handler) and have it affect subsequent queries on that client; it controls text display of `timestamptz`, not the decoded instant.
- **Test:** `SET TIME ZONE` issued in the pool `connect` event changes the session zone for later queries on that pooled client. _(refs: node-postgres#3265, node-postgres#2417)_
- **Test:** A `timestamptz` default of `now() at time zone 'utc'` stores the same instant regardless of the client session `TimeZone`. _(refs: node-postgres#3246)_

### 11. Non-null results & date-string parameter matching (regression guards)
**Why it matters / failure mode:** Several reports show timestamp/date columns intermittently returning `null`, and date-string params failing to match ranges — symptoms of parser/protocol mishandling rather than real nulls.
- **Test:** Selecting non-null `date`/`timestamp`/`timestamptz` columns returns the parsed value (never `null`), including within large multi-id `IN (...)` queries and across server versions. _(refs: node-postgres#471, node-postgres#551, node-postgres#2443, node-postgres#3274)_
- **Test:** A `BETWEEN $1 AND $2` range query with date-string parameters matches the same rows as the equivalent literal query (params not stringified differently than literals). _(refs: postgres.js#582)_
- **Test (negative/footgun):** A bogus string like `'to_timestamp(now())'` bound as a timestamp param is treated as a bound value and errors gracefully, never crashing the serializer with "Invalid time value". _(refs: postgres.js#1048)_

### 12. ECMAScript Temporal interop (forward-looking)
**Why it matters / failure mode:** Emerging requirement to bind/return Temporal types mapping cleanly to PG date/time/interval.
- **Test:** `Temporal.PlainDate`→`date`, `Temporal.PlainTime`→`time`, `Temporal.Instant`→`timestamptz`, `Temporal.Duration`→`interval` round-trip equivalently to their `Date`-based counterparts. _(refs: node-postgres#3663, postgres.js#856)_

### ✅ Verification notes
**Grounding & coverage (mechanically checked):** Every ref cited in the section exists in the source records (no hallucinated refs). All 33 high-signal issues (kind=bug AND testable=high) are covered. The only records not referenced anywhere are #1249 (bug/**low** — date-parser memory leak), node-postgres#1657 (question/medium) and postgres.js#724 (question/low); none are high-signal, so coverage of the bug/high set is complete.

**Expectation corrections / caveats:**
- §7 (microsecond precision): the chosen example `.123456` collapses truncation and rounding to the same result (123 ms), so it does **not** actually exercise node-postgres#1207's "round properly" expectation. Add a distinguishing case, e.g. `'2020-01-01 00:00:00.1239'::timestamp` → assert `getMilliseconds()` resolves per the driver's *documented* rule (round→124 vs truncate→123). #1200 and #1207 want subtly different things (observe-truncation vs round); the test must pin which the driver implements rather than allow both.
- §1, generate_series test: "consecutive series values differ by **exactly** 3600000 ms" is only true because the example date (2020-01-01) sits outside any DST transition. Under the section's own wall-clock-preserving model, a series crossing a spring-forward/fall-back boundary in a DST zone would legitimately *not* be 3600000 ms apart. Keep the assertion but add a comment constraining it to DST-free dates, or assert on wall-clock field equality instead of the raw ms delta to stay robust.

**Coverage gaps worth noting (not high-signal omissions, so not blocking):**
- node-postgres#783 (feature/high — parse `timestamp`/`date` *as UTC* via an option) is listed under §8 but the §8 test only asserts raw-string return; the parse-as-UTC behavior is never actually exercised. Recommend a dedicated test: with the UTC-interpretation option on, `SELECT '2020-06-01 13:45:00'::timestamp` yields a Date whose **UTC** fields equal the wall clock (`getUTCHours()===13`) regardless of host TZ. (Pairs with the documented-semantics intent of #1071.)
- node-postgres#1350 is miscategorized in §8 (output type-parser registry); its intent is **input** serialization (`parseInputDatesAsUTC` runtime-configurable). It is really an extension of §1's "insert JS Date into timestamp" test — move/duplicate it there and assert the serialized text flips between local and UTC as the flag toggles.
- Optional low-signal add: a regression guard for #1249 (parse a large batch of date rows without unbounded memory growth in the parser).

Verdict: corrected — expectations are substantively right; two test refinements above, plus the #783/#1350 categorization fixes. No high-signal omissions.


## Data Types — bool

_Covers binding JS values to `boolean`/`bit` columns and decoding PostgreSQL boolean wire values back to JS. Boolean handling is a high-traffic surface: drivers must reconcile the PG text protocol (`t`/`f`) and the many "truthy" forms PG itself accepts, without silently coercing to the wrong value._

### Binding JS booleans as parameters
**Why it matters / failure mode:** Users expect to pass a native JS `true`/`false` to a `boolean` column via parameterized query; a naive driver may stringify to `"true"`/`"false"` or emit a syntax error, or send `1`/`0` that the server rejects.
- **Test:** `INSERT INTO t(flag) VALUES ($1)` with param `true`, then `SELECT flag` returns JS `true`; with param `false` returns JS `false`. No syntax/protocol error on bind. _(refs: node-postgres#499)_
- **Test:** `SELECT $1::bool` bound with JS `true` round-trips to `true`; bound with `false` round-trips to `false`. _(refs: node-postgres#499)_
- **Test:** Binding `null` to a `boolean` column stores SQL `NULL` and `SELECT` returns JS `null` (not `false`). _(refs: node-postgres#499)_

### Decoding boolean text values to JS
**Why it matters / failure mode:** PG returns `t`/`f` on the text protocol; a driver must map these to JS `true`/`false` and never leak the raw single-char string.
- **Test:** `SELECT true` yields JS `true` (boolean type), `SELECT false` yields JS `false`; values are JS booleans, not the strings `"t"`/`"f"`. _(refs: node-postgres#499, postgres.js#858)_
- **Test:** `SELECT NULL::bool` yields JS `null`. _(refs: node-postgres#499)_

### Truthy string literals inserted into boolean columns
**Why it matters / failure mode:** PostgreSQL accepts many literal spellings for boolean input (`'t'`,`'true'`,`'yes'`,`'on'`,`'1'`, and false equivalents). When a driver passes a string param to a `boolean` column it must let PG do the cast and store the correct value — a known footgun is the driver coercing/quoting the string such that `'t'` lands as `false` (or errors). This bit postgres.js when inserting via the `sql()` helper object.
- **Test:** Insert string `'t'` into a `boolean` column (via parameter / object-style insert) stores `true`, not `false`; `SELECT` returns JS `true`. _(refs: postgres.js#858)_
- **Test:** Insert string `'f'` into a `boolean` column stores `false`; `SELECT` returns JS `false`. _(refs: postgres.js#858)_
- **Test:** Inserting each PG-recognized true literal (`'true'`,`'yes'`,`'on'`,`'1'`) into a `boolean` column stores `true`; each false literal (`'false'`,`'no'`,`'off'`,`'0'`) stores `false`. _(refs: postgres.js#858)_
- **Test:** Inserting an unrecognized string (e.g. `'maybe'`) into a `boolean` column raises a PG `invalid input syntax for type boolean` error rather than silently storing `false`. _(refs: postgres.js#858)_

### Bit / bit-string type decoding
**Why it matters / failure mode:** `bit`/`bit(n)` values arrive as strings of `0`/`1`; users expect a meaningful boolean/numeric decode rather than an opaque raw string. The expected, spec-consistent behavior is documented so the driver is deterministic.
- **Test:** `SELECT B'1'::bit` and `SELECT B'0'::bit` decode to a documented, stable representation (e.g. the bit-string `"1"`/`"0"`); a single-bit value maps cleanly to a boolean sense (`'1'`→true, `'0'`→false) if the driver offers bit-to-bool decoding. _(refs: node-postgres#1422)_
- **Test:** `SELECT B'101'::bit(3)` decodes to the stable bit-string `"101"` (no truncation/reordering), preserving width. _(refs: node-postgres#1422)_
- **Test:** A `bit`/`varbit` value round-trips: a value selected out and re-bound into a `bit(n)` column produces an equal value. _(refs: node-postgres#1422)_

### ✅ Verification notes
Verified: no corrections; coverage complete.
- All expectations are correct per PostgreSQL semantics: JS bool binding (#499), `t`/`f`→JS boolean decode, the `true`/`yes`/`on`/`1` vs `false`/`no`/`off`/`0` literal cast set (#858), `invalid input syntax for type boolean` for `'maybe'`, and `bit`/`bit(n)` text representations `"1"`/`"0"`/`"101"` (#1422).
- Minor (non-blocking) note: lines 13–14 cite #499 for *decoding* `t`/`f`, which is a natural extension of the round-trip intent rather than an explicit claim in that issue; not a hallucination.
- No omitted high-signal tests: none of the three source records are kind=bug/regression, so there is no (bug/regression AND testable=high) ref to add.


## Data Types — json

_Covers binding JS values to `json`/`jsonb` parameters (serialization) and decoding `json`/`jsonb` result columns (parsing), including arrays, scalars, NULL, nested precision, parser overrides, and transform interaction. This is the single most error-prone type for both drivers because JSON sits at the boundary between "the driver auto-converts" and "the user must stringify" — and getting it wrong silently corrupts data (double-encoding, `[object Object]`, lost keys, precision loss)._

### Parameter serialization: objects and scalars
**Why it matters / failure mode:** Users expect to bind a JS value to a `json`/`jsonb` param and have the driver call `JSON.stringify` once. Failing to do so yields `[object Object]`, `invalid input syntax for type json`, or cast errors. This is the most-reported cluster across BOTH repos.
- **Test:** Binding a plain JS object `{a:1,b:"x"}` to a `jsonb` param inserts and reads back deep-equal to the original; no manual `JSON.stringify` required. _(refs: node-postgres#208, node-postgres#705, node-postgres#767, node-postgres#800, node-postgres#1341, node-postgres#2864, postgres.js#10, postgres.js#108, postgres.js#556, postgres.js#625)_
- **Test:** Binding a JS string `"hello"` to a `json`/`jsonb` param stores the JSON string value `"hello"` (i.e. serialized as `"\"hello\""`) and round-trips to `"hello"`, instead of raising `invalid input syntax for type json`. _(refs: node-postgres#2576, node-postgres#2750, postgres.js#2576)_
- **Test:** Binding a JS boolean `true`/`false` to a `json`/`jsonb` param stores JSON `true`/`false` and round-trips, instead of failing with `cannot cast type boolean to jsonb`. Includes the explicit-cast form `${true}::jsonb`. _(refs: postgres.js#386, postgres.js#1003, postgres.js#931)_
- **Test:** Binding a JS number to a `jsonb` param via dynamic SET/FROM stores a JSON number and round-trips. _(refs: postgres.js#657)_
- **Test:** Binding an empty object `{}` to a `jsonb` param stores `{}` and does NOT raise `invalid input syntax for type json` (regression seen even on unrelated columns). _(refs: node-postgres#1909)_

### Parameter serialization: arrays must become JSON arrays, not PG array literals
**Why it matters / failure mode:** A JS array bound to a `json`/`jsonb` column must serialize to `[...]` JSON, not a Postgres array literal `{...}`. Drivers that route arrays through the array codec produce `invalid input syntax for type json` or store `{}` for empty arrays — a classic, repeatedly-filed footgun in BOTH repos.
- **Test:** Binding `[1,2,3]` to a `json`/`jsonb` param produces JSON `[1,2,3]` and inserts without `invalid input syntax for type json`. _(refs: node-postgres#374, node-postgres#442, node-postgres#857, node-postgres#1016, node-postgres#865, node-postgres#1143, node-postgres#3125, node-postgres#2649)_
- **Test:** Binding an empty array `[]` to a `json`/`jsonb` column stores JSON `[]`, and selecting it back yields `[]` — NOT `{}`. (Known data-corruption bug.) _(refs: node-postgres#864, node-postgres#2680)_
- **Test:** Binding an array of objects `[{...},{...}]` to a `json`/`jsonb` param inserts all elements as proper JSON without invalid-syntax errors. _(refs: node-postgres#1383, node-postgres#2649, postgres.js#203)_
- **Test:** Binding an array of booleans `[true,false]` to a `jsonb` column serializes as JSON `[true,false]`, not as a boolean SQL expression / cast error. _(refs: postgres.js#575, postgres.js#931)_

### Result parsing: json/jsonb decode to JS values
**Why it matters / failure mode:** `json`/`jsonb` (and producers like `array_to_json`, `to_jsonb`, `row_to_json`) must be parsed to JS objects/arrays/scalars, not returned as raw strings.
- **Test:** Selecting a `json`/`jsonb` column returns a parsed JS object/array, not a string. _(refs: node-postgres#199, node-postgres#658, postgres.js#634)_
- **Test:** `SELECT array_to_json(array_agg(...))` and `to_jsonb(array)` results parse to a JS array even when empty (e.g. `COALESCE(...,'[]')` yields `[]`, not the string `'[]'`). _(refs: node-postgres#1586, node-postgres#1920)_
- **Test:** A `jsonb` expression evaluating to SQL NULL (e.g. `col->'missing'`, or JSON null path) decodes to JS `null` — NOT `{}` and not the string `"null"`. _(refs: node-postgres#3085)_

### Nested precision: values inside JSON are not re-typed
**Why it matters / failure mode:** Postgres serializes a `bigint` inside `json_build_object`/`to_jsonb`/`json_agg` as a JSON number. Naive `JSON.parse` loses precision above 2^53. Drivers must document this and ideally preserve big integers. Values nested in JSON are NOT passed through column type parsers.
- **Test:** A `bigint`/`int8` embedded via `json_build_object`/`json_agg(to_jsonb(...))` round-trips without precision loss (e.g. `9007199254740993` is not silently corrupted). Assert the driver's documented behavior for big-int-in-JSON. _(refs: node-postgres#1319, node-postgres#2265, node-postgres#2385)_
- **Test:** Numeric/timestamp values nested inside a `row_to_json`/json subquery are returned in their raw JSON form (string/number as Postgres emitted them) and are NOT run through the per-OID type parsers — assert this documented distinction. _(refs: node-postgres#1876)_

### Parser overrides / disabling JSON processing
**Why it matters / failure mode:** Some workloads need the raw JSON text (streaming, custom reviver, lossless bigint). Drivers must allow overriding/disabling the json/jsonb parser per-OID or per-query.
- **Test:** Registering a custom type parser for the `json`/`jsonb` OID causes that function to be invoked instead of the default `JSON.parse`. _(refs: node-postgres#1122)_
- **Test:** Overriding the `json`/`jsonb` parser with an identity function returns the exact raw JSON string, including scalar JSON strings (e.g. raw `"\"x\""`). _(refs: node-postgres#722, node-postgres#2951, postgres.js#194)_

### Double-encoding & helper consistency (footgun)
**Why it matters / failure mode:** The worst silent corruption: a value gets `JSON.stringify`'d twice (or `toString()`'d), storing a quoted/escaped string inside the jsonb instead of an object. Reproduced under concurrency, dynamic insert helpers, and ORM integration in BOTH repos — strong signal to guard against.
- **Test:** Inserting a JS object into a `jsonb` column deterministically stores a JSON object, never a double-stringified escaped string — including under concurrent inserts and repeated runs. _(refs: postgres.js#678, postgres.js#937, postgres.js#378, postgres.js#379)_
- **Test:** A pre-stringified JSON value (already a string produced for a jsonb column) is not stringified a second time, so the stored jsonb is an object, not a double-encoded string. _(refs: postgres.js#1139)_
- **Test:** The dynamic insert/`sql()` helper serializes object/array properties with `JSON.stringify` (not `toString`/`[object Object]`) for `json`/`jsonb` columns. _(refs: postgres.js#114, postgres.js#242, postgres.js#872)_
- **Test:** A JS object bound for a `jsonb` column in a VALUES-based UPDATE serializes as JSON, not `[object Object]`. _(refs: postgres.js#872)_
- **Test:** `undefined`-valued keys in an object bound to `jsonb` are omitted (standard `JSON.stringify` semantics); assert the resulting jsonb has those keys absent. _(refs: node-postgres#1197)_

### jsonb[] (array-of-json columns)
**Why it matters / failure mode:** A `jsonb[]` column is a Postgres array whose elements are JSON — easy to mis-escape into doubly-quoted strings.
- **Test:** Inserting a JS array of objects into a `jsonb[]` column stores proper JSON elements (each a JSON object), not doubly-escaped strings. _(refs: node-postgres#1588, postgres.js#784)_
- **Test:** Inserting a `jsonb[]` whose objects contain a `"type"` key succeeds and stores the key verbatim (no keyword misinterpretation). _(refs: postgres.js#838)_

### Transforms must not rewrite JSON content
**Why it matters / failure mode:** Column-name transforms (snake_case→camelCase) must apply to result column names only, never to keys inside a jsonb value.
- **Test:** With a snake→camel key transform enabled, keys inside a returned `jsonb` value are left untouched (e.g. `{"a_b":1}` stays `a_b`, not `aB`). _(refs: postgres.js#983)_

### Comparison/cast ergonomics
**Why it matters / failure mode:** Binding stringified JSON as `unknown` against a `json` column fails with `operator does not exist: json = unknown`; document the required `::json`/`::jsonb` cast.
- **Test:** Comparing a bound JSON value against a `json` column requires an explicit `::json` cast; assert the driver's documented pattern works and the uncast form's failure is explained. _(refs: node-postgres#2675)_

### ✅ Verification notes

**Corrections:**

- **Hallucinated/typo ref (line 8):** The string-param test cites `postgres.js#2576`. No such issue exists in the records (postgres.js issue list tops out well below that; #2576 only exists under node-postgres, which is already cited correctly). Drop `postgres.js#2576`. The remaining refs `node-postgres#2576`, `node-postgres#2750` are correct and the expected behavior (bare JS string → `JSON.stringify("hello")` → stored `"\"hello\""`, round-trips to `"hello"`) is sound for an auto-encoding driver.

- **Incorrect SQL semantics (line 55, ref node-postgres#2675):** The expected behavior — "comparing a bound JSON value against a `json` column requires an explicit `::json` cast" — is misleading per PostgreSQL semantics. The `json` type has **no** equality/comparison operators at all; only `jsonb` does. Adding a `::json` cast resolves the `unknown` type ambiguity but the comparison still fails with `operator does not exist: json = json`. The genuinely working fixes are to cast the column/param to `::jsonb` or `::text` (or store as `jsonb`). The test should assert that `::json` alone does NOT enable equality, and that `::jsonb`/`::text` is the correct pattern — otherwise it will codify an impossible expectation.

- **Bigint-in-JSON phrasing (line 28, refs #1319/#2265/#2385):** The headline "round-trips without precision loss" is only achievable if the driver replaces default `JSON.parse` (which corrupts integers > 2^53, e.g. `9007199254740993` → `...992`). The hedge "assert the driver's documented behavior" is good, but the test must explicitly distinguish: default parser = precision loss (assert documented/known), opt-in lossless parser = exact. As written it risks asserting an outcome that vanilla `JSON.parse` cannot deliver.

**Omissions (high-signal):**

- **node-postgres#2012** (bug, testable=high — "JS array as jsonb param round-trips to a JSON array without manual stringify") is not cited anywhere. Its behavior is already covered conceptually by the array-serialization tests (lines 15–16), so this is a missing citation rather than a missing test. Add `node-postgres#2012` to the refs on line 15 for traceability.

All other bug/high refs from the records are present and grounded; no other coverage gaps found. Expected behaviors for parsing (lines 22–24), nested non-re-typing (line 29), parser overrides (lines 33–34), empty-array `[]` vs `{}` (line 16), SQL-NULL→`null` (line 24), and `undefined`-key omission (line 42) are all correct per PostgreSQL semantics.


## Data Types — array

_Covers decoding Postgres array result values into JS arrays (by element type), parsing the textual array-literal grammar, NULL-element handling, and encoding JS arrays back into valid array literals with correct element-type inference. Arrays touch nearly every scalar type, so a driver must get both the brace-grammar and the per-element type codec right._

### Element-type decoding (per-OID array codecs)
**Why it matters / failure mode:** Many array OIDs fall back to a raw `{...}` string or apply the wrong scalar codec (e.g. `parseInt` on floats), corrupting data silently. A driver must decode each `_T` array by applying type `T`'s element parser.
- **Test:** `SELECT '{1.5,2.25,3.75}'::float8[]` decodes to JS `[1.5, 2.25, 3.75]` (numbers, with decimal part preserved — not strings, not `parseInt`-truncated integers). _(refs: node-postgres#93, node-postgres#131, node-postgres#845)_
- **Test:** `SELECT '{1.50,2.00}'::numeric[]` (oid 1231) decodes to `['1.50','2.00']` as strings (full precision preserved, consistent with scalar `numeric`), not `[1,2]` integers. _(refs: node-postgres#304, node-postgres#3094)_
- **Test:** `SELECT '{a,b,c}'::varchar[]` and `::char[]` (oid 1015/1014) decode to `['a','b','c']`, not a raw brace string. _(refs: node-postgres#73, node-postgres#217, node-postgres#2351, postgres.js#718)_
- **Test:** `SELECT '{x,y}'::name[]` (_name, oid 1003) decodes to `['x','y']`. _(refs: node-postgres#986)_
- **Test:** `SELECT ARRAY[1,2]::int8[]` decodes consistently with scalar int8 (strings by default); with `parseInt8`/bigint-parsing enabled, decodes to `[1n,2n]`/numbers — element codec must mirror the scalar setting. _(refs: node-postgres#452, node-postgres#614, postgres.js#837)_
- **Test:** `SELECT '{"\\x0001","\\x0203"}'::bytea[]` decodes to an array of two `Buffer` (or `Uint8Array`) values, not a string. _(refs: node-postgres#738)_
- **Test:** `SELECT ARRAY['{"a":1}','{"b":2}']::jsonb[]` decodes to `[{a:1},{b:2}]` (each element JSON-parsed), not a raw string. _(refs: node-postgres#775)_
- **Test:** `SELECT '{$2.50,$1.99}'::money[]` decodes to an array of two money values applying the scalar money codec, not the literal `'{$2.50,$1.99}'` string. _(refs: node-postgres#781)_
- **Test:** Enum array `SELECT ARRAY['a','b']::myenum[]` decodes to `['a','b']` (array of strings), not a raw `{a,b}` string or an object. _(refs: node-postgres#691, node-postgres#944, node-postgres#1479)_
- **Test:** `SELECT '{a,b}'::citext[]` decodes to `['a','b']`. _(refs: node-postgres#1620)_

### Array-literal grammar edge cases
**Why it matters / failure mode:** Naive `split(',')` / `parseInt` parsers mishandle quoting, escapes, custom delimiters, and dimension prefixes. The textual array grammar must be parsed properly.
- **Test:** `SELECT ARRAY['a,b','c']::text[]` decodes to `['a,b','c']` — a quoted element with an embedded comma stays one element. _(refs: node-postgres#99)_
- **Test:** A `text[]` parameter `['hello\nworld']` round-trips with the newline/backslash preserved (no dropped backslash). _(refs: node-postgres#1147)_
- **Test:** `box[]` arrays use the `;` element delimiter (typdelim): `SELECT '{(1,1),(0,0);(3,3),(2,2)}'::box[]` parses into 2 box elements, not split on commas. _(refs: node-postgres#3020, postgres.js#576)_
- **Test:** Array with non-default lower bound, e.g. `SELECT '[0:1]={40.44,-79.95}'::float8[]`, strips the `[0:1]=` dimension prefix and parses all elements (first element is `40.44`, not `NaN`/prefixed). _(refs: node-postgres#845, node-postgres#870)_
- **Test:** `SELECT array[]::text[]` (and `SELECT '{}'::int4[]`) decodes to `[]` (empty JS array), not `undefined`/`null`. _(refs: node-postgres#1261)_
- **Test:** Array decode tests over a representative type matrix all pass (regression guard for the parser suite). _(refs: node-postgres#125)_

### NULL elements inside arrays
**Why it matters / failure mode:** Both drivers have mis-decoded the literal token `NULL` — yielding `NaN` or the string `'NULL'` instead of JS `null`. Strong cross-driver signal.
- **Test:** `SELECT '{1,NULL,3}'::int2[]` decodes to `[1, null, 3]` (the NULL element is JS `null`, not `NaN`). _(refs: postgres.js#1049)_
- **Test:** `SELECT array_agg(x)` over rows including SQL NULL decodes NULL elements to JS `null`, not the string `'NULL'`. _(refs: postgres.js#1124)_
- **Test:** `SELECT array_agg(t)` over text values containing NULLs parses cleanly with no "Unexpected token N" JSON error. _(refs: postgres.js#800)_

### Encoding JS arrays → array-literal parameters
**Why it matters / failure mode:** Passing a JS array as `$1` must produce a valid Postgres array literal `{...}` (not a JSON `[...]` or bare comma-joined string), or the server rejects it with "malformed array literal".
- **Test:** `INSERT ... VALUES ($1)` with JS `['a','b','c']` into a `text[]` column round-trips to `['a','b','c']` (serialized as `{a,b,c}`, not `["a","b","c"]`). _(refs: node-postgres#3041, node-postgres#3319, postgres.js#741)_
- **Test:** Passing JS `['id1','id2']` (UUID strings) into a `uuid[]` column / `ARRAY[${ids}]::uuid[]` serializes as a Postgres array of uuids, not one comma-joined string. _(refs: node-postgres#2268, postgres.js#1029)_
- **Test:** An array parameter containing null elements, e.g. `['A', null, 'B']::text[]`, serializes to `{A,NULL,B}` without throwing "cannot read type/properties of null". _(refs: postgres.js#371, postgres.js#377)_
- **Test:** JS `[1n,2n]` (bigint[]) bound to an `int8[]` column inserts and round-trips correctly. _(refs: postgres.js#837)_
- **Test:** Nested JS arrays bound to `text[][]` serialize to a valid multi-dim literal `{{...},{...}}` and round-trip. _(refs: node-postgres#2692, postgres.js#410)_

### Array parameter type inference / OID selection
**Why it matters / failure mode:** The bound array param must carry the correct element OID. Defaulting to `text[]`, inferring from a `null` first element, or losing the type on the first `sql.array()` call breaks casts and `ANY(...)`.
- **Test:** An empty array param is encoded with the requested element type (`integer[]`), not silently `text[]`. _(refs: postgres.js#49)_
- **Test:** `sql.array([1,2,3])` into an `integer[]` column is typed `int4[]`, not `text[]`. _(refs: postgres.js#127)_
- **Test:** A boolean array param serializes as `bool[]` (`{t,f}`), not collapsed to a single boolean. _(refs: postgres.js#471)_
- **Test:** Type inference for `sql.array([null, 'x'])` does not degrade to the wrong/`text` type when the first element is `null` — it uses a non-null element or the column type. _(refs: postgres.js#408)_
- **Test:** The first `sql.array()` call in a session (no fetch_types yet / `fetch_types:false`) still resolves the correct array OID via static mappings rather than producing a malformed literal or a fetch_types-race wrong type. _(refs: postgres.js#789, postgres.js#1164)_
- **Test:** `sql.array(stringArray)` into a `varchar[]` column serializes as an array type (regression guard for the 3.4.4 break, not text). _(refs: postgres.js#853)_
- **Test:** Repeated identical queries using `sql.array` (incl. nested) return consistent, correctly typed results on the 1st and 2nd execution. _(refs: postgres.js#410)_

### UNNEST and dynamic array casts (multi-row insert)
**Why it matters / failure mode:** The common bulk-insert pattern `UNNEST($1::t[], $2::t[])` requires each array param to serialize correctly and casts to use valid type names.
- **Test:** `INSERT ... SELECT * FROM UNNEST($1::text[], $2::int4[])` with JS arrays inserts one row per index, each `int4` element correct. _(refs: node-postgres#1644, node-postgres#3292, postgres.js#452)_
- **Test:** Dynamic casts resolve to valid Postgres type names — `ANY($1::integer[])` works (driver/helper must not emit the nonexistent `int[]`). _(refs: node-postgres#3365)_
- **Test:** A plpgsql function returning an array (`RETURNS int[]`) yields a parsed JS array in the result rows. _(refs: node-postgres#1237)_
- **Test:** A column array of any type (basic smoke): `SELECT '{1,2,3}'::int[]` returns the JS array `[1,2,3]`. _(refs: node-postgres#10)_

### ✅ Verification notes
**Correctness of expectations:** All element-codec, grammar, NULL-handling, encoding, and inference tests are correct per PostgreSQL semantics. Spot checks: `_numeric` (oid 1231) decoding to strings (lines 8) and `_int8` strings-by-default (line 11) match scalar codec behavior; `box[]` uses the `;` typdelim (line 22) — correct; `[0:N]=` lower-bound prefix stripping (line 23) — correct; `_varchar`=1015 / `_bpchar`=1014 / `_name`=1003 OIDs (lines 9-10) are accurate.

- **CORRECTION — line 54 (`node-postgres#3365`):** The parenthetical claim that `int[]` is "the nonexistent `int[]`" is factually wrong. `int` is a standard PostgreSQL alias for `integer`, so `int[]`, `integer[]`, and `int4[]` are all valid type spellings and `ANY($1::int[])` works server-side. This contradicts the section's own line 56, which uses `'{1,2,3}'::int[]` and expects it to succeed. Reframe the test: the real concern in #3365 is that a *client-side helper* generating a cast/type-name string must emit a token PostgreSQL recognizes — but `int[]` already qualifies. The discriminating value of this test should rest on the helper producing a valid cast at all, not on `int[]` being invalid. Drop the "nonexistent" assertion.

**Coverage of high-signal (bug/regression + testable:high) records:** complete. All 37 high-signal refs are present — node-postgres #93,#99,#131,#217,#304,#452,#614,#691,#738,#775,#781,#845,#870,#944,#986,#1147,#1261,#1479,#1620,#2351,#3020,#3094,#3319 and postgres.js #49,#127,#371,#377,#408,#410,#452,#471,#576,#718,#837,#853,#1049,#1124. No omissions.


## Data Types — text

_Covers how textual SQL types (`text`, `varchar`, `char(n)`, `citext`) are encoded as bind parameters and decoded into JS strings. A driver must treat text payloads as opaque byte-for-byte UTF-8 strings: no unescaping, no coercion, no padding loss, and no protocol corruption from special bytes._

### Byte-for-byte text fidelity (no driver-side escaping/unescaping)
**Why it matters / failure mode:** The driver must never reinterpret backslashes, `\n`, or other escape sequences in either parameters or results. Doing so silently corrupts stored/returned data. This is the dominant bug cluster here.
- **Test:** Insert a parameterized string literally containing a backslash followed by `n` (`"a\\nb"`, 4 chars) into a `TEXT` column, then `SELECT` it back; the returned string must equal the input exactly (4 chars, backslash preserved), with no conversion to a newline and no loss of the backslash. _(refs: node-postgres#895, node-postgres#1174)_
- **Test:** Insert a string containing an actual newline character (`"line1\nline2"` where `\n` is 0x0A) into a `TEXT` column and read it back; the result must contain a real 0x0A byte, not a literal two-char `\n` sequence. _(refs: node-postgres#905)_
- **Test:** Round-trip text containing C-style escape sequences (`\t`, `\\`, `\0`-free) and ensure the client receives the bytes exactly as stored, with no unintended unescaping by the driver. _(refs: node-postgres#461, node-postgres#1174)_
- **Test:** Round-trip a value with multiple consecutive backslashes (`"C:\\\\path"`) and assert every backslash survives. _(refs: node-postgres#1174)_

### NULL semantics vs strings
**Why it matters / failure mode:** SQL `NULL` and the empty/`'null'` string are distinct; conflating them breaks application logic.
- **Test:** `SELECT NULL::text` must yield JS `null`, never the 3-char string `"null"`. _(refs: node-postgres#17)_
- **Test:** `SELECT ''::text` must yield the empty string `""`, distinct from `null`; a column storing `''` must not read back as `null`, and vice versa. _(refs: node-postgres#263)_

### No implicit type coercion of textual values
**Why it matters / failure mode:** Text-family types (including `citext`) must decode to JS strings even when the content looks numeric; coercing to a JS number loses leading zeros/precision and changes type.
- **Test:** Round-trip a `citext` value of `'3'`; the result must be the string `"3"` (typeof `"string"`), not the number `3`. _(refs: node-postgres#876)_
- **Test:** `SELECT '007'::text` and `SELECT '3'::varchar` must both return strings preserving exact content, never coerced numerically. _(refs: node-postgres#876)_

### Blank-padded `char(n)` preserves trailing spaces
**Why it matters / failure mode:** Postgres blank-pads `char(n)`; the wire value includes trailing spaces and the driver must return them verbatim (matching `psql`), not trim them.
- **Test:** Insert `'ab'` into a `char(5)` column and `SELECT` it; the result must be the 5-char string `"ab   "` with the three trailing spaces intact. _(refs: node-postgres#1738)_

### NUL byte (0x00) handling — clear error, no protocol corruption
**Why it matters / failure mode:** Postgres forbids 0x00 in `text`. The driver must surface a clean error rather than emitting a malformed protocol message or crashing the connection. Both drivers historically mishandled this.
- **Test:** Binding a text parameter containing a NUL byte (0x00) must produce a clear, catchable error (Postgres "invalid byte sequence for encoding UTF8" / rejection), and must NOT silently truncate at the NUL. _(refs: node-postgres#2080)_
- **Test:** A query/string containing an embedded NUL (e.g. the `\^@` sequence) must not trigger an `08P01` "invalid message format" protocol error or desync the connection; the error must be reported on the failed query while the connection stays usable for subsequent queries. _(refs: node-postgres#2936)_

### Protocol robustness for text expressions (regression guards)
**Why it matters / failure mode:** Certain text-returning query shapes historically broke message framing, causing `ECONNRESET`/connection death rather than returning rows. Guard the framing logic.
- **Test:** A query mixing `concat(...)` with a `varchar`-cast column must return correct rows without `ECONNRESET`, and the result must be identical regardless of column/select-list order. _(refs: node-postgres#1524)_
- **Test:** Using a quoted identifier/type helper for a parenthesized type such as `bit(4)` in DDL must render the parentheses correctly (e.g. emit `bit(4)`), not mangle or strip the `(4)`. _(refs: postgres.js#1099)_

### ✅ Verification notes
Checked every test's expected behavior against PostgreSQL wire/SQL semantics and confirmed grounding against the cited issues (#263 and #2080 fetched directly).

- Expected behaviors are all correct:
  - Parameterized bind values are length-prefixed (not SQL literals), so backslash / `\n` round-trips (#895, #1174, #905, #461) are correctly expected to preserve bytes verbatim regardless of `standard_conforming_strings`.
  - `SELECT NULL::text` → JS `null` (#17), `''::text` → `""` distinct from null (#263) — correct; #263 is genuinely about the empty-string-vs-NULL distinction, so line 15 is well grounded.
  - `citext`/`text`/`varchar` numeric-looking values decode to strings (#876) — correct; citext has a dynamic OID and is returned as the raw string by default. Note the citext test requires the `citext` extension to be installed.
  - `char(5)` blank-padding returns trailing spaces over the wire (#1738) — correct, matches psql.
  - NUL-byte parameter error message "invalid byte sequence for encoding UTF8: 0x00" (#2080) — verified exact match; 0x00 is rejected by Postgres even though technically valid UTF-8. Note: 0x00 in a parameter is transmitted (length-prefixed) and rejected server-side; 0x00 in a simple-query string truncates/desyncs (#2936) — the section correctly separates these two cases.
  - concat + varchar-cast framing (#1524) and `bit(4)` identifier rendering (#1099) are correct regression guards.
- Grounding: all 12 cited refs map to a concrete test; no hallucinated claims.
- High-signal coverage (kind=bug AND testable=high): #17, #876, #895, #905, #1174 — all present. No omissions.

Verified: no corrections; coverage complete.


## Data Types — bytea

_Covers encoding/decoding of Postgres `bytea` (and `bytea[]`) values across the wire: sending Node binary types as parameters and parsing server output. This is binary-safety–critical — any lossy conversion (UTF-8 coercion, truncation at NUL, hex mis-decode) silently corrupts user data, so the driver must guarantee byte-for-byte fidelity._

### Buffer parameter round-trip (binary safety)

**Why it matters / failure mode:** The most common bytea bug is the driver stringifying a `Buffer` param as UTF-8 (or escaping it wrong), which truncates at NUL bytes, mangles high bytes, or corrupts backslashes. This breaks storing files, gzip blobs, encrypted data, etc. Both node-postgres and postgres.js have shipped regressions here.

- **Test:** Insert a `Buffer` param into a `bytea` column and `SELECT` it back; the returned value MUST be a `Buffer` byte-for-byte equal to the input (use a random ~64-byte buffer). _(refs: node-postgres#37, node-postgres#184, node-postgres#1353, node-postgres#1566, node-postgres#1690)_
- **Test:** Insert a `Buffer` containing one or more `0x00` (NUL) bytes (e.g. `Buffer.from([1,0,2,0,3])`); round-trip MUST preserve full length and bytes with no `invalid byte sequence for UTF8` error and no truncation at the first NUL. _(refs: node-postgres#980, node-postgres#1849, node-postgres#2557)_
- **Test:** Insert a `Buffer` containing a backslash byte `0x5C` (and a `\x`-looking sequence like `Buffer.from('\\x123f')`); it MUST store those literal bytes, not be interpreted as a bytea escape, and round-trip unchanged with no `invalid input syntax for type bytea` error. _(refs: node-postgres#855)_
- **Test:** Insert a large binary `Buffer` (e.g. 80 KB gzip output / random ≥80 000 bytes) into `bytea`; it MUST insert without a length/`varchar`/type error and `SELECT` returns the identical bytes (verify length and a hash). _(refs: node-postgres#1166, node-postgres#3527)_
- **Test:** Insert the same payload twice — once as a `Buffer` param and once as a `'\x...'` hex-escaped string literal — into separate rows; both stored `bytea` values MUST be byte-identical. _(refs: node-postgres#1958, postgres.js#340)_

### bytea output decoding (hex format)

**Why it matters / failure mode:** Modern Postgres (`bytea_output = hex`, default since 9.0) returns `\x`-prefixed hex. A driver that mis-parses hex, falls back to legacy escape decoding, or leaves the raw `\x...` string produces wrong bytes. Concatenation into text/JSON also exposed double-escaping bugs.

- **Test:** A `bytea` value selected with default `bytea_output = hex` MUST decode the `\x`-prefixed hex into the correct binary `Buffer` (verify a known value, e.g. `\xdeadbeef` → `Buffer.from([0xde,0xad,0xbe,0xef])`). _(refs: node-postgres#161)_
- **Test:** Decoding MUST be consistent across binary and text result formats / JS and native bindings — the same `bytea` value yields the identical `Buffer` regardless of binding. _(refs: node-postgres#184)_
- **Test:** When a `bytea`/domain value is cast/concatenated to text (e.g. returned inside a JSON or text column), the driver MUST surface the readable text form and not a leftover doubly-escaped `\x` hex string. _(refs: node-postgres#1356)_

### bytea[] (array of bytea)

**Why it matters / failure mode:** Array parsing/serialization is a separate code path; bytea elements need per-element hex decode, and NULL elements break naive parsers. Sending a JS array of Buffers must serialize to `bytea[]`.

- **Test:** `SELECT` a `bytea[]` column whose elements include `NULL` (e.g. `'{"\\xdeadbeef", NULL, "\\x00"}'`); the driver MUST parse it into a JS array of `Buffer`/`null` with correct bytes and not throw. _(refs: node-postgres#886)_
- **Test:** Passing a JS array of `Buffer`s as a single `bytea[]` parameter MUST serialize and insert/update without a type-mismatch error, and round-trip element-for-element. _(refs: postgres.js#527)_

### Accepted JS input types for bytea params

**Why it matters / failure mode:** Users pass not just `Buffer` but `Uint8Array`, other TypedArray views, and `ArrayBuffer`. The driver should encode all of these as binary bytea rather than stringifying or rejecting them.

- **Test:** A `Uint8Array` passed as a `bytea` param MUST be encoded as binary bytea (not text/varchar) and round-trip to the same bytes. _(refs: node-postgres#1166)_
- **Test:** A raw `ArrayBuffer` passed as a param MUST be coerced via `Buffer.from(...)` and encoded as bytea exactly like a TypedArray view (round-trip identical bytes). _(refs: node-postgres#3323)_
- **Test:** A TypedArray view with a non-zero `byteOffset`/partial `byteLength` MUST encode only the view's bytes, not the whole underlying buffer. _(refs: node-postgres#3323, node-postgres#980)_

### Implementation hygiene / regression guards

**Why it matters / failure mode:** Past parsers used the deprecated `Buffer()` constructor (security/deprecation warning) and native bindings diverged from JS behavior. These are footguns a new driver must not reintroduce.

- **Test:** bytea parsing MUST allocate via `Buffer.alloc`/`Buffer.from` and emit no `DeprecationWarning: Buffer() is deprecated` (run with `--throw-deprecation` and assert no throw). _(refs: node-postgres#2426)_
- **Test:** Equivalence guard — for an identical payload, the JS path and any native/alternate path MUST produce identical stored and retrieved bytes (no native-only mangling). _(refs: node-postgres#184, node-postgres#807, node-postgres#3527)_

### ✅ Verification notes

**Correction — line 21 (#1356) expectation is misleading.** For a genuine `bytea` value cast/concatenated to `text` (`bytea::text` or `'x'||col::text`), PostgreSQL's *correct* and canonical text output IS the `\x`-prefixed hex string (under default `bytea_output = hex`). The driver must NOT "decode it to a readable text form" — there is no other readable form; the bytes are opaque. The only real defect #1356 guards against is **double-escaping** (the value coming back as `\\x...` with a doubled backslash). Reword the test to assert: a `bytea`-derived `text` value is surfaced exactly as Postgres emits it (single-escaped `\x...`), with no extra driver-side backslash doubling — drop the "readable text form / decode" framing, which is wrong per spec.

**Minor — grounding note, line 36.** The non-zero `byteOffset`/partial `byteLength` view test is a correct and valuable expectation (Node/PG semantics: only the view window must be encoded), but it is an extrapolation — neither #3323 (ArrayBuffer) nor #980 (zero bytes) actually concerns `byteOffset`. Keep the test, but treat the refs as illustrative rather than the literal source.

**Minor — grounding note, line 11.** #807 ("Buffer not cast to UTF-8 string") is the canonical source for the Buffer-param round-trip, yet it is only cited in the hygiene equivalence guard (line 43). Consider adding #807 to the line 9 round-trip refs. Not a correctness issue.

Coverage of high-signal (kind=bug/regression AND testable=high) records is complete: #161, #184, #807, #855, #886, #980, #1166, #1690, #1849, #3323, #3527, postgres.js#527 are all tested. Only #321 (large objects / lo stream) is untested, but it is kind=feature/testable=low — not high-signal, and out of core bytea scope.


## Data Types — uuid

_Covers how the driver decodes Postgres `uuid` values into JS, how it encodes JS values into the `uuid` wire/text form, and how invalid uuid inputs surface as errors. UUIDs are a high-traffic key type, so round-trip fidelity, custom parser overrides, and clean error semantics on empty/invalid input directly affect correctness._

### Default decode and encode round-trip
**Why it matters / failure mode:** A driver must return `uuid` columns in a stable, canonical form and accept JS strings back without mangling, or primary-key/foreign-key logic silently breaks.
- **Test:** `SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid AS id` returns the string `'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'` (canonical lowercase, hyphenated 8-4-4-4-12). _(refs: node-postgres#1726)_
- **Test:** Round-trip a parameterized uuid: `SELECT $1::uuid` with `'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11'` (uppercase) returns the canonical lowercase `'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'`, since Postgres normalizes uuid output. _(refs: node-postgres#1726)_
- **Test:** A `uuid[]` array column decodes to a JS array of canonical uuid strings, e.g. `SELECT ARRAY['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','b1ffc011-...']::uuid[]` yields a 2-element array of strings. _(refs: node-postgres#1726)_

### Custom type parser override for the uuid OID
**Why it matters / failure mode:** Users need to override decoding of the uuid OID (2950) to return alternative representations (e.g. a 16-byte `Buffer`) without affecting other types; a driver that hard-codes string decoding blocks this.
- **Test:** Registering a custom type parser for uuid OID `2950` that maps the canonical string to a 16-byte `Buffer` causes `SELECT '...'::uuid` to return a `Buffer` of length 16 whose bytes equal the hex of the uuid (hyphens stripped). _(refs: node-postgres#1726)_
- **Test:** The custom uuid parser is scoped to OID 2950 only: other types (`text`, `int4`) decode normally in the same query/result. _(refs: node-postgres#1726)_
- **Test:** The custom parser applies to both scalar and array (`uuid[]`, OID 2951) results, with each element passed through the parser. _(refs: node-postgres#1726)_
- **Test:** With no custom parser registered, the default decode remains a canonical string (override is opt-in, not default). _(refs: node-postgres#1726)_

### Invalid / empty-string uuid input errors
**Why it matters / failure mode:** Passing `''` (or other malformed text) as a uuid parameter is a common footgun — apps send empty form fields expecting NULL. Postgres rejects it; the driver must surface the real server error, not swallow or misreport it. Affects both node-postgres and postgres.js users (strong signal).
- **Test:** `SELECT $1::uuid` with parameter `''` (empty string) rejects with a Postgres error whose message is `invalid input syntax for type uuid: ""` and SQLSTATE `22P02` (invalid_text_representation). The driver must propagate this error, not coerce `''` to NULL. _(refs: node-postgres#2738)_
- **Test:** `SELECT $1::uuid` with a malformed string such as `'not-a-uuid'` rejects with SQLSTATE `22P02` and message `invalid input syntax for type uuid: "not-a-uuid"`. _(refs: node-postgres#2738)_
- **Test:** `SELECT $1::uuid` with JS `null` returns SQL `NULL` (no error) — confirming that NULL, not `''`, is the correct way to represent absent uuid values. _(refs: node-postgres#2738)_
- **Test:** A uuid with wrong segment lengths or invalid hex (e.g. `'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a1'`, one digit short) rejects with SQLSTATE `22P02`. _(refs: node-postgres#2738)_
- **Test:** A uuid in braced form `'{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}'` is accepted by Postgres and round-trips to the canonical unbraced form, confirming the driver does not pre-validate/reject syntactically-valid alternate forms before sending. _(refs: node-postgres#2738, node-postgres#1726)_

### ✅ Verification notes
Verified: no corrections; coverage complete.

- All expected behaviors match PostgreSQL semantics: uuid output is always canonical lowercase 8-4-4-4-12 (uppercase input normalized), uuid OID=2950 / uuid[] OID=2951 are correct, braced-form `{...}` input is an accepted PG alternate form that round-trips unbraced, and invalid/empty text raises `invalid input syntax for type uuid: "..."` with SQLSTATE 22P02 (invalid_text_representation). The null-param → SQL NULL expectation is correct.
- Every test traces to a cited issue: #1726 (custom uuid-OID parser returning a Buffer; default string decode foundation) and #2738 (empty-string / malformed uuid rejected, NULL is the correct sentinel). No hallucinated expectations found.
- Omitted high-signal tests: none. Both source records are kind="question" (not bug/regression), so there are no kind=bug/regression + testable=high refs to add.


## Data Types — geometric

_Covers PostgreSQL's built-in geometric types (point, line, lseg, box, path, polygon, circle), their arrays, and PostGIS geometry/geography columns. A driver must bind these as parameters in the exact text-literal format Postgres expects, expose type OIDs for identification, and decide whether to parse outputs into structured JS values or leave them as raw strings — getting any of these wrong yields "invalid input syntax" errors or silently corrupted geometry._

### Parameter binding of geometric values (input encoding)
**Why it matters / failure mode:** The most common failure is passing a JS value (object, malformed string, or wrong literal) as a parameter for a geometric column. Postgres parses parameter text strictly, so a value not matching the type's input syntax raises `invalid input syntax for type <type>` (SQLSTATE 22P02). Both node-postgres and postgres.js users repeatedly hit this — a strong signal the driver needs first-class encoders or clear contracts.
- **Test:** Insert into a `point` column with parameter `$1` bound to the literal `'(1,2)'` (or an explicit `$1::point`); expect success and the stored value to round-trip as `(1,2)`. Binding a non-literal like a plain JS object/array that does not serialize to `(x,y)` must produce error SQLSTATE 22P02 `invalid input syntax for type point`. _(refs: node-postgres#1411, node-postgres#1703)_
- **Test:** `SELECT $1::box` with `$1 = '(2,2),(0,0)'` must bind in valid box text format and round-trip; querying `WHERE col <@ $1::box` must return rows whose box is contained, proving the bound literal is geometrically correct (not just string-equal). _(refs: node-postgres#2073)_
- **Test:** A `polygon` parameter bound to `'((0,0),(1,0),(1,1),(0,1))'` must insert without error; a malformed polygon literal must raise 22P02 `invalid input syntax for type polygon`. _(refs: node-postgres#1703)_

### Geometric arrays as parameters
**Why it matters / failure mode:** Array-of-geometric parameters compound the encoding problem: each element must be quoted/escaped correctly inside the Postgres array literal, and the cast must apply. A naive driver corrupts the inner `()`/`<>` delimiters.
- **Test:** `SELECT $1::circle[]` with `$1` bound to an array of two circles (e.g. `['<(0,0),1>','<(5,5),2>']`) must round-trip without syntax error, returning two circle values equal to the inputs. _(refs: node-postgres#2594)_

### Output decoding / parsing of geometric results
**Why it matters / failure mode:** Drivers disagree on whether geometric columns come back as raw strings or structured JS objects. postgres.js historically returned raw strings (feature request to parse them); a new driver must define and test a deterministic, documented representation so consumers can rely on it.
- **Test:** Selecting a `point` value `(1,2)` returns a deterministic structured representation (e.g. `{ x: 1, y: 2 }`) — or, if the driver contracts raw text, exactly the string `(1,2)` — and the same chosen representation is symmetric with what the input encoder accepts (round-trip identity). _(refs: postgres.js#759)_
- **Test:** `box`, `circle`, `lseg`, and `polygon` outputs each decode to a stable, documented shape consistent with point decoding; assert parsed numeric components match the source literal. _(refs: postgres.js#759)_

### Type OID exposure for geometry/WKB identification
**Why it matters / failure mode:** To distinguish a geometry/WKB column from plain text, consumers need the column's type OID from the row description. If the driver hides field descriptors, PostGIS users cannot route decoding.
- **Test:** After a query selecting a geometric or PostGIS geometry column, the result's field/column descriptors expose the column `dataTypeID` (type OID); assert it equals the OID Postgres reports for that type (e.g. `point` = 600), allowing geometry identification. _(refs: node-postgres#3153, node-postgres#1514)_

### PostGIS geometry / geography columns
**Why it matters / failure mode:** PostGIS types are not core Postgres types (dynamic OIDs), and their text I/O is WKB hex by default. Users want to (a) insert via parameterized constructors without "invalid geometry", and (b) read the raw WKB hex rather than auto-converted GeoJSON. The driver must not silently transform these.
- **Test:** Insert into a `geography(Point)` column using parameterized input that constructs the point (e.g. `ST_SetSRID(ST_MakePoint($1,$2),4326)` with numeric params, or a well-formed WKT/EWKT text param cast to geography); expect success with no `invalid geometry` / `parse error` (SQLSTATE 22023/XX000). _(refs: postgres.js#503)_
- **Test:** Selecting a PostGIS `geometry` column with no client-side casting returns the raw stored WKB hex string exactly (e.g. `0101000000...`), not an auto-converted GeoJSON object, unless the query explicitly requests `ST_AsGeoJSON`. _(refs: node-postgres#1514)_

### ✅ Verification notes
- Expectations are substantially correct. Verified OIDs/literals: `point`=600 (correct); box/circle/lseg/polygon literal forms and the `<@` containment test are valid. The box test wisely uses an already-normalized literal `(2,2),(0,0)` (Postgres reorders box corners to upper-right-first on output), and proves geometric correctness via `<@` rather than string equality — good, avoids the normalization pitfall.
- MINOR (line 26, PostGIS geography insert): the cited SQLSTATEs are imprecise. PostGIS malformed-geometry / WKT parse errors are raised by the C extension and surface as `XX000` (internal_error), not `22023` (invalid_parameter_value). The hedge "22023/XX000" is acceptable but `XX000` is the realistic code; assertions should not hard-pin `22023`.
- MINOR (line 7, negative case): "binding a plain JS object/array must produce 22P02" is a driver-contract assumption, not a Postgres guarantee — it only holds if the new driver has no point/object encoder and stringifies into something Postgres rejects. Frame this as testing the driver's chosen contract, not universal behavior.
- Grounding: all 8 refs are represented (1411/1703→line 7/9; 2073→line 8; 2594→line 13; 759→lines 17-18; 3153→line 22; 1514→lines 22/27; 503→line 26). No hallucinated cases.
- Omissions: none. All source records are kind=question/feature; there are zero kind=bug/regression+testable=high records, so no high-signal tests are missing.


## Data Types — range

_Covers binding and serializing PostgreSQL range types (`tsrange`, `tstzrange`, `daterange`, `int4range`, etc.) as query parameters, and the interaction between JS scalar params (notably `Date`) and range operators like `@>`. A driver must distinguish a *scalar bound* from a *range value* when inferring the wire type, or queries silently fail with "malformed range literal" or bind to the wrong type._

### Scalar param vs. range param type inference with range operators
**Why it matters / failure mode:** When a JS scalar (e.g. a `Date`) is passed to a range operator such as `@>` (`range @> element`), the driver must serialize it as the *element* type (a `timestamptz`/`date` scalar, with the appropriate cast), NOT as a range literal. node-postgres serializes a `Date` in a way that PostgreSQL tries to coerce to the range type, producing `ERROR: malformed range literal`. This is the classic footgun: the parameter's JS shape (a single Date) does not imply its SQL target type, and the operator's left operand type forces an ambiguous inference.
- **Test:** `SELECT $1::tstzrange @> $2` (or `WHERE col @> $2`) with `$2` = a JS `Date` must bind `$2` as a `timestamptz`/`timestamp` scalar and evaluate the containment, returning `true`/`false` — it must NOT raise `22P02 invalid_text_representation` / "malformed range literal" by trying to parse the Date as a range. _(refs: node-postgres#2219)_
- **Test:** `SELECT daterange('2020-01-01','2020-12-31') @> $1::date` with `$1` = a JS `Date` returns `true` when the date falls inside the range and `false` otherwise; the param is sent as a `date` scalar, never as a range literal. _(refs: node-postgres#2219)_
- **Test:** Containment is correct at inclusive lower / exclusive upper boundaries: for `'[2020-01-01,2020-12-31)'::daterange @> $1`, `$1 = 2020-01-01` → `true`, `$1 = 2020-12-31` → `false` (matching PostgreSQL's default `[lower, upper)` semantics). _(refs: node-postgres#2219)_
- **Test:** An explicit cast on the parameter (`$1::timestamptz`) must take precedence over any heuristic the driver applies for range operators, so the user can always disambiguate manually. _(refs: node-postgres#2219)_

### Binding range literals as parameters to functions / typed columns
**Why it matters / failure mode:** A range value supplied as a string literal (e.g. `'[2020-01-01 00:00, 2020-02-01 00:00)'`) must bind to a parameter/column/function argument declared as a range type. If the driver sends it untyped or as plain `text`, PostgreSQL may fail to coerce it to the function's expected `tsrange`/`tstzrange` argument, or the call resolves to the wrong overload.
- **Test:** Calling a PL/pgSQL function `f(r tsrange)` via `SELECT f($1)` with `$1` = a `tsrange` text literal binds successfully and the function receives the parsed range (verify by returning `lower($1)` / `upper($1)` and asserting the bounds). Add an explicit cast path `SELECT f($1::tsrange)` and assert it also succeeds. _(refs: postgres.js#319)_
- **Test:** Round-trip a `tsrange` literal: `SELECT $1::tsrange` returns a value whose `lower`, `upper`, `lower_inc`, and `upper_inc` match the input bounds and inclusivity exactly (e.g. `'[a,b)'` → `lower_inc=true`, `upper_inc=false`). _(refs: postgres.js#319)_
- **Test:** An empty range literal `'empty'::tsrange` and an unbounded range (`'[2020-01-01,)'::tsrange`, infinite upper bound) bind and round-trip without error, preserving emptiness / unbounded ends (`isempty($1)` = `true`; `upper_inf($1)` = `true`). _(refs: postgres.js#319)_

### ✅ Verification notes
**Correction — Test 3 (line 9):** The expectation `'[2020-01-01,2020-12-31)'::daterange @> $1` with `$1` = a JS `Date` (no cast) → `true`/`false` is unreliable and likely wrong. A JS `Date` serializes to `timestamp(tz)`, but `daterange`'s element type is `date`. PostgreSQL has no `daterange @> timestamptz` (nor `@> timestamp`) operator, and the `timestamptz → date` cast is assignment-only (`pg_cast` context `'a'`), so it is NOT applied during operator resolution. If instead the param is sent untyped, resolution is ambiguous between `daterange @> daterange` and `daterange @> date`, collapsing to the same "malformed range literal" failure this section warns about. Fix: require an explicit `$1::date` cast on the boundary test (as Test 2 on line 8 already does correctly).

**Note — Test 1 (line 7):** Expectation is defensible only because a JS `Date` naturally types as `timestamptz`, which exactly matches `tstzrange @> timestamptz`. Worth stating explicitly that this hinges on the driver sending Date params with a concrete type OID (or an explicit `$2::timestamptz`); an untyped Date reproduces the #2219 ambiguity. This generalizes: per-element-type the cast must match the *range's element type*, which differs across `daterange`(date) vs `tstzrange`(timestamptz).

**Grounding:** All tests trace to the cited refs (#2219 for section 1, #319 for section 2); none hallucinated. Section-2 wording "lower($1)/upper($1)" should read lower(r)/upper(r) of the function arg, but this is cosmetic, not a semantic error.

**Omitted high-signal tests:** None. Only #2219 qualifies as high-signal (bug AND testable=high) and it is covered; #319 is kind=question (not required). Coverage of high-signal issues is complete.


## Data Types — enum

_Covers how the driver encodes/decodes PostgreSQL `ENUM` types (a user-defined text-like type) on both the input (parameter binding) and output (row parsing) paths, including arrays of enums. Enums arrive over the wire as their textual label, so the driver must treat them as text without mangling, and must round-trip arrays of them through the array codec._

### Enum scalar round-trip
**Why it matters / failure mode:** An enum value is transmitted as its label string. A driver that has no OID-specific handling must fall back to passing the text through unchanged on both encode and decode; corrupting/quoting it breaks inserts and reads.
- **Test:** Given `CREATE TYPE mood AS ENUM ('sad','ok','happy')` and a table `t(m mood)`, inserting a parameterized value `'happy'` then selecting it returns the JS string `'happy'` (exact, no quotes/whitespace). _(refs: postgres.js#197)_
- **Test:** Selecting a literal `'sad'::mood` returns the JS string `'sad'`; an unknown OID enum must default to text decoding rather than throwing. _(refs: postgres.js#197)_

### Array-of-enum round-trip via parameterized insert
**Why it matters / failure mode:** This is the direct ask of postgres.js#197 — building an `enum[]` value from a JS array of strings through the dynamic/parameterized insert helper. The array codec must quote each label per PostgreSQL array literal rules and bind against the correct `enum[]` column type; getting the element type wrong yields `malformed array literal` or `column is of type mood[] but expression is of type text[]`.
- **Test:** Given `t(arr mood[])`, inserting a JS array `['happy','sad']` as a single parameter produces a row whose `arr` selects back as the JS array `['happy','sad']` (order preserved, exact labels). _(refs: postgres.js#197)_
- **Test:** Inserting an empty JS array `[]` into a `mood[]` column round-trips to an empty array `[]` (not `null`, not `['']`). _(refs: postgres.js#197)_
- **Test:** A `mood[]` column value containing `NULL` elements, e.g. `['happy', null]`, round-trips with the JS `null` preserved at the right index (PG array `{happy,NULL}`). _(refs: postgres.js#197)_
- **Test:** Reading a server-side-constructed `ARRAY['ok','happy']::mood[]` returns the JS array `['ok','happy']`, confirming the array decoder is keyed off the array OID / element enum OID and not a hardcoded text-array assumption. _(refs: postgres.js#197)_

### Label escaping / encoding edge cases
**Why it matters / failure mode:** Enum labels are arbitrary text and may contain characters that collide with PostgreSQL array-literal syntax (commas, braces, quotes, backslashes, spaces). The array encoder must quote/escape each element; a naive comma-join corrupts such labels. (Footgun observed across drivers that special-case arrays.)
- **Test:** Given an enum type including a label with a comma/space such as `'very happy'` and `'a,b'`, inserting `['very happy','a,b']` into a `mood[]` column round-trips exactly, with the driver emitting properly quoted array elements. _(refs: postgres.js#197)_
- **Test:** Single enum scalar bind of a label is sent as a plain string parameter (no array quoting applied), distinguishing scalar enum binding from array-element quoting. _(refs: postgres.js#197)_

### ✅ Verification notes
All EXPECTED behaviors are correct per PostgreSQL semantics:
- Enum scalar returns the exact label (enums are not blank-padded like `char(n)`); param sent as text/unknown and coerced to the enum type; unknown dynamic enum OID correctly falls back to text decode. ✔
- `{}` is an empty array distinct from NULL; `['happy', null]` → `{happy,NULL}` (unquoted NULL keyword, distinct from quoted `"NULL"` and from `''` → `""`); order preserved. ✔
- Labels with commas/spaces (`'very happy'`, `'a,b'`) are valid enum labels and must be double-quoted in the array literal (`{"very happy","a,b"}`). ✔

Advisory caveats (non-blocking, not corrections):
- Scalar round-trip tests (Enum scalar section) are foundational but only loosely grounded in #197, which is specifically about an enum **array** via the dynamic insert helper. Keep as preconditions, not as the core of #197.
- The decode test for a server-side `ARRAY['ok','happy']::mood[]` is semantically correct in its expected result, but achieving it requires the driver to resolve that the *dynamic* enum-array OID is an array type (it won't be in any hardcoded array-type map). Worth an explicit assertion that type introspection / array-OID resolution is exercised, otherwise the driver may return the raw `{ok,happy}` string.

Omissions: the sole record #197 is `kind=question` (not bug/regression), so it does not meet the bug/regression+testable=high must-cover bar; it is nonetheless fully covered. No high-signal refs omitted.

Verified: no corrections; coverage complete.


## Data Types — composite

_Covers PostgreSQL composite/record types (named row types, anonymous `RECORD`, row expressions, and `SETOF RECORD`) in both directions: decoding wire values into structured JS objects and encoding JS objects/arrays into valid record literals for parameter binding. This matters because Postgres ships composites as a single text column using a quoting/escaping grammar (`(a,b)`), so a naive driver leaks raw strings to users or mis-binds parameters._

### Decoding scalar composite/record values into structured objects
**Why it matters / failure mode:** The most common complaint across BOTH drivers — a composite column arrives as a raw text literal like `(1,foo)` instead of `{ id: 1, name: 'foo' }`. Without OID-driven attribute parsing the driver returns useless strings.
- **Test:** Given `CREATE TYPE complex AS (r float8, i float8)` and `SELECT ROW(1,2)::complex AS c`, the value must decode to a structured object `{ r: 1, i: 2 }` (numeric fields coerced via their element type parsers), not the string `'(1,2)'`. _(refs: node-postgres#1127, node-postgres#419)_
- **Test:** A stored function returning a composite/`SETOF RECORD` (`SELECT * FROM my_func()`) must populate each declared field as a defined row value; no field may come back `undefined`. _(refs: node-postgres#525, node-postgres#587)_
- **Test:** A composite returned from a PL/pgSQL function or subquery (`SELECT (SELECT ROW(...))`) decodes to a nested object rather than a record string literal. _(refs: node-postgres#1801, node-postgres#2979)_
- **Test:** Element-type parsing must recurse: a composite whose fields are `int`, `timestamptz`, and `bool` decodes those fields using the same type parsers as top-level columns (e.g. boolean field → JS `true`, not `'t'`). _(refs: node-postgres#1127, node-postgres#419)_

### The row-expression footgun: `SELECT (a, b)` collapses columns into one composite
**Why it matters / failure mode:** A parenthesized column list `(A, B)` is a single anonymous-record column, NOT two columns. Users expect two parsed fields and instead get one raw `(...)` string. This regressed visibly on Postgres 17.5 — a strong cross-version guard.
- **Test:** `SELECT (a, b) FROM t` returns exactly ONE column of type `record`; the driver must surface it as a single composite value parsed to `{ f1: a, f2: b }` (anonymous fields), while `SELECT a, b FROM t` returns TWO separate columns. The two queries must NOT be conflated. _(refs: node-postgres#3529, node-postgres#1652)_
- **Test (regression guard):** Selecting a row of multiple `json`/`jsonb` columns as `(jsonA, jsonB)` yields one composite literal containing embedded, double-quoted JSON; selecting the columns separately yields two fully-parsed JSON objects. Assert the embedded-JSON unescaping is correct (inner quotes are `""`-doubled inside the record literal). _(refs: node-postgres#1652)_
- **Test (cross-version):** Run the `(uuid, name)` row-expression case against PG ≤16 and PG ≥17.5 and assert identical structured output, guarding against the 17.5 wire/representation change that broke `result.rows`. _(refs: node-postgres#3529)_

### Record-literal escaping/quoting grammar (decode correctness)
**Why it matters / failure mode:** The composite text format has specific rules: fields separated by `,`, NULL = empty unquoted, and any field containing `,`, `(`, `)`, `"`, `\`, or whitespace is double-quoted with `"`→`""` and `\`→`\\`. A parser that splits naively on commas corrupts data.
- **Test:** Decode `("a,b","he said ""hi""",,42)` → `['a,b', 'he said "hi"', null, '42']` (third field is SQL NULL → JS `null`; empty-but-quoted `""` would instead be the empty string). _(refs: node-postgres#1127, node-postgres#587)_
- **Test:** A composite field that is itself an array or nested composite must be unescaped one level before being handed to the element parser (nested quoting/backslashes resolved correctly). _(refs: node-postgres#1487, node-postgres#1801)_

### Arrays of composites and `array_agg`
**Why it matters / failure mode:** `array_agg(rowtype)` produces `{"(...)","(...)"}` — array-of-record nesting. Users on both drivers reported getting one opaque string instead of an array of objects.
- **Test:** `SELECT array_agg(t)::complex[] FROM t` decodes to a JS array of structured objects, each field type-parsed — not a single string and not an array of raw `(...)` strings. _(refs: node-postgres#1487)_
- **Test:** Passing a JS array of composite values as a single array parameter binds successfully and the function executes (array-of-composite encode path). _(refs: node-postgres#2593)_

### Encoding JS values into composite parameters (input binding)
**Why it matters / failure mode:** Round-tripping requires the inverse: a JS object/array bound to a composite-typed parameter must serialize to a valid record literal with correct quoting, or the INSERT/function call fails or silently mis-binds.
- **Test:** Binding `{ r: 1, i: 2 }` (or `[1, 2]`) to a `complex`-typed parameter produces the literal `(1,2)` and inserts a row whose stored value reads back as `{ r: 1, i: 2 }` (full round-trip). _(refs: node-postgres#1469, node-postgres#2391)_
- **Test:** Encoding must apply record quoting rules in reverse: a string field containing a comma or quote (e.g. `'a,b'`) serializes to `("a,b")`, a JS `null` field serializes to an empty (unquoted) slot, and the value round-trips unchanged. _(refs: node-postgres#1469, node-postgres#755)_
- **Test:** A composite value passed as an argument to a stored function round-trips correctly (encode → call → decode equals original). _(refs: node-postgres#755, node-postgres#2391)_

### Custom-type registration and range types
**Why it matters / failure mode:** Composites and ranges are user/extension-defined, so the driver needs a registration hook keyed on type name/OID; otherwise every project re-implements parsing.
- **Test:** Registering a custom handler for a named composite type makes both decode and encode use it, and the value round-trips. _(refs: postgres.js#68, node-postgres#419)_
- **Test:** A range type (e.g. `int4range`, `tstzrange`) round-trips via a registered handler, decoding bounds and inclusivity (`[1,10)` → lower=1 inclusive, upper=10 exclusive) and re-encoding to the same literal. _(refs: postgres.js#68)_

### ✅ Verification notes
**Corrections (1):**
- Lines 13 & 16 — The "Postgres 17.5 regressed visibly / 17.5 wire/representation change that broke `result.rows`" claim is **unsupported and misleading**. The source record for #3529 (kind=question) carries no version detail, and PostgreSQL did not change the text wire representation of `record`/composite types in 17.5. `SELECT (a,b)` collapsing into a single anonymous `record` column with fields `f1,f2` has been the stable behavior across all modern PG versions. Keep the row-expression footgun test itself (it is correct PG semantics: parenthesized multi-element list = one `record` column, vs. `SELECT a,b` = two columns), but drop the fabricated "17.5 regression / cross-version 17.5 guard" framing. A generic cross-version test is fine; tying it to a non-existent 17.5 change is not.

**Spot-checks that PASS (PG semantics correct):**
- Record-literal decode `("a,b","he said ""hi""",,42)` → `['a,b','he said "hi"',null,'42']` is correct: empty unquoted slot = SQL NULL → `null`; `""`-doubling is the right un-escape rule.
- Quoting rules (quote when field contains `,` `(` `)` `"` `\` or whitespace, or is empty/`NULL`; `"`→`""`, `\`→`\\`) match the composite I/O grammar (PG §8.16.6).
- Range round-trip `[1,10)` → lower=1 inclusive / upper=10 exclusive is correct.
- Anonymous-record field naming `f1,f2,...` and `{ r, i }` decode for `ROW(1,2)::complex` are correct.
- Note: native composite/record parsing is NOT built into node-postgres by default (records arrive as raw strings); these "must decode to object" expectations are aspirational targets for the new driver, which is the appropriate framing for a test suite — flagged only for awareness, not a correction.

**Omitted high-signal tests:** none. The only bug+high records (#525, #1652) are both covered. All 14 source records are grounded; no refs hallucinated.


## Data Types — domain

_Covers PostgreSQL DOMAIN types (named constraints/aliases over a base type). A driver must treat a domain as its underlying base type for parameter serialization, result decoding, and custom-parser dispatch — getting this wrong breaks round-trips for arrays, composites, and user-registered type parsers._

### Domain DDL and basic round-trip
**Why it matters / failure mode:** A column declared with a domain type reports the domain's OID, not the base type's OID. Drivers that only know base-type OIDs may fall back to a generic/anonymous decode path and emit "input of anonymous composite types is not implemented" or return raw text instead of the parsed value.
- **Test:** `CREATE DOMAIN posint AS integer CHECK (VALUE > 0)`, then `CREATE TABLE t (id posint)`, `INSERT INTO t VALUES (5)`, `SELECT id FROM t` — query succeeds and `id` decodes to the JS number `5` (decoded as the underlying `integer`, not as text or an anonymous type). No "input of anonymous composite types is not implemented" error. _(refs: node-postgres#2696)_
- **Test:** `CREATE DOMAIN email AS text`, insert `'a@b.com'`, `SELECT` returns the JS string `'a@b.com'` decoded via the base `text` decoder. _(refs: node-postgres#2696)_
- **Test:** Domain CHECK constraint is enforced server-side: inserting `-1` into a `posint` column rejects with a `check_violation` (SQLSTATE `23514`) surfaced as a normal query error, not a driver crash. _(refs: node-postgres#2696)_

### Parameter serialization for domains over array/text[] types
**Why it matters / failure mode:** When binding a JS array to a parameter, the driver picks its serialization (array literal `{...}` vs. plain text) based on the column/parameter type. A domain over `text[]` is not literally `text[]`, so naive drivers serialize the array as a plain string and the server rejects it with "malformed array literal". This is the highest-signal bug in this bucket (testable=high, kind=bug).
- **Test:** `CREATE DOMAIN strarr AS text[]`, `CREATE TABLE t (tags strarr)`. Binding a JS array `['a','b','c']` as the parameter for `tags` must serialize to a valid array literal (`{a,b,c}`) so the INSERT succeeds and `SELECT tags FROM t` returns `['a','b','c']`. Expected PG behavior: a domain over `text[]` accepts the same array literal input as `text[]`. It must NOT fail with `malformed array literal` (SQLSTATE `22P02`). _(refs: postgres.js#592)_
- **Test:** Array with quoting-sensitive elements (`['hello world', 'a,b', '', 'has"quote', null]`) bound to a `strarr` (domain over `text[]`) round-trips correctly: empty string, embedded comma, embedded quote, and SQL `NULL` element are each preserved on read-back. _(refs: postgres.js#592)_
- **Test:** Domain over a numeric array, e.g. `CREATE DOMAIN intarr AS int[]`, binding `[1,2,3]` inserts and reads back `[1,2,3]` as JS numbers — confirms the array-literal path keys off the domain's base type, not the domain OID. _(refs: postgres.js#592)_

### Custom type parsers keyed on a domain OID
**Why it matters / failure mode:** Drivers let users register a decoder by type OID. The wire protocol reports the DOMAIN's OID for such columns, so a parser registered for the base type's OID is never triggered, and conversely a user must be able to register against the domain's own OID. The driver should also be able to resolve a domain to its base type to choose a default parser.
- **Test:** Look up the OID of a user `CREATE DOMAIN mydom AS text` (via `pg_type`), register a custom parser for that OID that uppercases the value; `SELECT col::mydom` (or a column of type `mydom`) invokes the parser, returning the transformed value. Expected: the parser registered against the domain's OID is invoked for domain-typed result columns. _(refs: postgres.js#719)_
- **Test:** With NO custom parser registered, a `mydom` (domain over `text`) column still decodes via the base `text` default parser (driver resolves domain→base type), returning a plain string rather than undefined/raw bytes. _(refs: postgres.js#719, node-postgres#2696)_
- **Test:** A custom parser registered only for the base type OID (e.g. `text`/25) does NOT fire for a domain column over text unless the driver explicitly resolves domains to their base — document/assert the chosen behavior so dispatch is deterministic. _(refs: postgres.js#719)_

### Cross-driver footguns to guard against
**Why it matters / failure mode:** Both postgres.js and node-postgres show the same root cause — domain OIDs are not transparently resolved to their base type — manifesting as serialization failures (postgres.js#592), missing custom-parser dispatch (postgres.js#719), and anonymous-composite/decode confusion (node-postgres#2696). A new driver should centralize "resolve domain OID → base type OID (recursively)" and use it for BOTH the encode and decode paths.
- **Test:** Domain over a domain (`CREATE DOMAIN a AS int; CREATE DOMAIN b AS a;`) resolves transitively to `integer`; binding and decoding a `b` column behaves identically to `integer`. _(refs: postgres.js#592, postgres.js#719)_
- **Test:** Domain over a composite/row type returns a parsed row object (or the driver's documented composite representation), never the bare "input of anonymous composite types is not implemented" error. _(refs: node-postgres#2696)_

### ✅ Verification notes
Verified empirically against PostgreSQL 14.15 (temp instance) and cross-checked against the cited issues.

**CORRECTION 1 — central premise is BACKWARDS (affects "Why it matters" on lines 6, 18, 24).**
The section repeatedly claims "a domain column reports the domain's OID, not the base type's OID" on the wire. This is false. PostgreSQL resolves a domain to its underlying base type in the RowDescription it sends. Measured: a `posint` (oid 16385, base int4) column is reported on the wire as OID 23 (`integer`); `strarr` (over text[]) reports 1009 (`text[]`); `mydom` (over text) reports 25 (`text`). Confirmed via `\gdesc` while `format_type(16385)` still returns `posint` (so the formatter is NOT collapsing it — the wire OID genuinely is the base). Holds for column refs, explicit casts (`'x'::mydom` → text), and expression contexts. This is independently corroborated by postgres.js#719 itself: the reporter found the parser fires when registered against the base OID (23) and never against the domain OID (17842). The driver does NOT need to "resolve domain→base for the DECODE path" — the server already did it.

**CORRECTION 2 — "Custom type parsers" test on line 19 has an INVERTED expected outcome (would FAIL against real PG).**
It asserts that a parser registered against the *domain's* OID is invoked for a domain column. It is not — the domain OID never appears on the wire, so a domain-OID-keyed parser is never triggered. The recorded intent of #719 ("a parser registered for a DOMAIN's OID *should* be invoked") is the reporter's WISH, not actual behavior; it is precisely the thing that does NOT happen. Fix the test to assert the real semantics: (a) a parser registered on the BASE type OID fires for the domain column, and (b) a parser registered on the domain's own OID does NOT fire (documenting the #719 limitation). Note this also means a base-OID parser fires for ALL columns of that base type, not just the domain — a real footgun to call out.

**CORRECTION 3 — "Custom type parsers" test on line 21 is also INVERTED.**
It claims a parser registered for the base type OID (text/25) does NOT fire for a domain-over-text column "unless the driver explicitly resolves domains to their base." The opposite is true: because the server reports OID 25 for the domain column, a text/25 parser fires automatically with no resolution. This is exactly what #719's reporter observed works.

**CORRECTION 4 — narrow the "centralize resolve domain OID → base OID for BOTH encode and decode" advice (line 24).**
Resolution is unnecessary on the decode path (server reports base OID transitively). The genuine footgun is on the ENCODE/parameter path (postgres.js#592): when a driver fetches param/array type metadata to decide array-literal serialization, a domain-over-array may not be recognized as an array, so it serializes the JS array as a plain string → `malformed array literal` (22P02). Frame the centralized resolution as an ENCODE-side concern.

**Things that check out (no change needed):**
- Lines 7, 8: domain-over-int / domain-over-text round-trips decode as base type — correct outcomes (the rationale on line 6 is wrong, but the expected results are right).
- Line 9: CHECK violation surfaces as SQLSTATE 23514 — verified (`value for domain posint violates check constraint`).
- Lines 13–15 (postgres.js#592, the one HIGH-signal bug): expected behavior is correct; malformed-array-literal SQLSTATE is 22P02 — verified. Domain over text[] accepts the same array literal as text[].
- Line 25: domain-over-domain (`b` over `a` over int) is resolved *transitively* to `integer` on the wire — verified.
- Line 26: a domain over a NAMED composite reports the composite's own OID (verified: `dcomp` over `comp` reports OID 16402 `comp`, not RECORD), so the "input of anonymous composite types" error does not arise for named composites. Outcome stands.

**Grounding:** No hallucinated refs; every test traces to #2696, #592, or #719. Note #2696's actual repro is a DDL-time error in node-postgres (and its repro `CREATE DOMAIN Foo VARCHAR(128)` even omits `AS`), not a SELECT-decode failure — the section's SELECT-round-trip framing is a reasonable regression goal but the stated mechanism is speculative.

**Omitted high-signal tests:** None. The only record with kind=bug AND testable=high is postgres.js#592, which is covered by the array-serialization section. Coverage complete on the high-signal axis.


## Data Types — custom

_Covers user-extensible type handling: registering parsers (decode, wire→JS) and serializers (encode, JS→wire) by OID/name, scoping those overrides (global vs pool vs client vs query), disabling parsing entirely, and round-tripping extension/composite/array types (pgvector, PostGIS, large objects). This is the driver's primary extensibility surface — bugs here silently corrupt data or leak parser state across unrelated connections._

### Parser/serializer scope isolation (global vs pool vs client vs query)
**Why it matters / failure mode:** The classic node-postgres footgun is a process-wide singleton parser registry: one module's `setTypeParser` mutates decoding for every pool in the process. Both ecosystems repeatedly hit "type parsers conflict." A correct driver must let overrides be scoped without cross-contamination.
- **Test:** Registering a parser for OID 1700 (numeric) on client A must NOT change client B's decoding of numeric; B still returns the default representation. _(refs: node-postgres#1838, node-postgres#2363, node-postgres#2364)_
- **Test:** A per-pool parser override applies to every connection checked out of that pool, but a second pool with no override is unaffected (no shared global mutation). _(refs: node-postgres#676, node-postgres#2363)_
- **Test:** A `types`/`getTypeParser` option supplied on a single query is applied only to that query's result decoding; the next query on the same connection uses the default. _(refs: node-postgres#1810, node-postgres#2686)_
- **Test:** A custom array-type parser passed in `options.types` overrides the built-in array parser instead of being ignored in favor of the driver's own. _(refs: postgres.js#577)_
- **Test:** The internal types object must always be present/initialized so `getTypeParser` is callable during result-field decoding (never `undefined`), even when no custom types are configured. _(refs: node-postgres#1175)_

### setTypeParser decode correctness and application scope
**Why it matters / failure mode:** A registered parser must actually run for the matching OID, for every row, in every statement of a batch — not silently bypassed. Regressions here ("setTypeParser stopped working") are high-signal.
- **Test:** A parser registered for JSONB (OID 3802) is invoked for every value of that column; result holds the parser's output, not the raw string. _(refs: node-postgres#1225, node-postgres#626)_
- **Test:** Custom parsers run on results of multi-statement / multi-line queries (semicolon-separated), not only on single-statement queries. _(refs: node-postgres#3309)_
- **Test:** A parser whose registration lists specific source OIDs applies ONLY to those OIDs; values of other types matching the same "to" JS type are left untouched. _(refs: postgres.js#1129)_
- **Test:** A parser returning a non-primitive (e.g. a BigNumber/object for numeric OID 1700) yields that object instance unchanged in result rows — no re-serialization or `[object Object]` coercion. _(refs: node-postgres#3255)_
- **Test:** A custom parse function for a scalar type receives the raw column string (e.g. `"3.14"`), never an Array or pre-split structure, and must not throw `ERR_INVALID_ARG_TYPE`. _(refs: postgres.js#421)_

### Custom serializers (JS→wire / bind path)
**Why it matters / failure mode:** Parsing (read) is well-trodden, but the encode path is frequently broken: a registered serialize hook for a type is never called, so bound parameters go out with default stringification. postgres.js#341 (numeric serializer never called) is a confirmed bug.
- **Test:** A user-registered serialize function for numeric (OID 1700) is invoked when binding a parameter of that type; the wire value is the serializer's output. _(refs: postgres.js#341)_
- **Test:** A user-supplied serializer for a JS type (e.g. an interval object) controls the exact stringified value sent to Postgres for that parameter. _(refs: node-postgres#3302)_
- **Test:** Serialize and parse hooks for the same custom type round-trip: `parse(serialize(x))` reproduces `x` for representative values including edge cases. _(refs: postgres.js#1041)_

### Disabling type parsing (raw passthrough)
**Why it matters / failure mode:** Users need an escape hatch to get unparsed strings (avoid lossy/expensive conversions). Must apply uniformly, including types that are otherwise auto-converted (json, numeric, timestamps).
- **Test:** With type casting disabled, all columns are returned as the raw Postgres text representation (strings); no JSON.parse, no Number conversion, no Date construction. _(refs: node-postgres#2093, node-postgres#2596)_

### NULL/undefined and per-column transforms
**Why it matters / failure mode:** Parsers conventionally short-circuit on NULL (always return JS `null`), so users can't wrap nullable values; and there's no symmetric read transform for null→undefined to match undefined→null on write.
- **Test:** A configurable transform can map DB NULL to `undefined` on read, symmetric to mapping `undefined`→NULL on write. _(refs: postgres.js#548)_
- **Test:** A type parser can be invoked for NULL values (opt-in) so NULL may be wrapped (e.g. into an Option/None) rather than unconditionally returning JS `null`. _(refs: node-postgres#2446)_
- **Test:** A per-column transformer applies on both read and write paths for the targeted column, leaving other columns unaffected. _(refs: postgres.js#825)_

### Composite and array custom types
**Why it matters / failure mode:** Arrays and user-defined composites compose over a base type parser; the registered element/composite parser must be applied during array decomposition.
- **Test:** An array column of a user-defined composite type is decoded element-by-element through the registered composite parser. _(refs: postgres.js#94)_
- **Test:** An array of a custom scalar type uses the registered element parser for each element (not the default), producing typed elements. _(refs: postgres.js#577, node-postgres#1129)_

### Extension types end-to-end: pgvector
**Why it matters / failure mode:** pgvector is the most-reported real-world custom type across both repos; several bugs produce "malformed vector literal" or broken round-trips. Strong cross-driver signal.
- **Test:** A JS number array bound to a `vector` column serializes to a valid vector literal `[1,2,3]` (bracketed, comma-separated, no Postgres array braces); the server accepts it. _(refs: postgres.js#583, node-postgres#3351)_
- **Test:** Reading a `vector` column parses the literal back into a JS number array equal to the inserted values (full round-trip, including under the Deno/edge runtime). _(refs: postgres.js#1041, postgres.js#583)_
- **Test:** A custom type registered by name (e.g. `vector`) has its OID auto-resolved from the server catalog at runtime, so serialize/parse hooks bind to the correct dynamic OID. _(refs: postgres.js#1115)_

### Large objects, raster, and explicit casts
**Why it matters / failure mode:** Some types (bytea-backed PostGIS raster, lo/large objects) need an explicit cast or dedicated API; sending a Buffer to a `raster` column is rejected as a bytea↔raster mismatch.
- **Test:** Inserting a Buffer into a PostGIS `raster` column with an explicit `::raster` cast succeeds (no bytea-vs-raster type mismatch error). _(refs: postgres.js#836)_
- **Test:** A PostgreSQL large object can be written and read back byte-for-byte via the driver's large-object API. _(refs: postgres.js#67)_

### ✅ Verification notes
- **Citation error (line 40):** `node-postgres#1129` does not exist in the records. The intent ("from OID list applies only to listed OIDs") comes from `postgres.js#1129` (already correctly cited on line 17). Fix the prefix to `postgres.js#1129`.
- **Unsupported claim (line 45):** "including under the Deno/edge runtime" is not grounded in any cited intent. postgres.js#1041 and postgres.js#583 concern vector serialize/parse round-trip correctness only, with no runtime-specific assertion. Drop the Deno/edge parenthetical.
- **Semantics OK:** pgvector input literal `[1,2,3]` (bracketed, no array braces), numeric OID 1700, JSONB OID 3802, NULL-bypass opt-in (#2446), raster `::raster` cast (#836), and "default representation" for numeric (string, not number) are all correct per PostgreSQL/pgvector behavior.
- **High-signal coverage complete:** all bug/regression + testable=high refs are present — node-postgres#3309 (line 16), postgres.js#341 (line 23), postgres.js#577 (lines 10, 40), postgres.js#1041 (lines 25, 45), postgres.js#1129 (line 17). No high-signal omissions.
- **Minor coverage gap (low-signal, optional):** node-postgres#2547 (feature/low: keep pg-types current so newer parsers are available) is the only record with no representation. Could add a test asserting a recently-added pg-types parser (e.g. a newer OID) decodes out of the box.


## Data Types — binary-format

_This area covers how the driver requests, decodes, and round-trips values in PostgreSQL's binary wire format (and when it falls back to text). Binary decoding is a raw byte-level concern: a single wrong offset, width, or accidental UTF-8 re-encoding silently corrupts integers, bigints, UUIDs, and timestamps — so it demands exact, deterministic assertions._

### Binary integer decoding (int / bigint)
**Why it matters / failure mode:** Binary decoders read fixed-width big-endian byte fields directly off the wire. Two recurring failure modes appear in BOTH node-postgres and postgres.js: (a) mis-sized reads on 8-byte bigints producing garbage, and (b) routing binary bytes through a UTF-8 string round-trip that mangles non-ASCII byte sequences. These are the highest-signal regressions in this bucket.
- **Test:** Request `SELECT 99999999999 + 3` (oid 20 / int8) in binary result format; the decoded value must equal exactly `100000000002` (as a precise bigint string/BigInt, never a truncated or NaN/garbage value). _(refs: node-postgres#1492)_
- **Test:** Request `SELECT 1000::int4` (oid 23 / int4) in binary result format; the decoded value must be exactly the number `1000`. Guard specifically against the 8.16.2-style regression where the 4-byte big-endian field was passed through a UTF-8 decode/encode round-trip and corrupted. _(refs: node-postgres#3495)_
- **Test:** Decode binary int4 boundary values `0`, `-1`, `2147483647`, `-2147483648` and assert each equals its exact integer (verifies big-endian two's-complement handling, not just positive small ints). _(refs: node-postgres#3495, node-postgres#1492)_
- **Test:** Decode binary int8 boundary values `9223372036854775807` and `-9223372036854775808`; assert lossless representation (BigInt/string), confirming full 8-byte width is read and high bytes are not dropped. _(refs: node-postgres#1492)_

### Binary decoding of structured types (uuid, timestamp)
**Why it matters / failure mode:** Non-numeric types have their own binary encodings (uuid = 16 raw bytes; timestamp = 8-byte microsecond offset from the 2000-01-01 epoch). A correct driver must decode these to values identical to the text-protocol result, proving the binary parser is registered per-OID rather than blanket-stringifying bytes.
- **Test:** For a fixed `uuid` value, fetch the same row in text format and in binary format; assert the binary-decoded string equals the canonical hyphenated text representation (e.g. `'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'`). _(refs: postgres.js#232)_
- **Test:** For a fixed `timestamp`/`timestamptz` value, assert the binary-decoded value equals the text-protocol value (same Date/instant), validating the microsecond-since-2000 epoch conversion rather than a naive byte read. _(refs: postgres.js#232)_

### Text/binary mode selection & custom type parsers
**Why it matters / failure mode:** The driver requests results in TEXT format by default; binary must be opt-in. User-registered custom text parsers (keyed by OID) only fire when results actually arrive as text. If the driver silently switches to binary, those parsers are bypassed and users get unexpectedly raw or differently-shaped values.
- **Test:** With no binary opt-in, register a custom text parser for a given type OID and run a query returning that type; assert the custom parser IS invoked (results arrived in text format). _(refs: node-postgres#2500)_
- **Test:** Assert the default result format is text: a query for a type with no registered parser returns the raw PostgreSQL text representation (string), confirming binary is not enabled implicitly. _(refs: node-postgres#2500)_
- **Test:** When binary mode IS explicitly requested for a query, assert the same logical value decodes equal to its text-mode counterpart for int4, int8, uuid, and timestamp (cross-mode equivalence end-to-end). _(refs: node-postgres#3495, node-postgres#1492, postgres.js#232)_

### Regression guard: no UTF-8 round-trip on binary bytes
**Why it matters / failure mode:** The pg 8.16.2 corruption (node-postgres#3495) was caused by treating binary field bytes as a UTF-8 string at some pipeline stage. This deserves a dedicated guard because it can pass for ASCII-safe values yet fail for high bytes.
- **Test:** Decode binary int4 values whose big-endian bytes include non-ASCII bytes (e.g. a value whose encoding contains `0x80`–`0xFF`, such as `1000` → bytes `00 00 03 E8`, and `200` → `00 00 00 C8`); assert exact numeric equality, proving bytes were never coerced through UTF-8. _(refs: node-postgres#3495)_

### ✅ Verification notes
All EXPECTED behaviors check out against PostgreSQL semantics:
- `99999999999 + 3` = `100000000002`, and the literal `99999999999` exceeds int4 max so it is auto-typed int8 (oid 20) with no cast — correct.
- int4 bytes verified: `1000` → `00 00 03 E8` (contains non-ASCII `0xE8`), `200` → `00 00 00 C8` (contains non-ASCII `0xC8`); these are genuinely valid UTF-8-round-trip traps since a lone `0xE8`/`0xC8` is an invalid UTF-8 lead byte → corrupted to U+FFFD. Solid regression guard.
- int4 boundaries (`0, -1, 2147483647, -2147483648`) and int8 boundaries (`±9223372036854775807/8`) match the two's-complement ranges exactly.
- uuid = 16 raw bytes; timestamp/timestamptz = int64 microseconds since 2000-01-01 epoch (integer-datetimes, default since PG 8.4) — correct conversions.
- node-postgres default result format IS text and custom text parsers fire only on text results (#2500) — accurate for node-postgres.

Grounding: every test traces to a cited ref; the boundary-value tests (lines 9-10) are reasonable extrapolations of the #1492/#3495 binary-integer bugs, not hallucinations.

Coverage: both HIGH-signal bugs (#1492 int8, #3495 int4 UTF-8 corruption) are covered, each with a dedicated test plus a separate UTF-8 round-trip guard. No high-signal omissions.

Advisory (not a correction): the section states "the driver requests results in TEXT format by default." This is true for node-postgres and matches the recorded #2500 intent, but note that postgres.js (the other parent of this hybrid driver) defaults prepared-statement results to BINARY. If this new driver adopts postgres.js's binary-default, the text-default assertions (lines 19-20) and the custom-text-parser expectation would need revisiting against the driver's actual chosen default. Flagging only because the section presents it as a general property of "the driver."

Verified: no corrections; coverage complete.


## Data Types — hstore

_The `hstore` extension type stores sets of key/value string pairs in a single column. A driver must parse hstore wire text into a JS object (and serialize objects back), correctly handling quoting, escaping, NULL values, and edge cases. hstore is an optional extension (`CREATE EXTENSION hstore`) whose OID is dynamic per-database, so the driver must resolve and register the type OID at runtime rather than rely on a fixed catalog OID._

### Parsing hstore text into a JS object
**Why it matters / failure mode:** Without an hstore parser the value comes back as a raw string like `"a"=>"b"`, forcing callers to hand-roll fragile parsing. The wire format uses `"key"=>"value"` pairs separated by `, ` with double-quoted, backslash-escaped tokens, so naive `split` logic breaks on commas, `=>`, quotes, or whitespace inside values.

- **Test:** `SELECT 'a=>1, b=>2'::hstore` parses to the JS object `{ a: '1', b: '2' }` (all values are strings, key order not significant). _(refs: node-postgres#140)_
- **Test:** An empty hstore `''::hstore` parses to an empty object `{}`, not `null` and not `''`. _(refs: node-postgres#140)_
- **Test:** A single pair `'k=>v'::hstore` parses to `{ k: 'v' }`. _(refs: node-postgres#140)_

### Quoting, escaping, and special characters
**Why it matters / failure mode:** hstore double-quotes tokens and backslash-escapes embedded `"` and `\`. A parser that splits on raw delimiters mis-parses values containing `,`, `=>`, `"`, or spaces — a common footgun in both ecosystems.

- **Test:** `'"key with spaces"=>"value, with => comma"'::hstore` parses to `{ 'key with spaces': 'value, with => comma' }` — embedded commas and `=>` inside quoted tokens must NOT be treated as delimiters. _(refs: node-postgres#140)_
- **Test:** Escaped quote and backslash: `'a=>"he said \"hi\"", b=>"c:\\\\path"'::hstore` parses to `{ a: 'he said "hi"', b: 'c:\\path' }`. _(refs: node-postgres#140)_
- **Test:** Keys/values that look like numbers or booleans stay strings: `'n=>5, t=>true'::hstore` → `{ n: '5', t: 'true' }`. _(refs: node-postgres#140)_

### NULL value semantics
**Why it matters / failure mode:** In hstore a value can be SQL NULL (written unquoted as `NULL`), which must map to JS `null`, while the literal string `"NULL"` (quoted) must map to the string `'NULL'`. Conflating them is a correctness bug. Keys can never be NULL.

- **Test:** `'a=>NULL'::hstore` parses to `{ a: null }` (JS `null`, not the string `'NULL'`). _(refs: node-postgres#140)_
- **Test:** `'a=>"NULL"'::hstore` (quoted) parses to `{ a: 'NULL' }` (the literal string), distinct from the unquoted NULL case. _(refs: node-postgres#140)_

### Round-trip serialization (object → hstore)
**Why it matters / failure mode:** A driver that parses but cannot serialize forces string concatenation on the caller, re-introducing the escaping bugs above. Serialization must quote/escape and emit the inverse of the parser so values survive a round trip.

- **Test:** Sending JS `{ a: '1', b: 'two words', c: null }` as an hstore parameter and reading it back yields the same object `{ a: '1', b: 'two words', c: null }`. _(refs: node-postgres#140)_
- **Test:** A value containing quotes/backslashes/`=>`, e.g. `{ k: 'x"=>y\\z' }`, round-trips byte-for-byte through insert and select. _(refs: node-postgres#140)_

### Dynamic type OID registration
**Why it matters / failure mode:** hstore is not a built-in type; its OID differs per database and is unknown until the extension is installed. The driver must look up the OID from `pg_type` and bind the parser/serializer to it, rather than assuming a static OID.

- **Test:** With `CREATE EXTENSION hstore` installed, the driver resolves the hstore OID (e.g. via `SELECT oid FROM pg_type WHERE typname='hstore'`) and applies the hstore parser to columns of that type; arrays of hstore (`hstore[]`) are likewise decoded element-wise. _(refs: node-postgres#140)_

### ✅ Verification notes
**Corrections:**
- Line 16 backslash test has an off-by-a-factor-of-2 escaping error in its EXPECTED value. With the PostgreSQL default `standard_conforming_strings=on`, backslashes in the SQL literal `'...b=>"c:\\\\path"'` are literal, so hstore receives the token `"c:\\\\path"` (4 backslashes), which hstore unescapes (`\\` -> `\`) to the value `c:\\path` (TWO backslashes). The asserted JS result `{ b: 'c:\\path' }` is one backslash (`c:\path`), so it is wrong as written. Fix one of two ways: (a) keep the input and expect `{ b: 'c:\\\\path' }` (value `c:\\path`, two backslashes), or (b) change the input to two backslashes `'...b=>"c:\\path"'` to legitimately get `{ b: 'c:\\path' }`. The quote-escaping half of the same test (`"he said \"hi\""` -> `he said "hi"`) is correct. Recommend pinning the test's `standard_conforming_strings` assumption explicitly to avoid this ambiguity.

**Otherwise correct:** empty `''::hstore` -> `{}`; SQL NULL (`a=>NULL`) -> `null` vs quoted `a=>"NULL"` -> `'NULL'`; all values returned as strings (numbers/booleans stay strings); key order not significant; embedded `,`/`=>`/quotes inside quoted tokens not treated as delimiters; dynamic per-database OID resolution via `pg_type` and `hstore[]` element-wise decoding. All consistent with PostgreSQL hstore semantics and grounded in node-postgres#140.

**Omitted high-signal tests:** none. The only record (node-postgres#140) is kind=feature (not bug/regression), so there are no omitted bug/regression + testable=high refs. Coverage of the feature is, if anything, broader than the cited intent (parse-only), which is acceptable.


## Data Types — oid

_Covers how the driver discovers, exposes, and resolves PostgreSQL type OIDs: the builtin OID-constant table consumers rely on for type overrides, the internal introspection queries that map array/element OIDs (and their portability across server versions), and the numeric handling of raw OID values. Getting this wrong breaks custom type parsers/serializers, array decoding, and connectivity to non-mainstream servers._

### Builtin type-OID constant table is populated and complete
**Why it matters / failure mode:** Apps register custom parsers/serializers by referencing well-known OIDs via a `types.builtins` map. If the table is missing or empty, member access throws `Cannot read property 'X' of undefined`, breaking startup before any query runs.
- **Test:** `types.builtins` (the exported OID-constant map) is a defined object, not `undefined`; accessing `types.builtins.NUMERIC` returns the numeric literal `1700` and does not throw. _(refs: node-postgres#2856)_
- **Test:** Common builtin constants resolve to their canonical pg_type OIDs: `BOOL=16`, `INT8=20`, `INT4=23`, `TEXT=25`, `JSON=114`, `FLOAT8=701`, `TIMESTAMP=1114`, `TIMESTAMPTZ=1184`, `NUMERIC=1700`, `JSONB=3802`. Each constant is present (no missing builtins / stale pg-types reference). _(refs: node-postgres#1936, node-postgres#2856)_
- **Test:** Registering a custom parser keyed by `types.builtins.TIMESTAMPTZ` actually takes effect for `timestamptz` columns at decode time, proving the constant maps to the OID the wire protocol sends. _(refs: node-postgres#1936)_

### Internal introspection queries must be portable across server versions
**Why it matters / failure mode:** The driver's array/element-type lookup queries reference catalog columns (`pg_type.typarray`, `typcategory`) that do not exist on very old servers (e.g. PostgreSQL 8.2), causing a hard `column "..." does not exist` error on connect/first-query. BOTH drivers hit this (node-postgres and postgres.js) — strong signal that an OID-introspection query should degrade gracefully.
- **Test:** Connecting and running a simple query against a server whose `pg_type` lacks `typarray` does not raise `column "typarray" does not exist`; the driver either feature-detects the column or uses a version-compatible fallback. _(refs: node-postgres#2248)_
- **Test:** The internal array-type lookup query succeeds against a server lacking `typcategory` (no `column "typcategory" does not exist` error); array types still resolve. _(refs: postgres.js#87)_
- **Test:** On a modern server the introspection query still correctly maps element OID → array OID (e.g. `int4[]` decodes to a JS array), confirming the compatibility fallback did not regress normal behavior. _(refs: node-postgres#2248, postgres.js#87)_

### OID values outside the signed int4 range
**Why it matters / failure mode:** OIDs are unsigned 32-bit; values above 2,147,483,647 overflow a signed-int4 assumption and cause the parser lookup to miss, so columns fall back to raw text instead of the registered parser.
- **Test:** A column whose data-type OID exceeds the int4 max (> 2147483647, e.g. a high-OID user/array type) still resolves to its registered type parser — an array-typed column with such an OID decodes to a JS array, not an unparsed string. _(refs: node-postgres#2974)_
- **Test:** OID-keyed parser registration and lookup treat the OID as an unsigned 32-bit integer end-to-end; no negative-number or overflow mismatch between the parsed RowDescription OID and the parser map key. _(refs: node-postgres#2974)_

### Custom OID parser/serializer must not break internal fetch-types
**Why it matters / failure mode:** When a user overrides parsing/serialization for the `oid` type, the driver's own internal queries (which fetch array/element OIDs) must keep receiving and emitting the OID as a numeric value. Overriding it corrupted internal `fetchArrayTypes`, and the fetch-types query could leave the protocol in an inconsistent state.
- **Test:** With a user-supplied custom `oid` parser/serializer registered, internal array-type fetching (`fetchArrayTypes`) still receives each OID as a number and completes successfully; subsequent array columns decode correctly. _(refs: postgres.js#580)_
- **Test:** The internal fetch-types query for array OIDs receives its `CommandComplete` and finishes normally — the connection is not left mid-statement, and the next user query executes without protocol desync. _(refs: postgres.js#1136)_
- **Test:** A custom `oid` serializer is NOT applied to the driver's internal introspection queries (internal queries bind OIDs as plain integers), so user customization cannot alter the driver's catalog lookups. _(refs: postgres.js#580, postgres.js#1136)_

### Type-parser registration semantics (clarifying behavior)
**Why it matters / failure mode:** Ambiguity about per-OID vs global parser registration leads to wrong-typed results; the contract should be deterministic.
- **Test:** A parser registered for a specific OID applies only to columns of that OID and leaves all other types decoding by their defaults. _(refs: node-postgres#328)_

### ✅ Verification notes
- OID constants all correct: BOOL=16, INT8=20, INT4=23, TEXT=25, JSON=114, FLOAT8=701, TIMESTAMP=1114, TIMESTAMPTZ=1184, NUMERIC=1700, JSONB=3802.
- Version-portability expectations are accurate: `pg_type.typarray` was introduced in PG 8.3 and `typcategory` in PG 8.4, so an 8.2/8.3 server legitimately lacks these columns (refs #2248, postgres.js#87).
- Unsigned-int4 OID framing is correct: the wire RowDescription data-type OID is a 4-byte Int32 field but OIDs are unsigned, so values >2^31 must be read unsigned to avoid a negative-key parser-map miss (ref #2974).
- All eight records map to a test; every one is kind=bug/question with testable=low/medium. No kind=bug/regression AND testable=high record exists, so no high-signal omissions.
- Minor: the line-9 test (custom parser keyed by `builtins.TIMESTAMPTZ` taking effect at decode) extends slightly beyond #1936's stated intent (merely exposing the constant), but is a valid, correct verification of that constant — not a correction.

Verified: no corrections; coverage complete.


## Data Types — other

_Covers how the driver maps SQL NULL and untyped/edge-case values into JavaScript primitives. Correct NULL handling is foundational: every row and parameter path touches it, and a wrong default silently corrupts application logic._

### SQL NULL → JavaScript value mapping
**Why it matters / failure mode:** Conflating SQL `NULL` with JavaScript `undefined` breaks `JSON.stringify` (drops keys), `Object.keys`/destructuring expectations, and equality checks. The PostgreSQL/JS convention is that `NULL` decodes to `null`, not `undefined`; `undefined` is reserved for "column absent". The proposal to decode `NULL` as `undefined` is a footgun to reject. _(node-postgres#1274)_

- **Test:** `SELECT NULL AS a` returns a row where `row.a === null` (strictly `null`, not `undefined`). The key `a` must exist on the row object (`'a' in row === true`). _(refs: node-postgres#1274)_
- **Test:** `SELECT NULL::int AS a, NULL::text AS b, NULL::jsonb AS c` — every typed NULL column decodes to `null` regardless of declared column type. _(refs: node-postgres#1274)_
- **Test:** A row with a real value vs a NULL is distinguishable: `SELECT 0 AS a, NULL AS b` yields `row.a === 0` and `row.b === null` (NULL must not collapse to falsy 0/empty-string). _(refs: node-postgres#1274)_
- **Test:** NULL inside an array decodes to `null` element: `SELECT ARRAY[1, NULL, 3]::int[] AS a` → `row.a` deep-equals `[1, null, 3]`. _(refs: node-postgres#1274)_
- **Test:** NULL inside a composite/row type decodes its field to `null`, not a dropped/`undefined` field. _(refs: node-postgres#1274)_
- **Test:** Serialization round-trip preserves NULL: `JSON.stringify(row)` of `SELECT NULL AS a` produces `{"a":null}` (would be `{}` if decoded as `undefined`). _(refs: node-postgres#1274)_
- **Test (param direction / symmetry):** Passing JavaScript `null` as a bound parameter inserts SQL `NULL`, and reading it back yields `null` — `INSERT ... VALUES ($1) RETURNING col` with `null` round-trips to `null`. Passing `undefined` should follow the driver's documented rule (either coerced to `NULL` or rejected) but must never silently insert the string `"undefined"`. _(refs: node-postgres#1274)_

### ✅ Verification notes
- Core mapping is correct per PostgreSQL/node-postgres convention: SQL `NULL` decodes to JS `null` (not `undefined`), the key remains present, and `null` is distinct from falsy `0`/`''`. Tests for `SELECT NULL`, typed NULLs, the `0` vs `NULL` distinction, and the `JSON.stringify` round-trip (`{"a":null}`) are all accurate and grounded in #1274.
- Array test is correct: `SELECT ARRAY[1, NULL, 3]::int[]` deep-equals `[1, null, 3]`; the array text-format parser maps the unquoted `NULL` token to a `null` element.
- Param-symmetry test is a reasonable extension of #1274's intent. Note for the implementer: historically node-postgres coerces JS `undefined` to SQL `NULL` for bound params (it does NOT insert the literal string `"undefined"`). The test's hedged wording ("documented rule") is acceptable, but the most spec-faithful expectation is `undefined` → `NULL`.
- CORRECTION — composite/row-type test (line 12) is misleading. By default node-postgres (and a from-scratch driver) does NOT decode composite/row types into structured JS objects; a row value comes back as a raw text string (e.g. `(1,)`), so there is no per-field object whose field could be `null` vs `undefined` unless a custom composite parser is registered. As written the test presumes composite decoding that is not default behavior. Either (a) restrict the assertion to the raw composite text containing an empty/NULL field, or (b) explicitly scope it to "when a composite type parser is configured." Not directly supported by #1274.
- No omissions: the only other record (#3634) is meta/non-testable, and there are no kind=bug/regression + testable=high records for this category.


## Copy

_Covers PostgreSQL's COPY protocol (COPY FROM STDIN / COPY TO STDOUT) exposed as Node streams: ingest/egress streaming, backpressure, stream lifecycle (end/close/error), result metadata, parameterization/interpolation, and pool/connection safety. COPY puts the protocol into a dedicated sub-state (CopyIn/CopyOut), so a driver must drive CopyData/CopyDone/CopyFail messages correctly or it will hang, leak, or corrupt connections — the most dangerous failure class in a driver._

### Basic COPY FROM STDIN / COPY TO STDOUT streaming
**Why it matters / failure mode:** Foundational capability; without correct CopyData framing rows are lost, truncated, or the protocol desyncs. Both drivers had to build this from scratch.
- **Test:** `COPY t FROM STDIN` exposed as a Writable: writing well-formed rows then ending the stream inserts exactly those rows; `SELECT count(*)` matches the number written, byte-for-byte intact. _(refs: node-postgres#7, node-postgres#80, node-postgres#1420, postgres.js#170)_
- **Test:** `COPY t TO STDOUT` exposed as a Readable streams every row of the table out; concatenated output equals the canonical COPY text representation and row count matches the source table. _(refs: node-postgres#80, node-postgres#1420, postgres.js#170)_
- **Test:** A plain `fs`/readable source piped into the COPY FROM writable delivers all bytes; result equals loading the same file via psql `\copy`. _(refs: postgres.js#59, node-postgres#7)_
- **Test:** COPY with explicit format options (`WITH (FORMAT csv)`, custom DELIMITER) round-trips a multi-line CSV identically. _(refs: node-postgres#463)_

### Backpressure & large payloads (drain)
**Why it matters / failure mode:** Ignoring `write()` returning false floods the socket, blows the call stack, or splits chunks mid-row → "extra data after last expected column" / "unterminated CSV quoted field". Affected BOTH the streaming path and large-document loads.
- **Test:** Streaming a payload far larger than the socket buffer through COPY FROM honors backpressure: `write()` returning false pauses the source until `drain`, and no row is split or duplicated. Final row count equals input. _(refs: node-postgres#377, node-postgres#399, node-postgres#619)_
- **Test:** Backpressured COPY FROM must not exceed the call stack (no synchronous recursion on drain); a multi-GB-equivalent stream completes without RangeError. _(refs: node-postgres#619)_
- **Test:** Loading a large multi-megabyte CSV with quoted fields spanning chunk boundaries succeeds without "unterminated CSV quoted field" — chunks are reassembled, not parsed per-write. _(refs: node-postgres#463)_
- **Test:** Streaming a large binary object via `COPY ... WITH (FORMAT binary)` FROM STDIN does not buffer the whole payload in memory (bounded RSS) and inserts the object intact. _(refs: node-postgres#410)_

### COPY TO stream lifecycle: end / close / pause-resume
**Why it matters / failure mode:** If the Readable never emits `end`/`close`, `pipeline()` never resolves and the connection hangs forever. Pausing (slow consumer or transform like gzip) must resume, not stall. BOTH drivers regressed here.
- **Test:** A `COPY TO STDOUT` Readable emits `end` after the final CopyDone and `close` afterward; `await pipeline(copyTo, dest)` resolves. _(refs: node-postgres#3284, postgres.js#917)_
- **Test:** Piping COPY TO into a slow consumer that pauses the stream resumes on demand and eventually emits `end` — no permanent paused-mode stall. _(refs: node-postgres#404)_
- **Test:** Piping COPY TO STDOUT through a gzip/transform compression stream completes, releases the connection back to the pool, and the gunzipped output equals the source data — no frozen pool. _(refs: postgres.js#499)_
- **Test:** COPY TO routed through `stream/promises` `pipeline()` to a Writable destination streams rows without `ERR_INVALID_ARG_TYPE` (the writable target is a real Node Writable). _(refs: postgres.js#609)_

### Error handling: settle, surface, and don't leak
**Why it matters / failure mode:** Highest-severity bucket. A server-rejected COPY that never settles the stream skips ROLLBACK in a transaction and leaves the connection "idle in transaction (aborted)" forever. Misuse must error to the callback, not throw uncaught.
- **Test:** When the server rejects `COPY FROM STDIN` (e.g. bad data / constraint), the writable stream emits `error` carrying the PostgreSQL error; inside `sql.begin()` the transaction ROLLBACKs and the connection returns to the pool usable — no permanent "idle in transaction (aborted)" leak. _(refs: postgres.js#1173)_
- **Test:** Issuing `COPY FROM STDIN` without supplying a copy stream surfaces an error to the query callback (rejected promise) rather than throwing an uncaught `TypeError`. _(refs: node-postgres#241)_
- **Test:** A COPY that errors mid-stream delivers the error to the caller (no silent hang / "no response on error"); subsequent queries on the same connection succeed after the protocol resyncs. _(refs: node-postgres#601)_
- **Test:** Piping `COPY TO STDOUT` into `COPY FROM STDIN` on a single checked-out connection completes without deadlock or silent process exit. _(refs: node-postgres#2591)_

### Parameters, interpolation & escaping in COPY
**Why it matters / failure mode:** COPY does not accept bind parameters at the protocol level; drivers that try produce "could not determine data type" or silently break. Template-tag drivers must distinguish identifier helpers, literal fragments, and escape-byte options. BOTH drivers were bitten.
- **Test:** Passing bind parameters to a top-level `COPY ... FROM/TO` statement produces a clear, actionable error (COPY does not support parameters) rather than a cryptic server failure. _(refs: node-postgres#1176)_
- **Test:** A `COPY (SELECT ... WHERE col = $1) TO STDOUT` works: the parameter is bound on the inner SELECT (not the COPY) and streams the filtered rows without "could not determine data type". _(refs: postgres.js#552, postgres.js#875)_
- **Test:** Interpolating an identifier helper (table/column name) into a tagged-template `COPY ${sql(table)} FROM STDIN` builds valid SQL (identifier mode inferred), not a quoted literal or syntax error. _(refs: postgres.js#532, postgres.js#520)_
- **Test:** A backslash escape option in a COPY options clause (e.g. `ESCAPE E'\\'`) is transmitted as a single byte, matching psql; no "COPY escape must be a single one-byte character". _(refs: postgres.js#458)_
- **Test:** A COPY data string containing escaped TAB and NULL (`\t`, `\N`) sentinels is sent to the server with the special characters preserved (not stripped/blanked). _(refs: node-postgres#1211)_

### COPY result metadata (row count)
**Why it matters / failure mode:** The CommandComplete after COPY carries the affected-row count (`COPY n`); drivers that discard it leave callers unable to confirm how many rows moved.
- **Test:** A completed `COPY FROM STDIN` exposes the affected-row count from CommandComplete on the writable's completion result. _(refs: postgres.js#1062, postgres.js#465)_
- **Test:** A completed `COPY TO STDOUT` likewise exposes the streamed row count. _(refs: postgres.js#465)_

### Pool / connection ownership & non-superuser / custom statements
**Why it matters / failure mode:** COPY must bind to a single checked-out client; running it via `pool.query` desyncs the pool. The client must be cleanly reusable after the COPY stream finishes. Must work for non-superusers (psql `\copy` equivalent).
- **Test:** COPY streams run only on a checked-out client; after the COPY stream finishes the same client executes a normal query successfully and is released cleanly. `pool.query` for COPY is rejected/unsupported. _(refs: node-postgres#3283)_
- **Test:** `COPY FROM/TO STDIN/STDOUT` succeeds for a non-superuser role (client-side streaming, equivalent to psql `\copy`), without requiring server filesystem access. _(refs: node-postgres#1725, node-postgres#267)_
- **Test:** A COPY TO query object integrates with the client's type-parser machinery without throwing (e.g. `_getTypeParser` is available on the COPY query). _(refs: node-postgres#699)_
- **Test:** A custom/non-standard COPY-TO-shaped statement (e.g. logical-replication `TAIL`) sent via the copyTo path streams rows to the client instead of erroring as malformed. _(refs: node-postgres#2305)_
- **Test:** A COPY TO over a parameterized/prepared query streams the correct rows rather than returning an empty result. _(refs: node-postgres#920)_

### ✅ Verification notes
Two issues found; high-signal coverage is complete (the only kind=bug+testable=high refs, postgres.js#499 and postgres.js#1173, are both present).

- **Correction — "Parameters" section, the `COPY (SELECT ... WHERE col = $1) TO STDOUT` test (refs postgres.js#552, #875):** The stated mechanism "the parameter is bound on the inner SELECT (not the COPY)" is wrong per PostgreSQL semantics. COPY is a utility statement and does NOT accept protocol-level bind parameters anywhere — not even on an inner `(SELECT ...)`. Sending it via the extended (Parse/Bind) protocol is exactly what produces "could not determine data type of parameter $1". The correct expectation is that the driver **inlines/escapes the value into the SQL string** (consistent with #875's intent "values can be safely interpolated/parameterized into a COPY command") and sends it via simple query — there is no real server-side bind. Reword to say the value is safely interpolated/inlined, not "bound." The same caveat applies to the "COPY TO over a parameterized/prepared query" test (#920): the rows come from inlining, not a true prepared/parameterized COPY.

- **Grounding — "Error handling" mid-stream resync test (ref node-postgres#601):** node-postgres#601 is recorded as kind=question, testable=low, with an EMPTY intent. The test attributes a specific, concrete behavior ("error delivered to caller, no silent hang, subsequent queries succeed after protocol resync") that is not supported by that issue. The behavior itself is correct PostgreSQL semantics, but the citation is unsupported — either drop #601 or re-anchor this test to a bug with a real intent (e.g. node-postgres#241 / node-postgres#2591, already cited nearby).

- Minor (not counted): node-postgres#267 (line 49, empty-intent question) is only a secondary citation behind the solid node-postgres#1725, so the non-superuser test stays grounded. The binary-COPY test (#410) interprets "large binary objects" as `WITH (FORMAT binary)`; #410's intent is generic ("without buffering whole file in memory"), so this is a reasonable but specific reading — acceptable.

Omitted high-signal tests to add: none. All kind=bug/regression + testable=high records are covered.


## LISTEN / NOTIFY

_Covers asynchronous channel notifications: delivering NOTIFY/pg_notify payloads to LISTEN subscribers, channel-name identifier quoting, the dedicated long-lived listener connection (keepalive, reconnect, cleanup), notification object shape, and notify semantics inside transactions. This is a core driver responsibility because notifications arrive out-of-band of the normal request/response query cycle and depend on a correctly managed persistent connection._

### Basic delivery and notification object shape
**Why it matters / failure mode:** The fundamental contract — a LISTEN must actually receive NOTIFY events — and the event object must carry consistent, documented fields. Native vs JS bindings historically diverged.
- **Test:** After `LISTEN foo`, issuing `NOTIFY foo, 'bar'` from another connection delivers exactly one notification with `channel='foo'` and `payload='bar'`. _(refs: node-postgres#23, node-postgres#169)_
- **Test:** A notification triggered by a trigger function calling `pg_notify` is delivered asynchronously to the listener without an active query in flight. _(refs: node-postgres#169, node-postgres#1543)_
- **Test:** The notification object exposes a stable shape with the channel name, the payload, and the backend `processId` (PID of the notifying backend); these fields are identical regardless of native vs pure-JS implementation. _(refs: node-postgres#1045)_
- **Test:** A LISTEN subscription receives notifications emitted from ANY source (raw `NOTIFY`, `pg_notify`, another client/pool), not only those sent via the driver's own `sql.notify()` helper. _(refs: postgres.js#1069)_
- **Test:** `LISTEN`/`NOTIFY` with a NULL or empty payload delivers an event with an empty-string payload (PG spec: payload defaults to empty string). _(refs: node-postgres#23)_

### Channel-name identifier quoting (case + special characters)
**Why it matters / failure mode:** Channel names are SQL identifiers. Unquoted mixed-case folds to lowercase; names with uppercase/dots/special chars must be double-quoted or LISTEN/NOTIFY silently mismatch or throw syntax errors. BOTH drivers had this bug — strong signal.
- **Test:** `LISTEN "MyChannel"` (quoted, preserving case) receives `pg_notify('MyChannel', 'x')`; the driver must double-quote the channel identifier so case is preserved. _(refs: postgres.js#157)_
- **Test:** An unquoted mixed-case channel folds to lowercase per PG spec — `LISTEN MyChan` is equivalent to `LISTEN mychan` and receives `NOTIFY mychan`. Driver must document/behave consistently with whichever quoting strategy it picks. _(refs: node-postgres#2543, postgres.js#157)_
- **Test:** A channel name containing a `.` (e.g. `my.channel`) is properly double-quoted and does not raise a syntax error; NOTIFY on the same quoted name is delivered. _(refs: postgres.js#495)_
- **Test:** Channel names with other special characters (spaces, hyphens) are quoted/escaped so LISTEN succeeds and matches the corresponding NOTIFY. _(refs: postgres.js#495, postgres.js#157)_

### NOTIFY parameterization (no bind params; use pg_notify)
**Why it matters / failure mode:** `NOTIFY` is utility SQL and does not accept bind parameters; users naively try `NOTIFY chan, $1` and get syntax errors. The driver must route parameterized/JSON payloads through `pg_notify($1,$2)`.
- **Test:** Sending `NOTIFY chan, $1` with a bound parameter raises a syntax error at `$1` (PG spec: NOTIFY takes no parameters). _(refs: node-postgres#1258)_
- **Test:** `pg_notify($1, $2)` with bound channel and payload succeeds and delivers the payload intact, including a JSON string payload transmitted byte-for-byte. _(refs: node-postgres#1258, node-postgres#1265)_
- **Test:** The driver's `notify(channel, payload)` helper (if provided) uses `pg_notify` under the hood so arbitrary payloads (JSON, special chars) are escaped correctly. _(refs: node-postgres#1265)_

### Listener connection lifetime: keepalive, idle, no spurious transactions
**Why it matters / failure mode:** The dedicated LISTEN connection must stay alive indefinitely; many issues report notifications silently stopping after ~30s or "a while" due to idle timeouts / dropped sockets, and keepalive implemented as polling queries creates phantom transactions. Multiple bugs across the suite.
- **Test:** A LISTEN connection idle for well beyond any default timeout (e.g. >30s, simulate the historical 30s cutoff) is NOT destroyed and still delivers a NOTIFY sent afterward. _(refs: node-postgres#74, node-postgres#311)_
- **Test:** Over a long-lived idle connection with TCP keepalive enabled, notifications continue to be delivered and do not silently stop. _(refs: node-postgres#967, node-postgres#2234, node-postgres#1543, node-postgres#1656)_
- **Test:** If the driver issues a keepalive/heartbeat on the LISTEN connection, it must not open transactions — assert no spurious/idle-in-transaction sessions appear in `pg_stat_activity` and NOTIFY throughput is unaffected. _(refs: node-postgres#2537)_

### Reconnect and re-registration of subscriptions
**Why it matters / failure mode:** On connection drop the listener must reconnect AND re-issue every LISTEN, otherwise it reconnects but is deaf. A v3.3.0 regression broke multi-listener re-registration.
- **Test:** After the LISTEN connection is forcibly dropped, the subscription automatically reconnects, re-registers `LISTEN`, and a NOTIFY sent post-reconnect is delivered. _(refs: postgres.js#35)_
- **Test:** When multiple listeners are bound to the same channel, after a connection drop ALL of them reconnect and each receives subsequent notify events (guard the v3.3.0 multi-listener regression). _(refs: postgres.js#490)_
- **Test:** A dropped LISTEN connection does not surface an unhandled `CONNECTION_CLOSED` write error or unhandled promise rejection during retry; failures are routed to an error/disconnect callback. _(refs: postgres.js#310, postgres.js#315)_

### await/await-resolution semantics of listen
**Why it matters / failure mode:** `listen()` must resolve only after the server has registered the LISTEN, otherwise a NOTIFY sent immediately after the await races and is lost. Repeat listen and result-shape consistency also matter.
- **Test:** `await listen(channel)` resolves only after the backend has confirmed the LISTEN; a NOTIFY sent synchronously after the await completes is reliably received (no race). _(refs: postgres.js#11)_
- **Test:** A second `listen()` on an already-listened channel returns the same shape of result object (e.g. same subscription/unlisten handle) as the first call. _(refs: postgres.js#154)_

### UNLISTEN and connection cleanup
**Why it matters / failure mode:** Unsubscribing must stop delivery, and after the last channel is unlistened + closed the dedicated connection must actually close so the process can exit (a real hang bug).
- **Test:** After `UNLISTEN chan` (or the driver's unlisten handle), subsequent `NOTIFY chan` messages are NOT delivered to that subscriber. _(refs: postgres.js#133)_
- **Test:** After unlisten on the last subscribed channel followed by `sql.close()`, the dedicated LISTEN connection is closed and the Node process can exit cleanly (no lingering open socket). _(refs: postgres.js#1022)_
- **Test:** Using the listener does not emit a Node `DEP0137` FileHandle GC deprecation warning; resources are explicitly released. _(refs: postgres.js#475)_

### Dedicated connection isolation and channel multiplexing
**Why it matters / failure mode:** The LISTEN connection must be dedicated (not borrowed back for transactions/queries, which delays notifications or exhausts the pool), and multiple channels should share one connection.
- **Test:** `listen` uses a dedicated connection that is never handed back to the pool for transactions/queries while subscriptions are active; the pool is not exhausted by listening. _(refs: postgres.js#441)_
- **Test:** Listening on multiple distinct channels multiplexes over a single connection rather than opening one connection per channel; a NOTIFY on each channel routes to the correct subscriber. _(refs: postgres.js#725)_

### NOTIFY within transactions
**Why it matters / failure mode:** `NOTIFY` inside a transaction is queued and only delivered at COMMIT (PG spec). The notify helper must be callable on the transactional sql object, and concurrent in-transaction notifies must not deadlock the pool.
- **Test:** `sql.notify(...)` is callable on the transaction object inside `sql.begin(...)`; the notification is delivered after the transaction commits (and NOT delivered if it rolls back, per PG spec). _(refs: postgres.js#611)_
- **Test:** Many concurrent `notify()` calls issued inside transactions all complete without deadlocking or stalling the pool (the `pg_notify`-based path must not serialize into a deadlock). _(refs: postgres.js#966)_

### Notice messages (RAISE NOTICE) — adjacent async channel
**Why it matters / failure mode:** Distinct from NOTIFY but on the same async message path: server `RAISE NOTICE` must surface as a `notice` event, not be swallowed.
- **Test:** A query/function executing `RAISE NOTICE 'msg'` emits a `notice` event on the client/connection carrying the message text. _(refs: node-postgres#1971)_

### Async-iterable consumption (ergonomics)
**Why it matters / failure mode:** Optional but asserted convenience: consuming notifications via `for await ... of`.
- **Test:** If exposed, an async-iterable subscription yields each NOTIFY payload in order via `for-await-of`, and breaking the loop unlistens/cleans up the subscription. _(refs: postgres.js#168)_

### ✅ Verification notes
Verified: no corrections; coverage complete.


## Cursors & Streaming

_This area covers server-side cursors (DECLARE/FETCH/MOVE portals) and row-streaming APIs (QueryStream / async iterators) that let callers process arbitrarily large result sets with bounded memory. It is high-risk because it sits at the intersection of the extended-query protocol, flow-control/backpressure, transaction scope, pool checkout, and error handling — the exact places where both postgres.js and node-postgres have repeatedly leaked connections, deadlocked, lost rows, or hung forever._

### 1. Cursor read/batch-size semantics
**Why it matters / failure mode:** A cursor exists to bound memory; if `read(n)` returns the whole table, drops the final partial batch, or hangs when `n` exceeds remaining rows, the abstraction is broken. Off-by-one on the last batch and "returns everything" are recurring bugs in BOTH drivers.
- **Test:** `cursor.read(n)` returns at most `n` rows per call and advances the portal; over a 1000-row result with `n=100`, exactly 10 reads of 100 rows each are observed, then an empty read. _(refs: node-postgres#2140, node-postgres#2496, node-postgres#2868)_
- **Test:** When total rows are NOT divisible by batch size (e.g. 25 rows, batch 10), the final partial batch (5 rows) is delivered, not silently dropped; sum of all delivered rows equals 25. _(refs: postgres.js#150, postgres.js#81)_
- **Test:** `cursor.read(N)` with `N` greater than the number of remaining rows returns the remaining rows and signals end (empty array next call) instead of hanging. _(refs: node-postgres#2949, postgres.js#81)_
- **Test:** A configurable `batchSize`/fetch size actually changes the number of rows fetched per `Execute` round-trip (assert via row-count per FETCH or query log), and is independent of how many rows the consumer asks for. _(refs: node-postgres#2097, node-postgres#2549, node-postgres#2253)_

### 2. Async-iterator / for-await consumption
**Why it matters / failure mode:** Modern consumption is `for await (const rows of sql\`...\`.cursor(n))`. The iterator must yield batches, honor `break`, and signal done. Missing `.cursor()`, no `[Symbol.asyncIterator]`, or `cursor.read is not a function` block the primary use case.
- **Test:** A query object exposes a `.cursor()` method; calling it without a callback returns an async-iterable usable in `for await ... of`, yielding batches of the requested size. _(refs: postgres.js#30, postgres.js#75, postgres.js#256, node-postgres#1595)_
- **Test:** `client.query(new Cursor(sql))` returns a cursor exposing both `read(n, cb)` and an awaitable `read(n)` that resolves with a batch and resolves to an empty array when exhausted. _(refs: node-postgres#2410, node-postgres#1839)_
- **Test:** A cursor built from `sql.unsafe(...)`/raw SQL iterates and resolves identically to a templated query (no API divergence). _(refs: postgres.js#149)_
- **Test:** Breaking out of a `for await` cursor loop early stops iteration and triggers cleanup (see §4 early-return). _(refs: postgres.js#75, postgres.js#185)_

### 3. Backpressure & flow control
**Why it matters / failure mode:** Streaming must slow the server to the consumer's pace; otherwise a fast SELECT OOMs a slow consumer. Bugs: QueryStream ignores `highWaterMark` and pushes every row, no pause/resume, or returning a promise from the iterator does not throttle.
- **Test:** Returning a pending promise from a cursor/stream iterator applies backpressure: no further rows are fetched from the server until the promise resolves (assert next FETCH is not issued while the handler is in-flight). _(refs: postgres.js#1, node-postgres#1325)_
- **Test:** A streaming query supports `pause()`/`resume()`; after `pause()` no `data`/`row` events fire until `resume()`. _(refs: node-postgres#460)_
- **Test:** When the consuming Readable's internal buffer exceeds `highWaterMark`, the cursor stops fetching additional batches until the buffer drains (assert FETCH count tracks consumption, not one-row-per-push). _(refs: node-postgres#2135, node-postgres#2472)_
- **Test:** Enqueuing a very large number of write/insert queries applies backpressure rather than buffering them all in memory to OOM. _(refs: node-postgres#1104)_
- **Test:** A stream over a large/slow result set continues emitting batches to completion without stalling after the first few batches. _(refs: node-postgres#3175, node-postgres#2224)_

### 4. Cursor lifecycle: close, double-close, early return, connection leak
**Why it matters / failure mode:** The single most dangerous area. `close()` that hangs, closing twice, or breaking early without releasing the portal leaks pooled connections and eventually deadlocks the whole pool. Multiple HIGH-testability bugs in BOTH drivers.
- **Test:** Calling `close()` on a cursor that is already in done/error state resolves (or rejects) its promise instead of hanging. _(refs: node-postgres#2588, node-postgres#2642)_
- **Test:** Breaking out of / calling `return()` early on a cursor async iterator closes the portal and releases the client back to the pool; a subsequent acquire from a size-1 pool succeeds immediately. _(refs: postgres.js#389, node-postgres#2119)_
- **Test:** Closing the cursor exactly once when an async iteration is interrupted — the close path does not throw on a null `activeQuery`/double-close. _(refs: node-postgres#2119)_
- **Test:** After reading from and closing a cursor, the underlying query result object and its callback are dereferenced so GC can reclaim them (no monotonic heap growth across repeated cursor open/close). _(refs: node-postgres#3497)_
- **Test:** Closing a client mid-cursor does not leave later `pool.query` promises permanently unresolved. _(refs: node-postgres#2148)_

### 5. Error propagation on connection loss / mid-stream failure
**Why it matters / failure mode:** If the backend dies mid-stream, a pending `read()`/`next()` must reject and the stream must emit `error` — not hang forever. Several regressions where 3.x stopped emitting errors that 2.x emitted. Also: a parse error mid-stream must not corrupt the connection.
- **Test:** When the backend is killed mid-stream, the query stream emits an `error` event (and a pending iterator `next()` rejects) rather than hanging — including when multiple connections are open. _(refs: node-postgres#2187, node-postgres#2707, node-postgres#2870)_
- **Test:** If the connection is terminated while a `cursor.read` is outstanding, that read rejects/errors instead of hanging indefinitely; `close()` afterward also resolves rather than waiting for `readyForQuery`. _(refs: node-postgres#2468, node-postgres#2642)_
- **Test:** A QueryStream that errors during row parsing does NOT corrupt the connection: the stream emits `error`, and a subsequent independent query on the same client succeeds. _(refs: node-postgres#1674)_
- **Test:** If the cursor's underlying query errors between batch n and batch n+1, the async iterator throws that error rather than silently completing with fewer rows. _(refs: postgres.js#1166)_
- **Test:** Cursor error handling (`handleError`) does not itself throw (e.g. `Cannot read property 'removeListener'/'name' of null`) when the connection/active query is already null. _(refs: node-postgres#2389, node-postgres#1105, node-postgres#1742)_

### 6. Cursors with transactions, pools & concurrent portals
**Why it matters / failure mode:** A server-side cursor lives inside a transaction on one physical connection. Issuing other work on that same connection mid-cursor, sharing portal names across pooled clients, or running cursors with a full pool causes deadlocks and `portal "C_1" does not exist` collisions.
- **Test:** While a cursor is open on a client, the cursor must be read out or closed before issuing an unrelated query on the SAME connection; the driver enforces/serializes this rather than corrupting the stream (document required close-before-reuse). _(refs: node-postgres#1895)_
- **Test:** Running an additional query on the SAME transaction while iterating a cursor deadlocks on a single connection — the driver must either serialize safely or require a separate connection; concurrent updates while streaming must use a different connection. _(refs: postgres.js#1054, node-postgres#2768)_
- **Test:** Multiple cursors opened within a single transaction each iterate their own result set to completion without interfering. _(refs: postgres.js#65)_
- **Test:** Cursors across multiple pooled clients use isolated/unique portal names so concurrent cursors do not collide with `portal "C_1" does not exist`. _(refs: node-postgres#3136)_
- **Test:** Many sequential cursor queries against a limited-size pool all complete without deadlocking (each cursor releases its client before the next acquires). _(refs: postgres.js#411)_
- **Test:** `pool.query(new Cursor(...))`/`pool.query(new QueryStream(...))` returns a usable cursor/readable stream and automatically checks out and releases the client when finished. _(refs: node-postgres#2782, node-postgres#2013, node-postgres#2469, node-postgres#1070)_
- **Test:** A cursor used in an explicit transaction with autocommit-off fetches only the requested rows and stays open across reads within that transaction. _(refs: node-postgres#1549, node-postgres#2634)_

### 7. Refcursor support
**Why it matters / failure mode:** Stored procedures returning REFCURSOR require `FETCH ALL IN "<name>"` within the same transaction that opened the cursor; a common footgun is a parameter-type error or `<unnamed portal>` failure when the FETCH runs outside that transaction.
- **Test:** Calling a stored procedure/function that returns a refcursor and then `FETCH ALL IN "<cursorname>"` within the SAME transaction yields the cursor's rows without a parameter-type error. _(refs: node-postgres#1137, node-postgres#1476, node-postgres#2466, postgres.js#1134)_

### 8. QueryStream API surface: piping, options, type parsers, fields
**Why it matters / failure mode:** The stream object must be a real Node Readable: `pipe()`/`.on()` present, `destroy()`/`close()` present, options parsed as options (not query values), connection type parsers applied, and field metadata exposed. Several version regressions broke these exact methods.
- **Test:** `client.query(queryStream)` / `pool.query(new QueryStream(sql))` returns a Readable exposing `pipe()` and `.on()` (no `dest.on is not a function` / `Stream.pipe is not a function`). _(refs: node-postgres#2072, node-postgres#2469, node-postgres#317)_
- **Test:** The stream exposes a working lifecycle method for cleanup — `destroy()`/`close()` exist and do not throw on the supported runtime (guard against the 7.17.1 `stream.close/destroy is not a function` regression). _(refs: node-postgres#2067, node-postgres#2068, node-postgres#3546)_
- **Test:** `new QueryStream(sql, options)` treats a trailing options object (`{batchSize, highWaterMark}`) as configuration, not as query parameter values. _(refs: node-postgres#2253)_
- **Test:** Custom type parsers configured on the pool/client are applied to rows emitted by a QueryStream, not only when passed explicitly per-query. _(refs: node-postgres#2270)_
- **Test:** A query stream exposes the result field/column descriptors (names/types) to the consumer. _(refs: node-postgres#3015)_
- **Test:** A QueryStream can be constructed from an existing Cursor instance and streams that cursor's rows. _(refs: node-postgres#2617)_

### 9. Large results: bounded memory & non-blocking event loop
**Why it matters / failure mode:** The headline reason cursors/streams exist. Buffering millions of rows OOMs the heap or blocks the event loop until the SELECT finishes. Single-row/streamed mode must yield to the loop and cap memory.
- **Test:** Streaming a multi-million-row result via cursor/stream completes without exhausting the heap and without blocking the event loop (assert a concurrent timer/event still fires during streaming). _(refs: node-postgres#181, node-postgres#526, node-postgres#1956, node-postgres#1650)_
- **Test:** In single-row/streamed mode, rows are emitted incrementally as they arrive (first row observed well before the query completes), including rows from set-returning functions. _(refs: node-postgres#366, node-postgres#2544, node-postgres#1312)_
- **Test:** The driver provides a way to stream/cap very large individual field values to avoid loading an entire huge row into memory. _(refs: node-postgres#3405)_

### 10. Prepared-statement & multi-command cursor constraints
**Why it matters / failure mode:** Cursors use the extended protocol, which forbids multiple SQL commands in one statement; a clear error (not a hang or corruption) is required, and cursors should interoperate with named prepared statements.
- **Test:** A cursor whose SQL contains multiple statements fails fast with `cannot insert multiple commands into a prepared statement`; a single-statement cursor (including a WITH/CTE query) succeeds and streams rows. _(refs: node-postgres#3285, node-postgres#2520)_
- **Test:** A server-side cursor can be created from / driven by a named prepared statement and streams its rows. _(refs: node-postgres#3007)_

### ✅ Verification notes

**Grounding / hallucination check:** PASS. Every cited ref (across §1–§10) maps to a real record in the issue set; no fabricated refs and no invented expectations. Read/batch semantics (§1), lifecycle/leak (§4), error-on-disconnect (§5), refcursor-in-transaction (§7), and the `cannot insert multiple commands into a prepared statement` constraint (§10) are all correct per PostgreSQL extended-protocol / portal semantics.

**High-signal coverage (kind=bug|regression AND testable=high):** COMPLETE. All 15 high-signal records are present:
- node-postgres: #1674 (§5), #1895 (§6), #2270 (§8), #2588 (§4), #2642 (§4/§5), #2782 (§6), #2870 (§5), #2949 (§1).
- postgres.js: #81 (§1), #149 (§2), #150 (§1), #389 (§4), #411 (§6), #1054 (§6), #1166 (§5).
(postgres.js#1 and node-postgres#1839/#1895 are also covered though some are feature/question, not bug.) No omitted high-signal tests.

**Corrections (2 — semantic framing, expectations otherwise sound):**
1. §6 line 48 (#3136): the *mechanism* stated — "cursors across pooled clients collide on shared portal name `C_1`" — is misleading. Portals are **session-local**; two separate pooled connections cannot collide on a portal name. The real failure behind `portal "C_1" does not exist` is **intra-session portal lifecycle** (the portal/unnamed portal being destroyed by an intervening Sync ending the implicit transaction, or name reuse within one session). The observable assertion (concurrent pooled cursors don't error) is fine, but reframe the "why": give each cursor a unique portal name AND keep it inside an explicit transaction so the portal survives between FETCHes — not "isolate names across clients."
2. §9 line 70 (#3405): expectation is not achievable as written under the v3 wire protocol. A field value is sent as a **single length-prefixed blob inside one `DataRow`**; the driver receives the entire field's bytes in one message and cannot transparently "stream/cap a large individual field value." Bounding memory for huge single values requires application-level chunking (`substring()`/`SELECT ... OFFSET len`) or the large-object (`lo_*`) API, not a generic protocol-level field stream. Reframe as a documented limitation + large-object/SQL-chunk workaround rather than a capability assertion.

**Minor (not counted):**
- §9 line 69 (#366/#2544): "first row observed well before query completes" is **plan-dependent** — top-level Sort/Hash/materialized set-returning functions buffer server-side before the first row ships. Hold the assertion to a streamable plan (e.g. `SELECT` over a seq scan / `generate_series`), not arbitrary SRFs.
- §3 line 24 (#1104): write-query-queue backpressure is tangential to cursors/streaming and asserts behavior real node-postgres does NOT have (it buffers the queue); fine as desired behavior for a new driver, but flag it as aspirational.

Verdict: corrected — coverage complete, two semantic-framing fixes.


## Transactions

_Covers transaction lifecycle (BEGIN/COMMIT/ROLLBACK), error/abort handling, savepoints and nesting, connection isolation under concurrency, isolation levels and locking, autocommit semantics, session state, and the higher-level `begin()` helper API. A driver that gets any of these wrong silently loses or corrupts data, hangs connections, or leaks uncommitted state across requests — so this is the highest-stakes area for correctness._

### 1. Rollback on error & aborted-transaction state
**Why it matters / failure mode:** A statement failing inside a transaction puts the Postgres connection into the aborted state (SQLSTATE 25P02); every subsequent command must error until ROLLBACK/COMMIT. Drivers historically either committed partial work, queued doomed statements, or destroyed the connection without rolling back. BOTH drivers are represented here.
- **Test:** `BEGIN; INSERT a; <failing stmt>; INSERT b` then `COMMIT` — neither row a nor b persists; the failing statement leaves the txn abortable, not committed. _(refs: node-postgres#164, node-postgres#977)_
- **Test:** After a statement errors mid-transaction, the very next query (even a valid `SELECT 1`) must reject with `25P02 current transaction is aborted, commands ignored until end of transaction block` until ROLLBACK/COMMIT is issued. _(refs: node-postgres#1826, node-postgres#2350)_
- **Test:** After a query error inside a transaction, queued/subsequent statements on that client must NOT execute, and the client must still accept and successfully run `ROLLBACK`. _(refs: node-postgres#323, node-postgres#977)_
- **Test:** Issuing `ROLLBACK` mid-transaction undoes all prior statements; a later `COMMIT` on the same connection persists nothing from the rolled-back work. _(refs: node-postgres#1859)_
- **Test:** A failing `ROLLBACK` (e.g. connection already gone) must not throw uncaught / must leave the client in a defined recoverable state, not wedged. _(refs: node-postgres#1778)_
- **Test:** After a successful `ROLLBACK`, a subsequent `BEGIN` on the same client starts a fresh, usable transaction (no lingering `25P02`); the connection is reusable, not wasted. _(refs: node-postgres#2145)_

### 2. Error propagation from transaction helpers
**Why it matters / failure mode:** The `begin()`/transaction-callback abstraction must surface the original PostgresError (message + SQLSTATE) to the caller and never emit unhandled rejections or swallow/cache errors. This cluster is almost entirely postgres.js bugs (kind=bug, testable=high).
- **Test:** An error thrown by a statement inside `sql.begin(...)` rejects the returned promise with the original `PostgresError` (preserving `.code`/message), not a generic or empty error. _(refs: postgres.js#272, postgres.js#830)_
- **Test:** An exception rethrown from inside `sql.begin` propagates that new error, not a cached error from a previous query on the connection. _(refs: postgres.js#289)_
- **Test:** An error that is caught and handled inside the transaction callback must NOT propagate as an uncaught exception / rejected outer promise. _(refs: postgres.js#455)_
- **Test:** `sql.begin()` (or `client.query` in a transaction) on a connection that fails rejects with a catchable error rather than emitting an `UnhandledPromiseRejectionWarning`. _(refs: postgres.js#162, node-postgres#529, node-postgres#2231)_
- **Test:** A `COMMIT` that fails (e.g. deferred-constraint or serialization failure at commit time) rejects the COMMIT promise with the underlying error; it must not become an unhandled rejection. _(refs: node-postgres#1911, node-postgres#1934)_
- **Test:** A failing statement supplied as part of a `sql.begin` array-of-queries / `sql.file` must reject with the Postgres error, not resolve silently. _(refs: postgres.js#830)_
- **Test:** A query that errors inside a transaction (awaited) must reject promptly so the error reaches the `catch` block — it must not hang. _(refs: node-postgres#2231, node-postgres#2350)_

### 3. Connection isolation under concurrency
**Why it matters / failure mode:** A transaction must own a dedicated connection for its full BEGIN→COMMIT span. Sharing a single connection across concurrent transactions interleaves statements and yields `there is already a transaction in progress` / `there is no transaction in progress`. BOTH drivers appear here — a strong signal.
- **Test:** Two concurrent transactions each acquire a distinct connection; statements from one are never interleaved into the other's BEGIN/COMMIT block. _(refs: node-postgres#155, node-postgres#794, postgres.js#274)_
- **Test:** Many rapid concurrent `sql.begin` calls each run on a dedicated connection and complete without raising `UNSAFE_TRANSACTION` or `25001`/`25P01` (`already/no transaction in progress`). _(refs: postgres.js#823, postgres.js#274)_
- **Test:** A query issued on a separate pool connection does NOT observe uncommitted changes made inside another client's open transaction (read-committed default). _(refs: node-postgres#1819, node-postgres#1340)_
- **Test:** Changes made in a `BEGIN` block that is never committed (connection released/closed) are invisible to all other connections and are rolled back. _(refs: node-postgres#1340, node-postgres#1458)_
- **Test:** Statements issued between BEGIN and COMMIT on one acquired client run as a single atomic transaction and roll back together on error. _(refs: node-postgres#84, node-postgres#117, node-postgres#344)_
- **Footgun guard:** Inside `sql.begin`, using the OUTER `sql` (not the transaction-scoped handle) for a query must not deadlock/hang all subsequent queries — it should either run on a separate connection or be detected, never wedge the pool. _(refs: postgres.js#893)_

### 4. Savepoints & nested transactions
**Why it matters / failure mode:** Nested transactions must map to SAVEPOINT / ROLLBACK TO SAVEPOINT; an inner rollback must not abort the outer transaction, and a nested `begin` must never emit an unconditional COMMIT.
- **Test:** `SAVEPOINT s; <stmts>; ROLLBACK TO SAVEPOINT s` undoes only post-savepoint statements; statements before the savepoint still persist on COMMIT. _(refs: node-postgres#637, node-postgres#2647, node-postgres#380)_
- **Test:** A nested `sql.begin` (or `begin()` on an existing transaction) issues a SAVEPOINT, and an inner rollback rolls back only the savepoint while the outer transaction continues and can still COMMIT. _(refs: postgres.js#826, postgres.js#985)_
- **Test:** A `sql.begin` nested inside a manually-started transaction must use savepoints, NOT emit a top-level `COMMIT` that prematurely commits the outer work. _(refs: postgres.js#554)_
- **Test:** Savepoint names are scoped per transaction; reusing the same savepoint name in two separate transactions does not conflict. _(refs: node-postgres#2483)_
- **Test:** `sql.savepoint` usable as a tagged-template for a single inner query within a transaction. _(refs: postgres.js#201)_
- **Test:** Savepoint create / rollback-to / release / COMMIT issued across multiple queries on one retained client all run on the same connection. _(refs: node-postgres#380)_

### 5. Autocommit & implicit transactions
**Why it matters / failure mode:** Without an explicit BEGIN each statement auto-commits individually; a multi-statement simple-query string runs in ONE implicit transaction (a later failure rolls back earlier ones). Drivers must not buffer autocommit inserts or accidentally wrap loops.
- **Test:** Inserts/DELETE issued in a loop without an explicit BEGIN are each independently committed; all persist and are visible on a later SELECT. _(refs: node-postgres#648, node-postgres#741, node-postgres#2658)_
- **Test:** A single simple-query string `BEGIN; ...; COMMIT` executes all statements as one transaction in one round trip. _(refs: node-postgres#2298)_
- **Test:** A multi-statement simple query (`a; b_fails`) runs as one implicit transaction — when `b` fails, `a`'s effects are rolled back (nothing persists). _(refs: node-postgres#2933)_
- **Test:** A `DECLARE CURSOR` followed by a later `FETCH` only survives when wrapped in an explicit transaction; without BEGIN the cursor is gone after autocommit. _(refs: node-postgres#1986)_

### 6. Commit visibility & durability
**Why it matters / failure mode:** Once COMMIT's callback/promise resolves, the data must be durably visible to subsequent reads on the same and other connections; an explicit COMMIT must never be silently rolled back.
- **Test:** After the COMMIT promise/callback resolves, a subsequent SELECT (same or different connection) sees the committed rows. _(refs: node-postgres#1494, node-postgres#1232, postgres.js#395)_
- **Test:** A successful `BEGIN/INSERT/UPDATE/COMMIT` sequence commits atomically; the same flow with an error before COMMIT rolls everything back. _(refs: node-postgres#1504, node-postgres#636)_
- **Test:** If the client connection drops before COMMIT, the server rolls back the open transaction automatically (no partial persistence). _(refs: node-postgres#1458)_

### 7. Transaction status & connection-reuse safety
**Why it matters / failure mode:** The driver must track the server's ReadyForQuery transaction-status indicator (`I`/`T`/`E`) so a pooled connection is only reused when no transaction is left open, and is reset/destroyed when left in `E`.
- **Test:** The client exposes / internally tracks transaction status; a connection returned to the pool with an open or aborted transaction is reset (ROLLBACK) or destroyed, never handed out mid-transaction. _(refs: node-postgres#724, node-postgres#155)_
- **Test:** Awaited `client.query('BEGIN'|'COMMIT'|'ROLLBACK')` on a pooled client correctly commits or rolls back, and `done()`/release is called exactly once after COMMIT on the same retained client. _(refs: node-postgres#1252, node-postgres#344)_

### 8. Isolation levels, serialization failures, locking & deadlocks
**Why it matters / failure mode:** Serializable/repeatable-read conflicts must surface as catchable `40001` errors (not swallowed/unhandled), deadlocks as `40P01`, and lock waits must actually block rather than return early.
- **Test:** Two conflicting SERIALIZABLE transactions: the loser's statement (or its COMMIT) rejects with SQLSTATE `40001 serialization_failure`, delivered to the application. _(refs: node-postgres#1721, node-postgres#1934)_
- **Test:** Concurrent REPEATABLE READ updates guarded by `pg_advisory_xact_lock` on distinct connections serialize and succeed without a `40001` error. _(refs: node-postgres#1625)_
- **Test:** A deadlock surfaces as catchable SQLSTATE `40P01 deadlock_detected`, enabling retry logic. _(refs: node-postgres#2092)_
- **Test:** `LOCK TABLE ... ACCESS EXCLUSIVE` on a second connection blocks until the holder commits/rolls back, then proceeds (no early return, no driver deadlock). _(refs: node-postgres#2096, node-postgres#2605)_
- **Test:** Two clients in separate transactions updating the same row block per Postgres row locking; the waiter's query resolves once the lock is released. _(refs: node-postgres#2605)_
- **Test:** An INSERT violating a `DEFERRABLE INITIALLY DEFERRED` constraint rejects the promise at commit (or at statement) even without an explicit transaction block. _(refs: postgres.js#1117)_

### 9. Session / transaction characteristics & SET state
**Why it matters / failure mode:** Per-connection SET state (read-only mode, role, search_path, custom GUCs) must apply to subsequent queries and have well-defined reset behavior across pool checkouts and after errors.
- **Test:** `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` causes subsequent write statements on that connection to be rejected (`25006 read_only_sql_transaction`). _(refs: node-postgres#569)_
- **Test:** `SET ROLE` (or `SET LOCAL` in a txn) changes the effective role for subsequent statements on that connection, enabling row-level security. _(refs: node-postgres#1598, node-postgres#1845)_
- **Test:** Defined search_path behavior: a `SET search_path` on a pooled connection persists across a subsequent failed query OR the connection is documented/observed to reset — assert the chosen, consistent semantics. _(refs: node-postgres#1584)_
- **Test:** `SET CONSTRAINTS ... DEFERRED` executes correctly inside a `sql.begin` block and affects constraint timing within that transaction. _(refs: postgres.js#146)_

### 10. begin()/transaction helper API semantics
**Why it matters / failure mode:** The high-level helper must COMMIT on success, ROLLBACK on thrown error, support graceful (non-throwing) rollback, lazy BEGIN, manual commit, and reserved connections — all postgres.js feature/bug requests.
- **Test:** `sql.begin(cb)` COMMITs when `cb` resolves and ROLLBACKs when `cb` throws/rejects; the connection is returned usable afterward. _(refs: node-postgres#1126, node-postgres#1504, postgres.js#500)_
- **Test:** A graceful rollback signal (e.g. returning a rollback sentinel) rolls the transaction back WITHOUT throwing and leaves the connection usable. _(refs: postgres.js#500)_
- **Test:** With lazy transactions, `BEGIN` is sent only when the first query runs; an empty `sql.begin` callback issues no BEGIN/COMMIT/ROLLBACK at all. _(refs: postgres.js#565)_
- **Test:** Manual-commit API: a transaction started in one scope can be committed/rolled back later (e.g. across middleware) on the same reserved connection. _(refs: postgres.js#700)_
- **Test:** A reserved/checked-out connection supports `begin()`/transactions (or its type does not advertise methods it lacks), and allows `PREPARE TRANSACTION` without tripping the `UNSAFE_TRANSACTION` guard. _(refs: postgres.js#713, postgres.js#626)_

### 11. postgres.js pipeline & fragment regressions
**Why it matters / failure mode:** Tagged-template pipelining inside transactions has produced duplicate execution, unsettled promises, and eager fragment evaluation — high-testability bugs unique to a template-based driver.
- **Test:** A loop of inserts inside `sql.begin` inserts each row exactly once — never twice (no double pipeline send). _(refs: postgres.js#352)_
- **Test:** An `sql`` ` fragment built from the outer `sql` but used inside `sql.begin` defers execution to the transaction; it must not run immediately on the outer connection. _(refs: postgres.js#333)_
- **Test:** A parameter-build error on a non-first statement in a pipelined transaction array rejects the promise rather than hanging forever. _(refs: postgres.js#1082)_
- **Test:** A long-running transaction must not be killed by `idle_timeout`/`max_lifetime` while active, and must not block unrelated queries beyond those configured windows. _(refs: postgres.js#608)_
- **Test:** A long/slow transaction whose connection the server closes (EOF) rejects the `sql.begin` promise with an error — it must not silently terminate the process. _(refs: postgres.js#658)_

### ✅ Verification notes

**Grounding & coverage:** Every test traces to a cited issue; no hallucinated cases found. All HIGH-signal records (kind=bug AND testable=high) are covered: node-postgres #380(§4), #977(§1), #1721(§8), #1934(§2/§8), #2231(§2); postgres.js #272(§2), #289(§2), #333(§11), #352(§11), #455(§2), #554(§4), #826(§4), #830(§2), #1082(§11), #1117(§8). No omitted bug/high refs.

**Corrections (expected-behavior accuracy):**
- §8, REPEATABLE READ + `pg_advisory_xact_lock` (ref node-postgres#1625): the stated expectation "serialize and succeed **without a 40001**" is NOT guaranteed by PostgreSQL. In REPEATABLE READ the transaction snapshot is pinned at the first non-control statement. If `SELECT pg_advisory_xact_lock(...)` is that first statement, the snapshot is established *before* the lock blocks; after the holder commits and the waiter proceeds, its UPDATE sees the concurrently-modified row and can still raise `40001 serialization_failure`. The "no 40001" outcome is only reliable under READ COMMITTED, or if the advisory lock is acquired in a separate prior transaction (before the RR snapshot). Test should set isolation to READ COMMITTED for the lock-serialization assertion, or assert that 40001 is *possible* under RR and must be catchable/retryable.
- §3 test 2: "without raising `UNSAFE_TRANSACTION` or `25001`/`25P01` (already/no transaction in progress)" — `25001 active_sql_transaction` ("there is already a transaction in progress") and `25P01 no_active_sql_transaction` ("there is no transaction in progress") are server **WARNINGs/NOTICEs**, not errors that get "raised"/reject a query. They won't surface as thrown errors; the real, assertable failure mode of interleaving is corrupted/missing rows and out-of-order BEGIN/COMMIT, not these SQLSTATEs. Reword to assert on interleaving effects (and on the driver's own `UNSAFE_TRANSACTION` guard) rather than expecting these codes to be thrown.

**Minor (non-blocking):** §5 #2933 and §5 #2298 expectations are correct *only* for the simple-query protocol (semicolon-joined statements in one Query message); keep the tests explicitly on simple query, since the extended protocol does not wrap separate Execute messages in one implicit transaction. §9 #146 embellishes the bare record ("DEFERRED ... affects constraint timing") beyond the issue's "SET CONSTRAINTS executes within sql.begin" — harmless but slightly beyond grounding.


## Cancellation & Timeouts

_This area covers the driver's ability to bound how long it waits for connections and queries, to enforce server-side timeouts (`statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`), and to actively cancel in-flight queries via the PostgreSQL CancelRequest protocol or AbortSignal. Getting this wrong leaves connections hung, leaks timers, terminates healthy backends, or crashes the process with uncatchable errors — all production-fatal._

### Connect timeout (TCP + startup phase)
**Why it matters / failure mode:** Without a driver-enforced connect timeout, `connect()` hangs on the OS-level TCP timeout (often 30s+) or indefinitely when a host accepts the socket but stalls during the startup/auth handshake. Both drivers have shipped bugs here.
- **Test:** With `connectionTimeoutMillis`/`connect_timeout` set to N ms against an unroutable/blackholed host, `connect()` rejects with a timeout error in ~N ms (not the 30s default, not infinity). _(refs: node-postgres#397, node-postgres#2040, postgres.js#79)_
- **Test:** When the TCP connection is accepted but the server never completes the startup handshake (stalls before AuthenticationOk/ReadyForQuery), `connect()` still rejects at `connectionTimeoutMillis` and does not block the event loop. _(refs: node-postgres#3197, node-postgres#3348)_
- **Test:** `connect_timeout` is honored whether supplied via config object, connection-string parameter, or the `PGCONNECT_TIMEOUT` env var, with the same observable deadline. _(refs: node-postgres#2040, postgres.js#79)_
- **Test:** On connect-timeout rejection, the underlying socket is destroyed and no half-open connection or dangling timer is leaked. _(refs: node-postgres#3197)_

### Pool acquisition timeout
**Why it matters / failure mode:** A separate concern from connect timeout — when the pool is at `max` and all clients are checked out, an acquire must fail fast rather than wait forever. Repeatedly reported as "not working."
- **Test:** With pool at capacity and `connectionTimeoutMillis = N`, a `pool.connect()` that finds no free client rejects with a timeout error after ~N ms while still queued. _(refs: node-postgres#805, node-postgres#1390, node-postgres#1984, node-postgres#2712)_
- **Test:** A request waiting in the pool queue is rejected exactly when its `connectionTimeoutMillis` elapses, and its queue slot is removed (a later freed client is not handed to the already-timed-out waiter). _(refs: node-postgres#2712, node-postgres#1390)_

### Server-side session timeouts (statement_timeout / lock_timeout / idle_in_transaction)
**Why it matters / failure mode:** Timeout GUCs set in client/pool config must actually be applied to every session. Multiple bugs show the value silently ignored, not applied to native client, or not set on Neon/pooled connections.
- **Test:** Setting `statement_timeout` in client options applies to the session — `SHOW statement_timeout` returns the configured value. _(refs: node-postgres#1536)_
- **Test:** `statement_timeout`, `lock_timeout`, and `idle_in_transaction_session_timeout` set via pool config are applied to *each* new pooled connection; `SHOW <guc>` on any checked-out client returns the configured value. _(refs: node-postgres#3604, node-postgres#2381)_
- **Test:** A query exceeding `statement_timeout` is cancelled by the server and the client receives an error with SQLSTATE `57014` (query_canceled); the backend stops executing the statement. _(refs: node-postgres#3139, node-postgres#518)_
- **Test:** A per-query `statement_timeout` override (e.g. `SET LOCAL` / per-statement option) is honored independently of the pool-level default, and does not mutate the default for subsequent queries on the same connection. _(refs: node-postgres#2016)_
- **Test:** When using the native (pg-native) backend, a configured `statement_timeout` is still enforced on a long-running query. _(refs: node-postgres#2103)_
- **Test:** A backend reading/writing data (ClientRead) is not allowed to hang indefinitely past `statement_timeout` — note PG only counts execution time, so the test must assert against the documented semantics, not assume ClientRead is timed out. _(refs: node-postgres#1952)_

### idle_in_transaction_session_timeout error must be catchable
**Why it matters / failure mode:** When the server terminates a connection for being idle in a transaction, the driver must surface a catchable error at the query callsite — postgres.js threw it as an uncaught exception that crashed the process.
- **Test:** Open a transaction, idle past `idle_in_transaction_session_timeout`; the next query (or the in-flight await) rejects with a catchable error (SQLSTATE `25P03`), never an uncaught exception / unhandledRejection. _(refs: postgres.js#1133, node-postgres#2381)_
- **Test:** After such a termination the pool discards the dead connection and a subsequent `pool.query` succeeds on a fresh connection. _(refs: postgres.js#1133, node-postgres#3604)_

### Client-side query timeout (driver-enforced `query_timeout`)
**Why it matters / failure mode:** Independent of server GUCs, the driver's own `query_timeout` guards against an unresponsive server. This is the single most bug-prone bucket: callbacks assumed where none exist, timers leaked, cursors/streams crashing.
- **Test:** With `query_timeout = N`, a query that runs longer rejects with a timeout error after ~N ms, and the unresponsive connection is terminated (or a CancelRequest is issued) rather than left hanging. _(refs: node-postgres#1713, node-postgres#1954)_
- **Test:** A `query_timeout` firing on a submittable that has **no callback** (e.g. QueryStream, Cursor) emits an `error` event / rejects — it must NOT throw `queryCallback is not a function`. This regression hit both QueryStream and Cursor paths. _(refs: node-postgres#1860, node-postgres#3475)_
- **Test:** When a query stream or cursor completes or is destroyed normally before timeout, the `query_timeout` timer is cleared so the process can exit cleanly (no leaked timer keeping the event loop alive). _(refs: node-postgres#3219)_
- **Test:** A client-side socket/query timeout aborts a hung query when the server stops responding mid-result, independent of any `statement_timeout`. _(refs: node-postgres#3124, postgres.js#394)_
- **Test:** A per-query timeout option on `pool.query` aborts only that single query after the timeout, without affecting other queries or the pool default. _(refs: node-postgres#2652, node-postgres#1139)_
- **Footgun to guard:** Slow consumption between cursor `read()` calls must NOT trip a client-side timer if the statement stays active — only true inactivity should fire the timeout. _(refs: node-postgres#2183)_

### Active query cancellation (CancelRequest protocol)
**Why it matters / failure mode:** Cancelling a long-running query requires opening a *separate* connection and sending a CancelRequest with the target backend's PID and secret key. JS bindings historically failed to cancel at all.
- **Test:** Issuing a cancel on a side connection for an in-progress long query aborts it; the original query rejects with SQLSTATE `57014` (query_canceled). Verify under both pure-JS and native bindings. _(refs: node-postgres#753, postgres.js#234, node-postgres#1954)_
- **Test:** `cancel` forwards the correct backend PID and cancel key derived from the target client's startup response (not a stale/other connection's). _(refs: node-postgres#579)_
- **Test:** There is a reliable way to cancel a running query on a specific pooled backend (its PID), and after cancellation that pooled connection returns to a usable state or is recycled. _(refs: node-postgres#2261)_
- **Test:** Returning a stop signal from within a row handler mid-stream cancels the active query promptly rather than buffering the entire result. _(refs: node-postgres#773)_

### AbortSignal integration
**Why it matters / failure mode:** Modern callers expect to pass an `AbortSignal` to `query()`; aborting must translate into a CancelRequest and a rejected promise.
- **Test:** Passing an already-aborted `AbortSignal` to `query()` rejects immediately without sending the query to the server (or cancels it instantly), with an AbortError. _(refs: node-postgres#2625, node-postgres#2774)_
- **Test:** Aborting the signal while a query is in flight cancels the in-flight query via CancelRequest and rejects the promise with an AbortError; the query is observably cancelled server-side (SQLSTATE `57014`). _(refs: node-postgres#2774)_
- **Test:** After an aborted query, the connection is left in a clean state (drained to ReadyForQuery) and reusable for the next query. _(refs: node-postgres#2774, node-postgres#2261)_

### Long-running queries must not be killed by the driver
**Why it matters / failure mode:** The inverse failure — a legitimately long query (minutes) must keep running and return results, not be silently dropped to idle by an over-eager driver/idle timeout.
- **Test:** A multi-minute query with no client-side timeout configured stays active and returns its full result; the connection is not flipped to idle or terminated by `idleTimeoutMillis`/keepalive logic while the query is executing. _(refs: node-postgres#1398, node-postgres#1984)_

### ✅ Verification notes
- Expected behaviors check out against PostgreSQL semantics: SQLSTATE 57014 (query_canceled) for statement_timeout / CancelRequest / AbortSignal cancellation, and 25P03 (idle_in_transaction_session_timeout) for the idle-in-tx termination — both correct.
- Line 24 (ClientRead vs statement_timeout): the hedge is correct — statement_timeout only counts server execution time, not time blocked in ClientRead, so the test rightly asserts documented semantics rather than assuming a ClientRead backend is timed out. Keep as-is.
- All HIGH-signal bug issues are covered: node-postgres#753 (line 42), #1536 (line 19), #1860 + #3475 (line 34), postgres.js#1133 (lines 28-29). No high-signal omissions.

Minor grounding corrections (mis-cited refs, expectations themselves are fine):
- Line 55: ref node-postgres#1984 is mis-applied — #1984 is about pool-acquisition timeout, not protecting a long-running query from idle termination. Drop #1984 here; #1398 already covers this correctly.
- Line 29: ref node-postgres#3604 is mis-applied — #3604 is a GUC-application bug, not pool dead-connection recovery. The postgres.js#1133 ref already grounds the catchable-error case; pool recovery after termination isn't strongly grounded in any listed record.
- Line 9: PGCONNECT_TIMEOUT (libpq env var) is specified in SECONDS, not milliseconds — the test should account for the unit difference when asserting the observable deadline vs config-object `connectionTimeoutMillis`.


## Errors & Notices

_Covers how the driver surfaces server `ErrorResponse`/`NoticeResponse` messages, connection/protocol failures, and internal faults: error object shape and SQLSTATE fields, error-class identity, catchability (promise/callback vs uncatchable `'error'` events), NOTICE/WARNING routing, post-error connection state, and stack traces. This is the highest-volume bucket (162 issues) and the single biggest source of process crashes and "swallowed" failures in both drivers, so a new driver must get it deterministically right._

### Error object shape & SQLSTATE fields
**Why it matters / failure mode:** Apps branch on `error.code` and read `detail`/`constraint`/`table` etc. Both drivers historically had inconsistent field names (esp. JS vs native: `.sqlState` vs `.code`), non-enumerable fields that print as `{}`, and missing 9.3+ fields. Get the field contract stable and serializable.
- **Test:** A unique-violation (`INSERT` duplicate PK) rejects with an error whose `.code === '23505'` and exposes `detail`, `constraint`, `table`, `schema` strings from the server. _(refs: node-postgres#1602, node-postgres#1697, postgres.js#675)_
- **Test:** `error.code` (not `.sqlState`) is the SQLSTATE for every failure path and is identical regardless of backend (native vs JS): e.g. `CREATE TABLE` of an existing table → `'42P07'`. _(refs: node-postgres#736, node-postgres#919, node-postgres#938, node-postgres#982, node-postgres#972)_
- **Test:** A syntax error (`SELECT * FROM`) exposes `.code === '42601'` and a numeric `.position` indexing into the query text. _(refs: node-postgres#2025, node-postgres#2484, node-postgres#3000, node-postgres#1619)_
- **Test:** Missing-relation query exposes `.code === '42P01'`; missing-column → `'42703'`; unknown function → `'42883'`; integer overflow → `'22003'`; bad integer input (`'NaN'`/`'stock'`) → `'22P02'`. _(refs: node-postgres#2077, node-postgres#1320, node-postgres#1662, node-postgres#2752, node-postgres#2310, node-postgres#2730)_
- **Test:** Verbose 9.3+ fields (`schema`, `table`, `column`, `dataType`, `constraint`, `hint`) are present when the server sends them (e.g. NOT-NULL violation, trigger error). _(refs: node-postgres#701, node-postgres#978, node-postgres#1961)_
- **Test:** All error fields (`code`, `severity`, `detail`, `hint`, `position`, `constraint`) are enumerable so `console.log(err)` / `JSON.stringify` shows them rather than `{}`. _(refs: node-postgres#347, node-postgres#318, postgres.js#696, postgres.js#767)_
- **Test:** `error.message` equals the human-readable server text (e.g. `column "x" does not exist`); `RAISE EXCEPTION 'msg'` yields `.message === 'msg'` and `.code === 'P0001'`. _(refs: node-postgres#186, node-postgres#596, node-postgres#318, node-postgres#2760)_
- **Test:** The error carries the originating SQL text (and bound parameters) it was issued with, accessible as a stable property. _(refs: node-postgres#881, node-postgres#3069, node-postgres#2201, postgres.js#17, postgres.js#914)_

### Error-class identity & exports
**Why it matters / failure mode:** Consumers use `instanceof` and a named class. Both drivers had requests to expose a public class; the class must subclass `Error` with a stack and a correct `.name`.
- **Test:** Every server error is `instanceof Error` and `instanceof <ExportedDbErrorClass>`; the class is exported from the package's main entry point. _(refs: node-postgres#50, node-postgres#2340, node-postgres#2378, postgres.js#226, node-postgres#700, node-postgres#2239)_
- **Test:** A database error's `.name === 'DatabaseError'` (matches its constructor) and it carries a non-empty `.stack`. _(refs: node-postgres#2606, node-postgres#50)_
- **Test:** Client/driver-level errors (not from the server) are a distinct error subclass carrying a stable machine-readable `.code` (e.g. `UNDEFINED_VALUE`) so they are programmatically matchable. _(refs: node-postgres#2722, node-postgres#3380, postgres.js#1140, postgres.js#450)_
- **Test:** Named SQLSTATE constants are exported and equal the runtime `error.code` values. _(refs: node-postgres#2660)_

### Catchable error propagation (promise/callback, never uncatchable)
**Why it matters / failure mode:** The dominant crash class in BOTH drivers — errors emitted as an `'error'` event with no listener throw and kill the process. Every error path must be deliverable to the awaiting promise/callback.
- **Test:** A failing query rejects exactly the returned promise (or fires its callback once) — `await sql\`SELECT * FROM no_such_table\`` rejects with `42P01` and does NOT emit an unhandled rejection or pool `'error'`. _(refs: node-postgres#2156, node-postgres#2077, postgres.js#37)_
- **Test:** A connection dropped mid-query (admin terminate / server restart) rejects the in-flight query with a connection error even when NO `client.on('error')` listener is attached, and the process stays alive. _(refs: node-postgres#2191, node-postgres#2190, node-postgres#795, node-postgres#2514, postgres.js#37, postgres.js#854)_
- **Test:** `client.query()` before `connect()` rejects with a catchable Error instead of crashing the host process. _(refs: node-postgres#2272, node-postgres#2691)_
- **Test:** An emitted client/pool `'error'` with no registered listener does NOT crash the process (default no-op listener). _(refs: node-postgres#3630, node-postgres#41, node-postgres#609)_
- **Test:** A pooled connection that errors while idle (server restart, idle-in-transaction timeout) is delivered to the pool/client `'error'` handler; listeners are cleaned up on release. _(refs: node-postgres#2029, node-postgres#2439, node-postgres#3202, node-postgres#2852)_
- **Test:** Connect failures are consistent across paths: a `connect()` failure via callback must NOT also emit a separate Client `'error'` event (no double delivery), and promise/callback/event surfaces agree. _(refs: node-postgres#1527, node-postgres#1624, node-postgres#1841)_
- **Test:** Connection-level failures surface as system errors (`ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`) while SQL failures carry a SQLSTATE — the two are distinguishable. _(refs: node-postgres#1705, node-postgres#1416, node-postgres#3334)_
- **Test:** An error thrown inside a type parser (incl. during a prepared statement) rejects the query promise rather than throwing on a later tick or an internal `Cannot read property sync of undefined`. _(refs: node-postgres#1204, node-postgres#1241, node-postgres#549)_
- **Test:** An "unexpected termination" error includes the original underlying error as `.cause`. _(refs: node-postgres#3621, node-postgres#2522, node-postgres#1790)_

### Protocol / non-Postgres connection must not crash uncatchably
**Why it matters / failure mode:** Connecting to MySQL/a wrong port, TLS drops, or oversized rows threw synchronous, uncatchable assertions in both drivers (`handleEmptyQuery`, `Cannot read property 'name' of undefined`, V8 string-length throw).
- **Test:** Connecting to a non-Postgres service (e.g. MySQL/HTTP port) rejects `connect()` with a clear protocol error — no `TypeError`/assertion thrown synchronously in the stream data handler. _(refs: node-postgres#2168, node-postgres#2627, node-postgres#3570, postgres.js#250)_
- **Test:** A server termination received over TLS is emitted as a handleable error, not thrown synchronously inside the socket `'data'` listener. _(refs: node-postgres#2820)_
- **Test:** Reading a row value larger than the V8 string limit (`0x1fffffe8`) rejects the query rather than throwing an uncatchable error. _(refs: node-postgres#2653)_
- **Test:** A malformed/oversized `ErrorResponse` is decoded without the C-string field parser throwing (e.g. produces a real error, not `syntax error at end of input`). _(refs: node-postgres#1708, node-postgres#2922, node-postgres#2005)_
- **Test:** An `ErrorResponse` during startup (`database system is starting up`, `08006`/`57P03`) rejects the connect/query instead of crashing the client. _(refs: postgres.js#52, postgres.js#1086, node-postgres#383)_

### NOTICE / WARNING / INFO delivery
**Why it matters / failure mode:** Server notices were printed to stdout/stderr or constructed as `Error`s, and native bindings didn't emit them at all. Notices must be structured, routable, and silenceable — and never leak to the console.
- **Test:** `RAISE NOTICE`/`RAISE WARNING`/`RAISE INFO` from a function or trigger fires a `'notice'` event whose payload is a notice/message object (with `message`, `severity`), NOT an `Error` and NOT a plain string. _(refs: node-postgres#716, node-postgres#1034, node-postgres#1544, node-postgres#1982, node-postgres#1735)_
- **Test:** Server NOTICEs (e.g. `CREATE TABLE IF NOT EXISTS` on an existing table, `TRUNCATE`, `VACUUM VERBOSE`, `auto_explain` LOG) are delivered via the notice handler and never printed to stdout/stderr — identical behavior across native and JS backends. _(refs: node-postgres#737, node-postgres#752, node-postgres#3358, node-postgres#2006, node-postgres#1712, node-postgres#1799, postgres.js#546)_
- **Test:** Disabling notices (`onnotice: false` / no-op handler) silences console output entirely. _(refs: postgres.js#1063, postgres.js#646)_
- **Test:** NOTICE messages raised during a query are also exposed on that query's result object, correlated to their source query. _(refs: node-postgres#1842, node-postgres#1226)_
- **Test:** A NOTICE arriving after the query result already resolved does not escape an enclosing `try/catch` as an unhandled error. _(refs: postgres.js#513)_

### Event & callback semantics (no double-fire, defined end-after-error)
**Why it matters / failure mode:** A long-standing regression-prone contract: `'end'` firing (or not) after `'error'`, and callbacks invoked twice. Pick one contract and hold it across versions.
- **Test:** A query that errors delivers the error exactly once — callback/promise fires once; `'error'` and `'end'` are not both emitted for the same query. _(refs: node-postgres#547, node-postgres#565, node-postgres#590, node-postgres#262, node-postgres#900)_
- **Test:** `client.end()` called from inside a query error handler closes the connection cleanly without `listener must be a function` / `this.callback is not a function`. _(refs: node-postgres#1191, node-postgres#1841)_

### Stack traces point to the caller
**Why it matters / failure mode:** Both drivers truncated stacks to internal frames, making errors untraceable. The stack must reach the application call site.
- **Test:** An error from `query()`/`Pool.query()`/async connect includes a stack frame in the calling application file/line, not only internal driver frames. _(refs: node-postgres#1762, node-postgres#1793, node-postgres#1794, node-postgres#2470, node-postgres#2622, node-postgres#3313, postgres.js#963)_
- **Test:** An error from a named/internal query (e.g. internal type/array fetch) surfaces the real server error rather than crashing on undefined `query.origin`; the query name is attached for debugging. _(refs: postgres.js#202, postgres.js#279, postgres.js#923, postgres.js#1068, node-postgres#2866)_

### Connection state integrity after an error
**Why it matters / failure mode:** After a recoverable SQL error the same physical connection must stay usable and correct; node-postgres regressed to a permanently-closed client, and postgres.js leaked partial-stream row state.
- **Test:** After a query fails with a data/constraint error, the SAME `Client` remains queryable for subsequent queries (not permanently closed). _(refs: node-postgres#3104)_
- **Test:** After a query fails mid-stream on a single connection, the next query on that connection returns the correct full result set (row counter/state fully reset). _(refs: postgres.js#1119)_
- **Test:** A constraint violation inside an `INSERT ... WITH` (CTE) and a malformed `UPDATE ... SET` reject with the proper Postgres error rather than being swallowed or crashing the parser. _(refs: node-postgres#2467, node-postgres#2624)_

### Internal null-state crash guards (input-validated, not assertion-thrown)
**Why it matters / failure mode:** Race/error conditions produced `Cannot call method ... of null/undefined` deep in protocol handling, often in infinite loops. These are guarded internal states, asserted via behavior under stress.
- **Test:** Receiving `CommandComplete`/`ParseComplete`/`RowDescription`/`DataRow` with no active query (post-error, out-of-order protocol) does not throw a null-reference crash or loop. _(refs: node-postgres#87, node-postgres#949, node-postgres#970, node-postgres#2705, postgres.js#216, postgres.js#250, postgres.js#349)_
- **Test:** Building a `PostgresError` for a duplicate-key/severed-connection case does not throw `Cannot redefine property: parameters/query` or `origin.replace of undefined` — the real error propagates. _(refs: postgres.js#854, postgres.js#675, postgres.js#896, postgres.js#923, postgres.js#924, postgres.js#1068)_
- **Test:** pg-pool tolerates a non-Error thrown object (read-only `message`) without throwing `Cannot set property message`. _(refs: node-postgres#3373)_
- **Test:** Inserting a type-mismatched value (string into `int` column) surfaces the server error and never fails silently. _(refs: node-postgres#18, node-postgres#885)_

### ✅ Verification notes
SQLSTATE mappings and protocol claims spot-checked against PostgreSQL semantics; the high-signal bug/regression+testable=high set is fully covered (refs #565, #590, #736, #737, #752, #795, #938, #1204, #1241, #1527, #1982, #2191, #2691, #3104, postgres.js#1063, postgres.js#1119 all present). SQLSTATEs are all correct: 23505 unique_violation, 42P07 duplicate_table, 42601 syntax_error, 42P01 undefined_table, 42703 undefined_column, 42883 undefined_function, 22003 numeric_value_out_of_range, 22P02 invalid_text_representation, P0001 raise_exception, 53200 out_of_memory, 57P03 cannot_connect_now. V8 max-string constant 0x1fffffe8 is correct. Unique-violation field set (schema/table/constraint/detail, no column) and NOT-NULL field set (column/table/schema) are accurate.

Two corrections:
- **Line 72 mis-cites node-postgres#885.** #885's actual intent is "querying `information_schema.tables` should return rows, not throw 'Cannot read property getTypeParser of undefined'" — a catalog/type-parser bug, NOT a type-mismatch insert. It is wrongly grouped with #18 ("string into int column surfaces an error"). #885 should either be dropped from this test or given its own test (a system-catalog query that exercises the type-parser path returns rows without crashing). As written its real content is unrepresented.
- **Line 46 — `auto_explain` LOG (#1799) expectation is misleading per PG semantics.** auto_explain emits at LOG level (`auto_explain.log_level` default = LOG). With the default `client_min_messages = NOTICE`, LOG-level messages are NOT sent to the client as a NoticeResponse (LOG sorts below NOTICE in the client ordering); they go to the server log only. So they will NOT reach the driver's 'notice' handler unless `client_min_messages` is lowered to `log` (or below). The test groups auto_explain LOG with NOTICE/INFO sources as if delivery were automatic — qualify it (lower client_min_messages) or it will fail/mislead. (By contrast VACUUM VERBOSE emits INFO, which is always client-delivered, and CREATE TABLE IF NOT EXISTS / TRUNCATE CASCADE emit NOTICE — those are correct.)

Coverage: all high-signal (bug/regression, testable=high) refs present — no omissions.


## Results

_This area covers how the driver materializes server responses into JavaScript: result/row shape, `rowCount`/command-tag semantics, field metadata, RETURNING data, duplicate/case-sensitive column handling, multiple result sets, empty results, and optional row transforms. These are the contract every consumer depends on; small deviations here silently corrupt application data._

### Duplicate column names (object collapse)
**Why it matters / failure mode:** Joins and `SELECT 1,1` produce repeated column names; building a plain object keys later columns over earlier ones, silently dropping or swapping values. This is the single largest cluster and hits BOTH drivers (node-postgres + postgres.js), so it is a strong-signal must-fix.
- **Test:** `SELECT 1 AS x, 2 AS x` in default object row mode returns the rightmost value (`{ x: 2 }`) deterministically (last column wins, never "last non-null"). _(refs: node-postgres#3189, node-postgres#3062)_
- **Test:** The same query in array `rowMode` returns `[1, 2]` preserving BOTH values and column order. _(refs: node-postgres#280, node-postgres#593, node-postgres#1054, node-postgres#2237, node-postgres#2837, node-postgres#1973)_
- **Test:** `result.fields` always lists every column (length 3 for `SELECT 1,2,3` / `?column?` duplicates), even when the object collapses them. _(refs: node-postgres#1539, node-postgres#2138)_
- **Test:** A LEFT JOIN selecting same-named columns from two tables exposes both values via array mode and does not let a NULL from one side overwrite a non-null from the other in last-wins order. _(refs: node-postgres#1050, node-postgres#1136, node-postgres#1305, node-postgres#1336, node-postgres#1516, node-postgres#2377, postgres.js#173)_
- **Footgun to guard:** Regression #3189 changed last-non-null to last-column-wins. Lock the rule as "rightmost column in select list wins" and add a snapshot test so it cannot silently flip again.

### RETURNING and affected-row data
**Why it matters / failure mode:** Apps rely on `INSERT/UPDATE/DELETE ... RETURNING` to fetch generated keys; a common bug is returning an empty `rows` array or only the first of many rows.
- **Test:** `INSERT ... RETURNING id` (serial) resolves with `result.rows[0].id` set to the generated value. _(refs: node-postgres#9, node-postgres#69, node-postgres#669, node-postgres#1067, node-postgres#1234, node-postgres#1269, node-postgres#1424, node-postgres#1640)_
- **Test:** `INSERT` WITHOUT RETURNING yields `rows: []` but `rowCount: 1`; the same insert WITH RETURNING yields the inserted row. _(refs: node-postgres#633, node-postgres#1640)_
- **Test:** `DELETE ... WHERE id IN ($1,$2) RETURNING *` returns ALL matched rows (length 2), not just the first. _(refs: node-postgres#989)_
- **Test:** `INSERT ... ON CONFLICT DO UPDATE ... RETURNING *` returns the upserted row and `rowCount: 1`. _(refs: node-postgres#974, node-postgres#1546)_
- **Test:** `INSERT ... SELECT ... RETURNING` returns each inserted row and a `rowCount` equal to rows inserted. _(refs: node-postgres#1405)_

### rowCount and command tag semantics
**Why it matters / failure mode:** `rowCount` must come from the server command tag, be a real number, and match server semantics; drivers have shipped `NaN`, `null`, and 0/1 mismatches.
- **Test:** UPDATE/DELETE affecting zero rows reports `rowCount: 0` (not undefined), so callers can detect no-op. _(refs: node-postgres#59, node-postgres#79?, node-postgres#121)_
- **Test:** For `SELECT`, `rowCount === rows.length`; never `rowCount:1` with empty rows. _(refs: node-postgres#979, node-postgres#2182)_
- **Test:** `rowCount` is always a JS `number` (or `null` only when the server omits a count), never `NaN`. Parse the integer from the command tag (`INSERT 0 5`, `DELETE 100`). _(refs: node-postgres#708, node-postgres#1245, node-postgres#1330, node-postgres#3352)_
- **Test:** DDL (`CREATE TABLE`) returns `command: 'CREATE'`, `rows: []`, `rowCount: null`. _(refs: node-postgres#2001)_
- **Test:** An anonymous `DO $$ ... $$` block returns `command: 'DO'` with no row data, even if it performs internal upserts. _(refs: node-postgres#2824)_
- **Test:** UPDATE/DELETE values reflect the server's reported affected count even when triggers redirect/delete the row (assert it equals the command-tag value, not the trigger's behavior). _(refs: node-postgres#2094, node-postgres#2504)_

### Result and row object shape
**Why it matters / failure mode:** Consumers destructure `result.rows`/`result.fields` and `JSON.stringify` rows; non-plain prototypes or array-with-hidden-props shapes break serialization and confuse logging. Affects BOTH drivers (postgres.js exposes an array-with-metadata).
- **Test:** Parsed rows are plain objects (`Object.getPrototypeOf(row) === Object.prototype`), not instances of a generated constructor; `JSON.stringify(row)` yields all column keys. _(refs: node-postgres#685, node-postgres#707, node-postgres#1131, node-postgres#1409)_
- **Test:** node-postgres-style result exposes `{ rows, fields, command, rowCount }`; destructuring a missing prop yields `undefined` rather than throwing. _(refs: node-postgres#3362, node-postgres#3408, node-postgres#216)_
- **Test:** postgres.js-style result is an array of row objects with documented `count`/`columns`/`command`; define and test the enumerability/serialization of those metadata props so `JSON.stringify` behavior is stable. _(refs: postgres.js#147, postgres.js#186, postgres.js#200, postgres.js#402)_
- **Test:** Columns whose names contain apostrophes or other special chars are exposed as row keys without crashing or code injection during row construction. _(refs: node-postgres#934)_
- **Test:** `array_to_json`, `array_agg(json_build_object(...))`, `row_to_json`, and `pg_try_advisory_lock($1,$2)` each surface their value under the server-reported column key in `rows[0]` (not an empty object). _(refs: node-postgres#831, node-postgres#2457, node-postgres#688, node-postgres#2744)_

### Column-name casing and identifiers
**Why it matters / failure mode:** Postgres folds unquoted identifiers to lowercase; users expect camelCase and get lowercase keys. Driver must preserve exactly what the server sends. Affects BOTH drivers.
- **Test:** `SELECT now() AS "theTime"` returns key `theTime` (quoted mixed case preserved exactly). _(refs: node-postgres#244, node-postgres#195)_
- **Test:** `SELECT firstName ...` (unquoted) returns key `firstname`; the driver does NOT re-case it — lowercasing is the server's doing. _(refs: node-postgres#1786, node-postgres#2587, postgres.js#15)_

### Empty results vs. fabricated rows
**Why it matters / failure mode:** Zero-row queries must return an empty rows array and still fire completion — never hang, never synthesize a row of nulls.
- **Test:** `SELECT 1 FROM empty_table` and `SELECT ... WHERE <no match>` resolve with `rows: []` and fire the callback/`end`/promise resolution (no hang). _(refs: node-postgres#325, node-postgres#464, node-postgres#2708, postgres.js#802)_
- **Test:** An INSERT redirected by a trigger that returns no row yields `rows: []` without throwing on undefined row access. _(refs: node-postgres#476)_
- **Test:** A zero-row SELECT still exposes `result.fields` with column names and type OIDs (metadata available with no data). _(refs: node-postgres#1132, node-postgres#2056)_

### Field/column metadata descriptors
**Why it matters / failure mode:** `result.fields` must be a complete, consistent array (parity across native/JS implementations) so tooling can read names, types, and order.
- **Test:** `result.fields` is ALWAYS an array (empty `[]` when there is no RowDescription), never undefined/null. _(refs: node-postgres#2056)_
- **Test:** Each field descriptor includes `name`, `tableID`, `columnID`, `dataTypeID`, `dataTypeSize`, `dataTypeModifier`, and `format`. _(refs: node-postgres#481, node-postgres#988, node-postgres#128, node-postgres#908)_
- **Test:** `fields` order matches the SELECT-list order even for numeric/quoted column names. _(refs: node-postgres#3068)_
- **Test:** In text protocol, every field's `format` is `'text'` (it reflects wire format, not data type). Assert this contract explicitly. _(refs: node-postgres#1688)_
- **Test:** `SELECT (col1,col2) FROM t` returns a single composite/record field, while `SELECT col1,col2` returns two fields — assert the structural difference. _(refs: node-postgres#3131)_

### Multiple result sets (multi-statement queries)
**Why it matters / failure mode:** A single query string with `;`-separated statements must expose one result per statement, not a flattened array. Affects BOTH drivers.
- **Test:** `BEGIN; SELECT 1 AS b; COMMIT;` returns the SELECT's rows with the SELECT command tag; the COMMIT tag must not contaminate the row result. _(refs: node-postgres#360)_
- **Test:** `DELETE ...; UPDATE ...; SELECT ...` as one query returns an ordered array of result objects, each with its own `fields`/`command`/`rowCount`/`rows`. _(refs: node-postgres#508, node-postgres#757, node-postgres#3121, node-postgres#2601, postgres.js#1031)_
- **Footgun to guard:** Do not merge multi-statement rows into one array (regression #360); single-statement queries should still return a single result object for back-compat.

### Row order and completeness vs psql
**Why it matters / failure mode:** Reports of "fewer rows than psql" usually trace to partial reads, set-returning functions, or buffering bugs; the driver must return the full ordered set.
- **Test:** A query with `ORDER BY` preserves the server's row order in `result.rows`. _(refs: node-postgres#744)_
- **Test:** `regexp_matches(...)` (a set-returning function) and `array_agg`/CTE/subquery queries return the same row count as psql, with no truncation. _(refs: node-postgres#1836, node-postgres#474, node-postgres#488, node-postgres#3057, node-postgres#2519)_

### Row-mode options (array / value / map)
**Why it matters / failure mode:** Performance- and duplicate-sensitive callers need non-object row shapes; metadata must remain reachable.
- **Test:** `rowMode: 'array'` returns each row as a positional value array aligned to `result.fields`. _(refs: node-postgres#593, node-postgres#612, postgres.js#18)_
- **Test:** With a cursor + `rowMode: 'array'`, column names are still retrievable via the cursor/result field metadata. _(refs: node-postgres#3167, postgres.js#345, postgres.js#350, postgres.js#514)_
- **Test:** `rowMode: 'map'` returns each row as a `Map` of column→value (duplicate-safe only insofar as Map keys allow). _(refs: node-postgres#1718, node-postgres#1955)_

### Promise / no-callback return
**Why it matters / failure mode:** `query()` without a callback must return a thenable resolving to the result; returning `undefined` breaks async/await callers.
- **Test:** `client.query('SELECT 1')` with no callback returns a Promise resolving to the result object. _(refs: node-postgres#1509)_
- **Test:** `client.query({ text, values })` with no callback also returns a resolving Promise (object form parity). _(refs: node-postgres#1565)_

### Column-name transforms (camelCase)
**Why it matters / failure mode:** Optional from/to transforms must apply uniformly to all result paths and never corrupt parameter values. Affects BOTH drivers (postgres.js transform bugs).
- **Test:** With a snake→camel column transform enabled, SELECT, UPDATE RETURNING, and DELETE RETURNING all produce camelCased keys identically. _(refs: node-postgres#502, postgres.js#491, postgres.js#1157)_
- **Test:** Column transforms must NOT mutate parameter VALUES (e.g. `SET LOCAL`/`SHOW` round-trips preserve the original string). _(refs: postgres.js#468)_
- **Test:** Optional deep transform applies to keys nested inside returned json/jsonb values only when explicitly enabled; default leaves json payloads untouched. _(refs: postgres.js#453)_

### Row events and incremental accumulation
**Why it matters / failure mode:** Streaming `'row'`/`'end'` events must behave identically with/without a callback and across implementations, passing the result object so rows can be accumulated.
- **Test:** The `'row'` event receives `(row, result)` and `result.addRow(row)` accumulates into `result.rows`; behavior is identical across implementations. _(refs: node-postgres#110, node-postgres#183, node-postgres#953, node-postgres#743)_
- **Test:** With no callback, the `'end'` event's result still contains the rows that arrived; `rows` is populated as rows stream in. _(refs: node-postgres#634, node-postgres#720, node-postgres#1128)_
- **Test:** The `'end'` event for the last queued query fires without needing another query enqueued behind it. _(refs: node-postgres#809)_
- **Test:** When a custom `'row'` handler does NOT call `addRow`, `result.rows` is not auto-populated (no implicit accumulation). _(refs: node-postgres#802)_

### ✅ Verification notes
Expected behaviors are sound per PostgreSQL semantics. Spot-checked and confirmed: CREATE TABLE → `command:'CREATE'`, `rowCount:null` (no count in command tag); `DO` block → `command:'DO'`, no rowCount; INSERT-without-RETURNING → `rows:[]` but `rowCount:1` (parsed from `INSERT 0 1` tag); rightmost-column-wins for duplicate object keys (#3189) and array-mode preserving both values; unquoted-identifier lowercase folding vs quoted-case preservation; RowDescription (fields) present even on zero-row SELECT; `SELECT (col1,col2)` → single composite `row` field vs per-column fields; text-protocol `format:'text'` reflects wire format not data type; `pg_try_advisory_lock($1,$2)` boolean under its own key.

Corrections:
- Line 23 ("rowCount: 0" for zero-row UPDATE/DELETE) cites `node-postgres#79?` — no such ref exists in the records and the trailing `?` flags it as a guess. Replace with `node-postgres#78` (the valid rowCount/returned-count ref). Expected behavior itself is correct.

Omitted high-signal tests to add:
- **postgres.js#676** (bug, testable=high): `SELECT * FROM <view>` must return the view's data rows, not only column descriptors with an empty rows array. Not covered by any existing test (the "completeness vs psql" section only addresses set-returning functions/CTEs, not views). Add a test seeding a view and asserting `result.rows.length` matches the underlying data.


## Encoding

_Covers how the driver moves text bytes between client and server: UTF-8 round-tripping of accented/multibyte text, negotiating a non-UTF8 `client_encoding`, behavior against `SQL_ASCII` databases, NUL-byte handling, and avoidance of buffer-corruption decode errors. Getting this wrong silently corrupts user data, so it is foundational._

### UTF-8 round-trip of accented / multibyte text
**Why it matters / failure mode:** The common default is a UTF-8 server + UTF-8 client; the dominant bug is accented characters coming back as mojibake or `�` (U+FFFD) replacement characters, and accented WHERE/parameter values failing to match rows that `psql` matches. This cluster spans BOTH drivers (node-postgres + postgres.js), a strong signal it must be covered.
- **Test:** Insert and `SELECT` a `text` value `'café résumé naïve ÆØÅ €'` (mix of Latin accents + multibyte €/U+20AC) on a UTF8 database; the returned JS string must be byte-for-byte identical (`===`) to the input, with no `�` replacement chars. _(refs: node-postgres#206, node-postgres#2203, node-postgres#2204)_
- **Test:** With a parameterized query `SELECT * FROM t WHERE name = $1` and `$1 = 'José'` against a UTF8 table containing that exact row, the driver returns exactly the rows `psql`/server-side comparison returns (not zero rows). _(refs: node-postgres#2438, node-postgres#2207, postgres.js#138)_
- **Test:** A non-parameterized `SELECT` filtering on an accented literal embedded in SQL text returns the matching row and decodes accents correctly in the result, instead of returning replacement characters. _(refs: node-postgres#2203, node-postgres#2207)_
- **Test:** Round-trip 4-byte UTF-8 (e.g. emoji `'😀'` / U+1F600) and combining sequences; the returned string length and codepoints match the input exactly. _(refs: node-postgres#206)_

### Configurable client_encoding (non-UTF8: latin1 / iso-8859-1)
**Why it matters / failure mode:** The driver historically hardcoded `client_encoding=utf-8` at startup, so users connecting to latin1/iso-8859-1 data had no escape hatch and got garbled output. The driver must let the app choose the client encoding and decode accordingly.
- **Test:** Allow setting `client_encoding` (e.g. via connection option `'latin1'` / `'iso-8859-1'`) and verify it is actually sent in the startup packet / applied; a follow-up `SHOW client_encoding` reflects the requested value, not a hardcoded `UTF8`. _(refs: node-postgres#498, node-postgres#906, node-postgres#2732)_
- **Test:** Against a server delivering Latin-1 bytes, with `client_encoding='latin1'`, a column holding byte `0xE9` decodes to `'é'` (U+00E9), not `�` or a multibyte misread. _(refs: node-postgres#1033, node-postgres#2732, node-postgres#906)_
- **Test:** The chosen client encoding governs decoding of result text frames per-connection; switching encoding does not leak/cross-contaminate decoding of subsequent rows on the same connection. _(refs: node-postgres#2204, node-postgres#2732)_

### SQL_ASCII databases (non-UTF8 / unvalidated bytes)
**Why it matters / failure mode:** `SQL_ASCII` performs no encoding validation, so raw high-bit bytes flow through. A hardcoded-UTF8 client raises `invalid byte sequence for encoding "UTF8"` or corrupts accents. The driver must let the client opt into a byte-correct encoding rather than forcing UTF8 validation.
- **Test:** Connecting to a `SQL_ASCII` database and reading a column containing non-UTF8 byte sequences must NOT throw `invalid byte sequence for encoding "UTF8"`; with an explicit client encoding configured, bytes are decoded by that encoding. _(refs: node-postgres#2475, node-postgres#1033)_
- **Test:** Writing UTF-8 text to a `SQL_ASCII` database transmits the configured client-encoding bytes unchanged (no silent re-encoding to a different charset). _(refs: node-postgres#1010)_

### Intermittent buffer-corruption decode errors
**Why it matters / failure mode:** A buffer-management bug caused even trivial repeated `SELECT 1` queries to intermittently raise `invalid byte sequence for encoding "UTF8": 0xce 0x06`-style errors — decode operating on a stale/misaligned buffer slice. This is a correctness/reliability regression to guard against.
- **Test:** Run thousands of rapid back-to-back queries (e.g. `SELECT 1`, and queries returning multibyte text spanning TCP packet boundaries); none intermittently produce `invalid byte sequence` / decode errors. Text that straddles a network-chunk boundary still decodes correctly. _(refs: node-postgres#3307)_

### NUL byte in string values
**Why it matters / failure mode:** PostgreSQL `text`/`varchar` cannot store the `0x00` codepoint; behavior must be deterministic and clearly surfaced rather than truncating or hanging.
- **Test:** Inserting a JS string containing `' '` into a `text` column behaves consistently: either round-trips (where supported) or raises a clear, deterministic encoding/`invalid byte sequence`-class error every time — never silent truncation at the NUL nor inconsistent success/failure. _(refs: postgres.js#238)_

### Buffer API portability
**Why it matters / failure mode:** Relying on non-standard Node internals (`Buffer.utf8Write`, `Buffer.utf8Slice`) breaks in browser/polyfilled (feross/`buffer`) environments. The driver should use only the public Buffer API.
- **Test:** String encode/decode paths use standard `Buffer.write(str, enc)` / `buf.toString(enc)` (or `TextEncoder`/`TextDecoder`) APIs, verified to run unchanged against a polyfilled Buffer implementation without `utf8Write`/`utf8Slice`, producing identical UTF-8 results. _(refs: postgres.js#22)_

### ✅ Verification notes
Grounding & coverage: all 15 cited refs are represented; every test traces to its issue (no hallucinated cases). The only HIGH-signal record (bug/regression + testable=high) is node-postgres#206 — already covered (lines 7, 10). No high-signal omissions. (postgres.js#138 and #238 are testable=high but kind=question, so not required as high-signal.)

Corrections (refine misleading/imprecise expectations, no test deleted):
- **NUL-byte test (line 29):** For PostgreSQL `text`/`varchar`, `0x00` is NEVER storable — it always raises (`invalid byte sequence for encoding "UTF8": 0x00` server-side; postgres.js also rejects client-side). The "either round-trips (where supported) or raises" wording is misleading for a text column: the round-trip branch is unreachable on real PG. The only correct expected outcome here is a *deterministic error every time*. (Round-trip of `0x00` is achievable only via `bytea`, not text — worth a separate note if desired.)
- **SQL_ASCII read test (line 20):** Sharpen the semantics. A genuine `SQL_ASCII` server performs NO encoding conversion in either direction, so a `SELECT` does not itself emit a *server-side* `invalid byte sequence for encoding "UTF8"`. That error originates client-side (driver decoding raw high-bit bytes as UTF8) or when WRITING to a UTF8-validated DB. The "must NOT throw" target is correct, but the test should locate the failure as client-side decode and additionally assert that with an explicit client encoding the bytes decode to the expected characters.

Minor (non-blocking): `client_encoding='iso-8859-1'` (line 14) is accepted — PG's `clean_encoding_name` strips separators/lowercases (`iso-8859-1`→`iso88591`→LATIN1), and JS `TextDecoder` accepts `iso-8859-1`/`latin1`. OK.

Everything else (UTF-8 round-trip incl. €/U+20AC and 4-byte emoji, parameterized accented WHERE matching server-side comparison, per-connection encoding isolation, SQL_ASCII pass-through writes, packet-boundary buffer-corruption guard, Buffer API portability) matches PostgreSQL protocol semantics.


## Replication

_Covers logical-replication / `subscribe()` support: speaking the replication sub-protocol correctly, decoding the pgoutput/logical message stream, honoring publication options, advancing replication slots, resuming after disconnects, and exposing monitoring state. A driver that gets the wire framing or slot bookkeeping wrong silently loses or duplicates change events, bloats the WAL, or leaks resources — failures that are invisible until production._

### Replication connection protocol mode
**Why it matters / failure mode:** Replication connections (`replication=database` / `START_REPLICATION`) only accept the **simple query protocol**. Sending an extended/parameterized query (Parse/Bind/Execute) on such a connection makes the server reject it, so any code path that prepares statements breaks subscription startup.
- **Test:** Opening a replication connection and issuing the setup/streaming commands must use the **simple query protocol**; assert no Parse/Bind messages are sent and that `START_REPLICATION` succeeds without `extended query protocol not supported in a replication connection`. _(refs: postgres.js#292)_
- **Test:** With a column transform (e.g. `toCamel`) enabled globally, the internal replication setup queries (`IDENTIFY_SYSTEM`, `CREATE_REPLICATION_SLOT`, `START_REPLICATION`) must still be emitted verbatim and not rewritten/mangled by the transform; subscription starts without a syntax error. _(refs: postgres.js#474)_

### Decoding the logical change stream
**Why it matters / failure mode:** The byte-level parser for logical/pgoutput messages must handle every tuple variant. Mis-parsing an old-tuple (`O`) or key-tuple (`K`) update message overruns the buffer, throws `ERR_OUT_OF_RANGE`, or yields garbage rows.
- **Test:** An UPDATE on a table with `REPLICA IDENTITY FULL` produces an `O` (old tuple) submessage before the new tuple; the parser must read the old-tuple column count and skip its columns correctly and **not** throw `ERR_OUT_OF_RANGE`. Assert the callback fires once with correct new values and populated old values. _(refs: postgres.js#296)_
- **Test:** A single committed row change yields **exactly one** callback invocation (no duplicates) with the correct primary-key and old-tuple values; assert call count == number of row changes within the transaction. _(refs: postgres.js#752)_
- **Test:** INSERT, UPDATE, and DELETE events are each decoded with the correct operation tag and a stable row shape; DELETE/UPDATE expose the old/key tuple per the table's `REPLICA IDENTITY`. _(refs: postgres.js#752, postgres.js#296)_

### Identifying changed columns on UPDATE
**Why it matters / failure mode:** Consumers need to know *which* columns actually changed, but a naive decoder reports all columns. With default `REPLICA IDENTITY`, only key columns appear in the old tuple, so the driver must surface enough info to diff.
- **Test:** On an UPDATE event the callback receives both the new tuple and (when an old/key tuple is present) the prior values, so a consumer can compute the changed-column set; assert old values are present for `REPLICA IDENTITY FULL` and at least the key for default identity. _(refs: postgres.js#996)_

### Publication options are honored
**Why it matters / failure mode:** A user-supplied publication name/option was being silently overwritten with the default, so subscribers streamed the wrong (or default `alltables`) publication.
- **Test:** `subscribe()` called with an explicit publication name must pass that exact name to `START_REPLICATION ... (publication_names 'X')`; assert the server-bound publication equals the user value, never the default. _(refs: postgres.js#295)_
- **Test:** Subscribing to a publication that includes only specific tables/operations delivers events only for those tables/operations. _(refs: postgres.js#295, postgres.js#752)_

### Resume / start from a specific LSN
**Why it matters / failure mode:** To avoid losing changes between an initial snapshot and the live stream, a subscription must be startable from a caller-provided slot + LSN, and must expose the current LSN to the consumer for checkpointing.
- **Test:** `subscribe()` accepts a pre-existing slot name and a starting LSN; assert `START_REPLICATION` is issued with that slot and `<LSN>` and that no changes before the LSN are replayed and none after are skipped. _(refs: postgres.js#654, postgres.js#982)_
- **Test:** The per-change callback receives the WAL LSN of each message so the consumer can persist a resume point; restarting from that LSN replays from exactly the next change. _(refs: postgres.js#654, postgres.js#982)_

### Slot advancement / WAL retention
**Why it matters / failure mode:** If the driver never sends Standby Status Update (confirmed flush LSN) keepalives, the server retains WAL indefinitely and the disk fills even when publishing tables are idle.
- **Test:** While subscribed and idle, the driver periodically sends a Standby Status Update advancing the confirmed-flush LSN in response to server keepalive (`k`) requests; assert `pg_replication_slots.confirmed_flush_lsn` advances and `pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)` does not grow unboundedly. _(refs: postgres.js#790)_

### Automatic reconnect and resume
**Why it matters / failure mode:** Subscriptions must survive transient server restarts / dropped connections and resume from the last confirmed LSN, otherwise long-running consumers die silently.
- **Test:** After the server goes down and comes back up (or the TCP connection is dropped), the subscription reconnects automatically and resumes streaming from the last confirmed LSN with no lost or duplicated committed changes; assert it does not terminate with `CONNECTION_CLOSED`. _(refs: postgres.js#757, postgres.js#980)_

### Subscription teardown / no leaks
**Why it matters / failure mode:** Unsubscribing must detach every listener it attached; otherwise repeated subscribe/unsubscribe cycles accumulate `error` listeners and leak memory.
- **Test:** Calling the unsubscribe handle removes all stream/error listeners it registered; assert the underlying stream's listener count returns to baseline after subscribe→unsubscribe and that repeated cycles do not grow listener count. _(refs: postgres.js#1087)_

### Replication monitoring / introspection
**Why it matters / failure mode:** Operators query catalog views to observe replication health; these must return live, non-null server state through the driver.
- **Test:** `SELECT * FROM pg_stat_replication` and `SELECT pg_last_xact_replay_timestamp()` return rows/values matching server state (non-null on an active replica/standby), correctly typed (timestamps as Date, LSNs as strings). _(refs: node-postgres#1027)_

### Public typings & documented streaming API
**Why it matters / failure mode:** The `subscribe()` / publication surface and the ability to stream slot output row-by-row are part of the contract; missing types or an unusable cursor API blocks adoption.
- **Test:** The `subscribe()` / publication API has TypeScript definitions covering handler arguments (row, info/operation, LSN) and the returned unsubscribe handle; assert the typed example compiles. _(refs: postgres.js#262)_
- **Test:** Logical-decoding output (e.g. `wal2json`) can be streamed from a slot and consumed incrementally row-by-row without buffering the whole stream. _(refs: node-postgres#1759)_

### End-to-end logical replication sanity
**Why it matters / failure mode:** The headline use case — create publication, create a logical slot/subscription, and actually receive change events — must work end to end; several reports were just "logical replication is not working."
- **Test:** Given a publication and a started subscription, committing INSERT/UPDATE/DELETE on a published table delivers the corresponding events to the callback within a bounded time; assert each committed change is observed exactly once. _(refs: postgres.js#954, postgres.js#752)_

### ✅ Verification notes
Coverage: all 16 cited refs are represented; no record left untested. None of the records are `testable:high` (all medium/low), so there are no omitted high-signal bug/regression tests.

Two expected-behavior corrections (PostgreSQL semantics):

- **Line 18 / postgres.js#996 — "at least the key for default identity" is wrong as an unconditional assertion.** In pgoutput, the old/key TupleData (`K`) on an UPDATE is *optional*: it is emitted **only when the UPDATE changed a column that is part of the REPLICA IDENTITY index** (primary key). An UPDATE that touches only non-key columns under default REPLICA IDENTITY carries **no** old tuple at all. So the test must not assert old/key values are always present for default identity — assert them present only when key columns changed, and (separately) full old values present for `REPLICA IDENTITY FULL`. As written the assertion will fail on a legitimate, spec-correct stream.

- **Line 44 / node-postgres#1027 — the two introspection calls live on different roles; "non-null on an active replica/standby" conflates them.** `pg_stat_replication` is populated on the **PRIMARY** (one row per connected walsender/standby) and is empty on a standby with no downstream. `pg_last_xact_replay_timestamp()` returns non-null only on a **STANDBY in recovery** and returns **NULL on the primary**. The test should assert each against the correct node role rather than lumping both as "non-null on a replica," otherwise the expectation is unsatisfiable on any single instance. (LSN-as-string / timestamp-as-Date typing is correct.)

Minor note (not counted): Line 6 / postgres.js#292 — "replication connections only accept the simple query protocol" is slightly overbroad for `replication=database` (logical) connections, which *do* accept normal SQL via the extended protocol; the constraint really applies to the replication commands (`IDENTIFY_SYSTEM`/`CREATE_REPLICATION_SLOT`/`START_REPLICATION`). The test as scoped (those setup/streaming commands) is correct, so no change required.


## Performance

_Covers per-query CPU overhead, result parsing/decoding throughput, memory stability (no leaks/OOM), pooling, the extended-protocol/parameter path, and client-vs-server latency attribution. For a driver these determine whether it can sustain real workloads without unbounded memory growth, event-loop stalls, or multiplied latency over libpq/psql._

### Memory & listener stability (no unbounded growth)
**Why it matters / failure mode:** Long-lived clients/pools that leak listeners, cached parser strings, or buffers crash production processes with OOM or trigger EventEmitter warnings. Both libraries have shipped variants of this bug.
- **Test:** Run N (e.g. 100k) identical parameterized queries on one persistent client; RSS/heap reaches a stable plateau and does not grow monotonically (allow GC noise), and no `MaxListenersExceededWarning` is emitted. _(refs: node-postgres#86, node-postgres#774, node-postgres#1417, node-postgres#3070)_
- **Test:** Repeatedly create and destroy clients (and subscribe/unsubscribe `notification` listeners); the number of registered listeners on shared emitters returns to baseline after each cycle, never exceeding the default max. _(refs: node-postgres#1451, node-postgres#86)_
- **Test:** Insert many rows where each query has distinct column-name sets; the internal column-name/parse cache is bounded (LRU or per-statement) so heap does not grow with the number of distinct queries. _(refs: postgres.js#96, node-postgres#1417)_
- **Test:** Process thousands of sequential INSERTs (and INSERT ... RETURNING uuid vs int); memory plateaus and returning a uuid does not consume disproportionately more memory than an int id. _(refs: node-postgres#1561, node-postgres#1571)_
- **Test:** Receive many asynchronous NOTIFY/notification events; the packet reader does not accumulate or over-allocate buffers (no `RangeError: Array buffer allocation failed`). _(refs: node-postgres#1818)_
- **Test:** Sustained high-throughput SELECTs through a pool over a long run reach a stable memory plateau, not continuous growth. _(refs: node-postgres#2894)_

### Large result handling & OOM protection
**Why it matters / failure mode:** Buffering an entire large/multi-join result in one allocation crashes Node instead of failing gracefully. A driver must offer streaming and an enforceable size cap.
- **Test:** Fetch a multi-MB single-row JSON result; it completes successfully and time is within a small constant factor of the same psql query (no quadratic buffer copying). _(refs: node-postgres#1103, node-postgres#3467)_
- **Test:** A large multi-join / large query result is retrievable via a streaming/cursor API without exhausting heap or crashing the process. _(refs: node-postgres#2633, node-postgres#2638)_
- **Test:** With a configured `maxResultSize` byte limit, a result exceeding the limit rejects/throws a catchable error (not an OOM crash); under the limit succeeds normally. _(refs: node-postgres#2336)_

### Row & value parsing throughput
**Why it matters / failure mode:** The JS parser is the dominant client-side cost; inefficient row parsing, dynamic row shapes, or whole-response buffering causes latency disproportionate to server time and event-loop stalls.
- **Test:** Selecting a column subset (`SELECT a, b`) is not measurably slower than `SELECT *` for the same rows through the JS bindings. _(refs: node-postgres#371)_
- **Test:** Parsing one row with ~600 columns stays within a small bound of prior baseline (regression guard); no quadratic-in-columns behavior. _(refs: node-postgres#3055)_
- **Test:** All rows returned by a single query share one stable hidden-object shape (same key order/prototype), so V8 does not deoptimize downstream access/cloning. _(refs: node-postgres#3042)_
- **Test:** Parsing a large result set does not block the event loop beyond a small threshold (measure max event-loop lag during parse). _(refs: node-postgres#1531, node-postgres#2043)_
- **Test:** JSON/JSONB column values are decoded per-row as rows arrive, not by buffering the whole response into one string then parsing. Returning the result as a single server-side `to_json` value parses faster than field-by-field typed decoding (documented fast path). _(refs: node-postgres#3565, node-postgres#1807, node-postgres#3098)_
- **Test:** Client-side protocol parse/serialize CPU time for a representative workload stays within a bounded factor of libpq for the same query (regression guard vs. native). _(refs: node-postgres#1993, node-postgres#1808)_

### bytea encode/decode efficiency
**Why it matters / failure mode:** bytea is a known hotspot in both directions; naive hex decoding/encoding is orders of magnitude slower than native and spikes CPU/allocations.
- **Test:** Decoding a large bytea column (multi-MB) returns the exact bytes and completes within a small constant factor of pg-native/psql, with bounded buffer allocations. _(refs: node-postgres#1286, node-postgres#2240)_
- **Test:** Inserting large bytea buffers achieves throughput comparable (within a reasonable bound) to the native client. _(refs: node-postgres#1680)_

### Streaming throughput
**Why it matters / failure mode:** A query-stream that is far slower than a buffered query defeats its purpose (backpressure/batching bug).
- **Test:** Streaming a large result via the cursor/stream API achieves throughput within a reasonable factor of the equivalent buffered query (no per-row round-trip stalls). _(refs: node-postgres#2058)_

### Extended-protocol & parameter-path overhead
**Why it matters / failure mode:** Parameterized / extended-protocol queries regressed to be an order of magnitude slower than simple queries; param preparation added tens of ms client-side. Affects both drivers.
- **Test:** A parameterized (extended-protocol) query is not an order of magnitude slower than the equivalent simple-protocol query for the same plan; prepared statements are reused across repeated calls. _(refs: node-postgres#3325, postgres.js#794)_
- **Test:** Submitting a parameterized query adds only negligible client-side preparation time versus a no-param query (no tens-of-ms per-query overhead in param encoding). _(refs: node-postgres#3213, node-postgres#1774)_
- **Test:** Per-query construction/type-checking imposes no measurable fixed overhead (guard `Query.checkConstructor`-style dispatch cost). _(refs: node-postgres#2039)_
- **Test:** When detecting a Buffer parameter to enable binary mode, the scan short-circuits on the first match (does not scan all params). _(refs: node-postgres#1875)_

### Type-OID cache (avoid per-transaction reloads)
**Why it matters / failure mode:** postgres.js re-ran the array-type OID lookup on every transaction, adding large fixed delay per transaction — a strong, repeated bug.
- **Test:** Across many sequential transactions, the array/type OID introspection query executes at most once (cached) — assert via query log / server statement count that it does not repeat per transaction. _(refs: postgres.js#903, postgres.js#952)_

### Error/stack-trace capture cost
**Why it matters / failure mode:** Instantiating an Error per query to capture a stack trace (and large source maps) added measurable per-query CPU even when nothing errors.
- **Test:** On the success path, no stack trace / source-map work is performed per query (or it is opt-out); enabling the lightweight mode measurably reduces per-query CPU versus always-capture. _(refs: postgres.js#273, postgres.js#290)_

### Pool acquisition latency & queue structure
**Why it matters / failure mode:** Pooled queries took ~2x client time; the waiter/idle queue used array `shift` (O(n)). Throughput must not degrade under churn.
- **Test:** `pool.query` latency is within a small bound of `client.query` for the same statement on a warm pool (no doubled latency). _(refs: node-postgres#1654)_
- **Test:** Pool idle/waiter enqueue/dequeue is amortized O(1) (no O(n) `Array.shift`); enqueuing/dequeuing many waiters scales linearly, not quadratically. _(refs: node-postgres#2252)_
- **Test:** Sustained throughput does not drop after a concurrency burst is reduced back to low concurrency (no stuck/degraded state). _(refs: postgres.js#747)_

### Insert / batch throughput
**Why it matters / failure mode:** Sequential awaited single-row inserts are dramatically slower than batched multi-row inserts; drivers should make the efficient path available.
- **Test:** A multi-row/batched INSERT (single statement with many value tuples, or pipelined batch) achieves substantially higher throughput than N sequential awaited single inserts for the same row count. _(refs: node-postgres#2447, node-postgres#851, node-postgres#1919)_

### Utility hot paths (escapeLiteral)
**Why it matters / failure mode:** `escapeLiteral` was super-linear on large strings, making large jsonb literals slow to escape.
- **Test:** `escapeLiteral` runs in near-linear time on input size and still produces a correctly-escaped, server-accepted literal (test with a multi-MB string containing quotes/backslashes). _(refs: node-postgres#3194)_

### Client-vs-server latency attribution
**Why it matters / failure mode:** Users see client-reported query time far exceeding server `EXPLAIN ANALYZE` time, with no way to localize it. A driver should not add large unexplained latency and should expose timing.
- **Test:** For a fast query (sub-ms server time) on a small idle dataset, client-measured submit-to-complete time is low and consistent, without random spikes introduced inside the driver. _(refs: node-postgres#2884, node-postgres#1601, node-postgres#3300)_
- **Test:** The result callback fires only after the connection finishes reading the response, so the server is not left blocked in `ClientRead` while callback work runs; expose acquire/execute timing hooks for diagnosis. _(refs: node-postgres#2189, node-postgres#874, postgres.js#558)_

### ✅ Verification notes
Semantics: every test's expected behavior is correct per PostgreSQL/protocol semantics. These are predominantly relative performance/memory-stability assertions (within-constant-factor, plateau, no leak/OOM, cached introspection) rather than strict SQL-result assertions, and none assert anything contradicting Postgres behavior. Spot checks that hold up: `escapeLiteral` near-linear + server-accepted output (#3194); array/composite type-OID introspection cached, not re-run per transaction (postgres.js#903/#952 — accurate to postgres.js behavior); bytea hex decode returns exact bytes within a constant factor of pg-native (#1286/#2240); `to_json` single-value fast path vs field-by-field typed decode (#1807); ~600-column single-row parse regression guard (#3055); Buffer-param binary-mode scan short-circuits on first match (#1875).

Corrections (grounding, minor):
- Line 25 ("Parsing a large result set does not block the event loop…") cites node-postgres#2043, but #2043's intent is *connection establishment* not blocking the event loop — a different code path from result parsing. #1531 already correctly grounds the parse-blocking test. Recommend dropping #2043 here and, if desired, adding a separate connect-path test ("establishing a connection does not block the event loop for tens of ms" — #2043).
- Line 41 cites node-postgres#1774 for "param submission adds negligible client-side prep time," but #1774 is a `question` with empty extracted intent — weak/over-reached grounding. The assertion is fully supported by #3213; #1774 should be dropped or treated as non-load-bearing.

Omissions: none of kind=bug/regression are testable=high (max is medium), so there are no high-signal omitted refs to add. Coverage of the medium-testable bugs is otherwise complete (memory/listener leaks #86/#774/#1417/#1451/#3070/postgres.js#96; large-result OOM/stream #2633/#2638/#2336; bytea #1286/#2240/#1680; extended-protocol #3325/#3213/#794; pool #1654/#2252/#747; OID cache #903/#952; throughput #2058/#2447). Note (non-blocking): node-postgres#597 (native+SSL repeated-connect leak) and #2046 (single-column int into TypedArray, feature) are not individually represented, but neither is high-signal.

Verdict: corrected (2 minor grounding fixes; coverage complete, no high-signal omissions).


## Concurrency

_How a driver behaves when multiple queries are in flight at once — both on a single physical connection (where the PostgreSQL wire protocol is strictly sequential) and across a pool (where real parallelism is expected). Getting this wrong corrupts protocol state, drops/duplicates results, hangs queries, or silently reorders writes, so it is foundational correctness for any driver._

### Single-connection serialization (queueing on one client)

**Why it matters / failure mode:** The PG simple/extended protocol allows only one in-flight query per backend connection. If a driver sends a second Parse/Bind/Execute before the first query's response is fully drained, frontend/backend state desyncs, producing `invalid frontend message type`, `transaction start while in start state`, null `activeQuery` crashes, or truncated/empty results. This is the single largest cluster here and both drivers have hit it.

- **Test:** Issue two queries back-to-back on one client *without awaiting the first* (e.g. `c.query('select 1 as a')` then immediately `c.query('select 2 as b')`). Both promises must resolve, in submission order, each with its own correct single-row result (`a=1` then `b=2`). The second must not be sent on the wire until the first's CommandComplete/ReadyForQuery is received. _(refs: node-postgres#516, node-postgres#896, node-postgres#1488, node-postgres#2311, node-postgres#3134)_
- **Test:** Fire N=100 INSERTs (distinct values) on one client without awaiting, then commit/select. All 100 rows must be persisted and queryable — not just the first. _(refs: node-postgres#483)_
- **Test:** Two concurrent statements that would corrupt protocol state must not yield `invalid frontend message type`; the driver serializes them and both settle cleanly. _(refs: node-postgres#563, node-postgres#45)_
- **Test:** In a `BEGIN`/transaction context, queue many statements on one client concurrently with overlapping transactions; the driver must serialize so no `transaction start while in start state` error occurs and statements interleave correctly. _(refs: node-postgres#1461)_
- **Test (alternative contract — fail-fast):** If the driver chooses to reject rather than queue concurrent queries on one client, sending a query while another is in flight must throw a clear, synchronous-style error (not silently corrupt state). Document which contract the driver implements; do not allow both. _(refs: node-postgres#3633)_

### Strict ordering & per-query result isolation

**Why it matters / failure mode:** Queued queries must complete in submission order, and each query's result/callback must be bound to *that* query — a classic bug is loop-issued queries all receiving the last iteration's params or the same repeated row, or a later iteration's result being dropped.

- **Test:** In a loop `for i in 0..9`, issue a parameterized query `select $1::int` with param `i` (no await between). Each result must reflect its own `i` (0..9), not all `9`; ordering of completion equals submission order. _(refs: node-postgres#834, node-postgres#1073, node-postgres#1691)_
- **Test:** Queue 10 distinct `select i as v` each with its own `end`/result handler; each handler receives its own distinct row, none repeated or skipped. _(refs: node-postgres#1073, node-postgres#1288)_
- **Test:** Queue [failing statement, then `ROLLBACK`] on one client; the ROLLBACK must execute *after* the failing statement and before any subsequent queued statement — strict FIFO even across an error. _(refs: node-postgres#1288)_
- **Test:** Read-after-write on one connection: `INSERT`/`UPDATE` then a subsequent `SELECT` (sequential) must observe the preceding completed write — no stale read from reordering. _(refs: node-postgres#1192, node-postgres#1866)_
- **Test:** `pool.query` calls issued synchronously in sequence must complete in call order. _(refs: node-postgres#1275)_

### Result-set integrity under concurrent load

**Why it matters / failure mode:** Under heavy concurrency, parser/buffer/state corruption can produce empty result sets, wrong column counts, `ERR_OUT_OF_RANGE`, or null-column errors. Affects both drivers and is the hardest to reproduce — needs stress testing.

- **Test:** Run a high-concurrency soak (e.g. 1000s of small `select`s over a pool) and assert every query returns its complete, correct result set — never empty, never truncated. _(refs: node-postgres#401)_
- **Test:** Drive heavy concurrent mixed-type queries (varying column widths, text/binary, large values) and assert the parser never emits `ERR_OUT_OF_RANGE` or spurious null-column errors from buffer/state corruption. _(refs: postgres.js#1039)_
- **Test:** Parameterized query with `RETURNING` under load must not throw `Cannot read property 'name' of undefined` or `handleCommandComplete of null`; response framing must stay aligned to the correct query. _(refs: node-postgres#2454, node-postgres#2455, node-postgres#2456)_

### Active-query / protocol-state race (out-of-order backend messages)

**Why it matters / failure mode:** A `ParseComplete`/`parseComplete` message arriving after the active query was cleared must not dereference null. Pure-JS driver regression cluster; guard explicitly.

- **Test:** Simulate/trigger a `ParseComplete` (or other async backend message) arriving when there is no active query; the driver must ignore it gracefully — no `TypeError: Cannot read property ... of null/undefined`, and a subsequently reused client still works. _(refs: node-postgres#3174, node-postgres#2817, node-postgres#2455, node-postgres#2456)_
- **Test:** After a query completes and is cleared, internal state flags (e.g. "has executed"/active-query pointer) must reflect the *current* active query so a reused client is not corrupted. _(refs: node-postgres#2817)_

### Pool parallelism (real concurrency across connections)

**Why it matters / failure mode:** A pool with max>1 must run independent queries on separate backends truly in parallel; serializing them needlessly defeats the purpose. Conversely the single-client cases above must *not* be "parallelized" onto one connection.

- **Test:** With pool max>=2, launch K queries each `select pg_sleep(0.3)` via `Promise.all`. Wall-clock total must be ~0.3s (overlapping), not K*0.3s, confirming separate connections run concurrently. _(refs: node-postgres#912, node-postgres#1621, node-postgres#1959)_
- **Test:** With pool `max=N`, issuing >N concurrent queries must queue the excess and still complete all of them once connections free up (no deadlock, no drop). _(refs: node-postgres#1621)_

### Pipelining (optional optimization, must stay correct)

**Why it matters / failure mode:** Pipelining many queries on one connection to avoid round-trip-summing latency is desirable, but each response must map back to the correct request in order. If implemented, correctness must not regress to result mismatches.

- **Test:** Pipeline M queries on one connection; total latency should be well under M round-trips, AND each result must be mapped to its originating query in order. _(refs: node-postgres#660, postgres.js#266)_
- **Test:** Concurrent transactions/queries pipelined on a single connection return results correctly attributed to each query. _(refs: postgres.js#266)_

### Settlement guarantees — no hangs, no error cross-talk

**Why it matters / failure mode:** Every issued query promise must eventually settle (resolve or reject); concurrency bugs that leave queries hanging forever, or that route one query's error to a different query, are severe. postgres.js has documented hang and error-swap bugs here.

- **Test:** Sustained load using `sql.begin` transactions: every query promise must eventually resolve or reject — none hang indefinitely. _(refs: postgres.js#827, node-postgres#2355)_
- **Test:** With `max=1` and two concurrent queries where one fails in a build/prepare step, the *failing* query must reject and the *other* must resolve (no error cross-talk); both must settle. _(refs: postgres.js#729)_
- **Test:** Sharing one `sql`/pool instance across many concurrent requests (e.g. express middleware pattern) must not cause queries to hang. _(refs: postgres.js#941)_
- **Test:** Sequential awaited `INSERT`s must each resolve (never randomly hang). _(refs: node-postgres#2355)_

### Queue lifecycle events fire exactly once

**Why it matters / failure mode:** Internal queue `drain`/completion events firing twice cause double callback invocation and duplicate side effects.

- **Test:** Drain the query queue and assert the drain/completion handler fires exactly once per drain; no callback is invoked twice. _(refs: node-postgres#916)_

### ✅ Verification notes

**Corrections (wrong/imprecise expectations):**

- **Line 23 (`pool.query` completion order, ref #1275) — INCORRECT as written.** The expectation "`pool.query` calls issued synchronously in sequence must complete in call order" only holds for a pool with `max=1` (or when all calls happen to land on the same client). With `max>=2`, the pool hands each query to a separate idle backend and they run in parallel — completion order is explicitly NOT guaranteed and may differ from call order. As written this directly contradicts the Pool-parallelism section (lines 44–45, refs #1621/#1959) which correctly asserts that independent pooled queries run concurrently. Fix: scope this test to `max=1` (then call order == submission order via the per-client queue), or restate the guarantee as "each call must *start/dispatch* in call order and all must settle," not "complete in call order." #1275 was a `question`; the correct answer per PG/pool semantics is "no, a multi-client pool does not preserve completion order."

- **Line 44 (pool overlap with `pg_sleep`, refs #912/#1621/#1959) — imprecise bound.** Wall-clock "~0.3s, not K*0.3s" only holds when `max >= K`. With `max=2` and `K=10` (as the text allows: "pool max>=2, launch K queries"), expected wall-clock is `ceil(K/max)*0.3 ≈ 1.5s`, not `0.3s`. Fix: require `max >= K` (or state the expected time as `ceil(K/max)*sleep`). The intent (overlap rather than strict serialization) is sound; the asserted number needs the `max>=K` precondition.

**Minor wording nit (not a hard correction):**
- Line 12 (#1461) says the driver must "serialize so no `transaction start while in start state` error occurs and statements interleave correctly." "Interleave" is the wrong word for a serialized single connection — transactions must *not* interleave; they must run strictly one-after-another (the intent itself says "serialized so transactions do not interleave"). Reword to "execute in strict order."

**Grounding:** All test cases trace to cited issues; no hallucinated expectations found. Pipelining tests (lines 51–52) are correctly framed as driver-dependent/optional (node-postgres serializes and never implemented #660; postgres.js pipelines #266), avoiding a false "must pipeline" claim against a serializing driver.

**Omitted high-signal tests:** None. Both bug+testable=high records (postgres.js#729 → line 59, postgres.js#1039 → line 30) are covered. Records with testable in {none, low w/ empty intent} (#709, #929, #958) are reasonably not expanded into standalone tests. All other testable refs are mapped to at least one test.


## Runtime & Portability

_Covers how the driver loads and runs across JavaScript runtimes (Node versions, Deno, Bun, Cloudflare Workers, edge, browsers), how it survives bundlers/transpilers (webpack, Vite/Rollup, browserify, Babel, tsx), how it interoperates between CommonJS and ESM, the correctness of its shipped TypeScript types, and compatibility with Postgres-protocol-compatible servers. These are "does it even import and connect" failures — the most upstream class of bug, since none of the driver's features matter if the package cannot load in the target environment._

### Module loading: CJS/ESM interop & exports map
**Why it matters / failure mode:** The driver must load identically whether `require`d, `import`ed as default, or destructured for named exports. Broken interop yields `this.Client is not a constructor`, `default is undefined`, or `Class constructor cannot be invoked without new`. An `exports` field change is a frequent regression source that silently breaks deep subpath imports. BOTH drivers hit this repeatedly.
- **Test:** `const pg = require('pg'); new pg.Client()` and `import pg from 'pg'; new pg.Pool()` and `import { Pool, Client } from 'pg'` must each yield working constructors whose instances have a `.connect()` method. _(refs: node-postgres#2349, node-postgres#2354, node-postgres#2356, node-postgres#3091, node-postgres#2819, postgres.js#297, postgres.js#301, postgres.js#877)_
- **Test:** `import postgres from 'postgres'` (default) and `await import('postgres')` must both resolve to a callable factory function (not `undefined`, no TS2349) without requiring `esModuleInterop`, or the requirement must be documented. _(refs: postgres.js#124, postgres.js#591, postgres.js#670, postgres.js#301)_
- **Test:** Named imports of error/utility symbols must resolve in ESM: `import { PostgresError } from 'postgres'` and `import { escapeLiteral, escapeIdentifier } from 'pg'` must be defined, and `escapeLiteral`/`escapeIdentifier` must be reachable off the default ESM export. _(refs: postgres.js#684, node-postgres#3001, node-postgres#3130, node-postgres#3099)_
- **Test:** Documented deep subpath imports must keep resolving under the `exports` map: `require('pg/lib/index.js')`, `require('pg/lib/type-overrides')`, and `require('pg-protocol/dist/messages')` must succeed. Guard: the 8.15.x exports-field change broke these — regression sentinel. _(refs: node-postgres#3429, node-postgres#3465, node-postgres#3435, node-postgres#3457, node-postgres#3492)_
- **Test:** Internal cross-module wiring must not produce `undefined` re-exports: loading `pg-cursor` (which reads `prepareValue` from pg) must not throw `Cannot read properties of undefined`, and `pg-protocol` ESM wrapper must re-export `DatabaseError`/`parse`/`serialize`. _(refs: node-postgres#3430, node-postgres#3434)_
- **Test:** The CJS entry must not pull in an ESM-only build of a dependency: requiring the package must not throw "Cannot use import statement outside a module" under Vite/worker bundlers. _(refs: node-postgres#3700, postgres.js#822)_

### Bundler compatibility (webpack / Vite / Rollup / browserify / Next.js)
**Why it matters / failure mode:** Bundlers statically analyze `require`/`import`. Optional native deps, dynamic requires, and special URL schemes break the build with "Module not found" or `UnhandledSchemeError`. This is the single largest cluster across BOTH drivers and the most recurring regression (`cloudflare:sockets` broke webpack/Vite at least four times).
- **Test:** Bundling the pure-JS driver with webpack/Rollup/Vite/browserify for a Node target must succeed without resolving the optional native binding (`pg-native`) — it must be lazily/optionally required, never statically imported. _(refs: node-postgres#838, node-postgres#892, node-postgres#904, node-postgres#1138, node-postgres#1187, node-postgres#1906)_
- **Test:** Bundling for a non-Cloudflare target must not fail to resolve `cloudflare:sockets`; the special-scheme import must be guarded behind runtime detection or marked external so webpack/Vite/Rollup/Nitro do not emit `UnhandledSchemeError`/`Rollup failed to resolve`. Guard: regressed in pg 8.11.0, 8.15.0, 8.16.0. _(refs: node-postgres#2975, node-postgres#2987, node-postgres#3452, node-postgres#3469, postgres.js#691, postgres.js#711, postgres.js#727, postgres.js#810, postgres.js#930, postgres.js#1096, postgres.js#822)_
- **Test:** Node built-in imports that a browser/edge build cannot satisfy (`dns`, `net`, `tls`, `fs`, `os`, `events`, `node:process`, `node:util`) must be either avoided on the import path used by server bundles or mapped via the `browser`/`exports` field, so bundling for Next.js/Vue/SvelteKit/edge does not fail with "Can't resolve '<builtin>'". _(refs: node-postgres#1822, node-postgres#2258, node-postgres#3180, node-postgres#3566, node-postgres#3253, postgres.js#418, postgres.js#632, postgres.js#776, postgres.js#1001, postgres.js#631)_
- **Test:** `package.json` `main`/`exports` must resolve to the real entry (`lib/index.js`) so strict loaders (SystemJS/jspm) and `Client` resolution work; `this.Client` must be a constructor post-bundle. _(refs: node-postgres#1574, node-postgres#816, node-postgres#2349)_

### Transpiler / parser safety (Babel, tsx, target downleveling)
**Why it matters / failure mode:** Source must parse under every transpiler. Stray top-level `return`, `const enum`, BigInt literals against an old target, or strict-mode-only syntax cause build-time `SyntaxError`s that have nothing to do with the database.
- **Test:** Every shipped source file must parse standalone — no top-level `return` outside a function. Guard: `pg/lib/crypto/utils.js` shipped a bare `return` that broke Babel/webpack in 8.11.0. _(refs: node-postgres#2980, node-postgres#2990)_
- **Test:** TypeScript sources/declarations must not use `const enum` (breaks `isolatedModules`/Babel), and must compile under the documented minimum TS (e.g. 4.7) with `--isolatedModules` and `exactOptionalPropertyTypes`. _(refs: node-postgres#2481, node-postgres#2523, node-postgres#3699, postgres.js#407)_
- **Test:** BigInt literals in source must respect the declared compile target so Vite/esbuild does not error "Big integer literals are not available in the configured target environment". _(refs: postgres.js#374)_
- **Test:** Importing under `tsx`/Babel CJS↔ESM interop must keep runtime members intact — e.g. `pgTypes.getTypeParser` must be a function after import. _(refs: node-postgres#3485, postgres.js#877)_

### Node.js version compatibility & deprecation hygiene
**Why it matters / failure mode:** The driver must connect on every supported Node LTS and emit no deprecation warnings. A Node-14 stream/TLS change once hung `connect()` for the entire ecosystem; `Buffer()` calls spammed deprecation warnings for years.
- **Test:** `client.connect()` and `pool.connect()` must resolve and run `SELECT 1` on the current and prior Node LTS (16/18/20+); they must not hang. Guard: Node 14 hung connect — strong regression sentinel. _(refs: node-postgres#2170, node-postgres#2174, node-postgres#2177, node-postgres#2179, node-postgres#2180, node-postgres#2181, node-postgres#2202, node-postgres#2895)_
- **Test:** Loading the driver must emit zero deprecation warnings — all buffers allocated via `Buffer.alloc`/`Buffer.from`, never `new Buffer()`/`Buffer()` as a function. _(refs: node-postgres#1158, node-postgres#1163, node-postgres#1189, node-postgres#1195, node-postgres#1198, node-postgres#1214, node-postgres#1473)_
- **Test:** The package must load on its declared minimum Node version without syntax/import failures — no block-scoped declarations outside strict mode, no APIs newer than the floor (e.g. don't call `Buffer.alloc` if claiming Node 4), and `node:`-prefixed builtin imports must be declared compatible with the stated minimum or the floor raised explicitly. _(refs: node-postgres#1373, node-postgres#1455, node-postgres#3577, node-postgres#3579, node-postgres#3581)_
- **Test:** Async context must survive query callbacks: a value stored in `AsyncLocalStorage` before a query must be readable inside that query's callback (no async_hooks context loss). _(refs: node-postgres#2404, node-postgres#2533)_

### Alternative runtimes: Deno, Bun, Cloudflare Workers, edge
**Why it matters / failure mode:** Non-Node runtimes lack pieces of the Node API (`perf_hooks`, `os.userInfo`, full `net`/`tls`, `crypto`) and forbid top-level `process.env`. The driver must feature-detect rather than assume Node, and must not leak hanging promises that these runtimes cancel.
- **Test:** A query on Cloudflare Workers/Pages (with `nodejs_compat` or the Workers `connect()` TCP API) must resolve its promise, including parameterized/extended-protocol queries through Hyperdrive — never canceled as "hanging promise" or "script will never generate a response". _(refs: postgres.js#598, postgres.js#721, postgres.js#1013, postgres.js#865, postgres.js#884, node-postgres#3493)_
- **Test:** The driver must run on Deno and Bun: connect and `SELECT 1` succeed without `--unstable`, without `Buffer`/`Deno.FsFile`/`unreachable` assertion errors, without segfault (exit 139), and pooled queries must keep low latency on the 2nd+ request. _(refs: node-postgres#3679, postgres.js#325, postgres.js#427, postgres.js#586, postgres.js#681, postgres.js#692, postgres.js#723, postgres.js#782, node-postgres#3420)_
- **Test:** The driver must not read `process.env` at module top-level when full config is passed explicitly, so it runs in sandboxed/edge runtimes that forbid env access (and Deno does not demand `--allow-env`/`PGAPPNAME` when `application_name` is supplied). _(refs: node-postgres#3560, postgres.js#1078)_
- **Test:** Timing and identity internals must feature-detect: use `Date.now`/web-crypto fallbacks where `perf_hooks`/Node `crypto` are absent, and guard `os.userInfo` for default-username resolution so it does not crash on Electron/edge. _(refs: postgres.js#990, postgres.js#51, node-postgres#3050, node-postgres#3206)_
- **Test:** `setTimeout`-based timers (reconnect/end) must not pass Node-only extra arguments, so they conform to the ServiceWorker `setTimeout` signature and do not hang under vitest/Deno fake timers. _(refs: postgres.js#1088, postgres.js#1091, postgres.js#573)_
- **Test:** `client.end()` over an SSL connection must resolve (not leave a never-resolving promise) on Deno, and SSL pool connect must complete in sandboxed runtimes (WebContainer/StackBlitz). _(refs: node-postgres#3420, node-postgres#3481)_
- **Test:** A browser-targeted bundle must either provide a working `net`-shim or fail with a clear, intentional error — never a bare `net.Socket/net.Stream is not a constructor` or `Buffer is not defined`. _(refs: node-postgres#1486, node-postgres#1916, node-postgres#2032, node-postgres#2095, node-postgres#3520, postgres.js#24, postgres.js#653)_

### Postgres-protocol-compatible server variants
**Why it matters / failure mode:** Redshift, CockroachDB, CrateDB, and Postgres-XL speak wire protocol v3 but omit catalog tables or columns the driver's bootstrap queries assume. The driver must degrade gracefully, not crash on startup type introspection.
- **Test:** Connecting to a Postgres-compatible endpoint (Redshift/CrateDB/CockroachDB) must not crash on the internal type-bootstrap query — no `Cannot read property 'getTypeParser' of undefined` and no failure on a missing `pg_type.typarray` column; the driver must still return query results. _(refs: node-postgres#759, node-postgres#1580, node-postgres#640, postgres.js#183, postgres.js#957)_

### TypeScript type correctness
**Why it matters / failure mode:** Shipped `.d.ts` files are part of the contract: they must be published in the package, resolve under Deno, and accurately model the runtime API. Wrong types block compilation (`No overload matches this call`) without any runtime bug. This is the largest cluster in postgres.js.
- **Test:** Type definitions must be included in the published npm/Deno package and resolve there (no missing `types/index.d.ts`, no `@types/*` version skew). _(refs: postgres.js#224, postgres.js#287, postgres.js#298, node-postgres#3388, node-postgres#3628)_
- **Test:** Query results must be generic and singly-nested: `QueryResult<T>.rows` typed `T[]` (not `any[][]`), and `sql<Row>` must infer `Row[]` so the element type need not be written as an array. _(refs: node-postgres#1696, node-postgres#3275, postgres.js#46, postgres.js#647)_
- **Test:** `ConnectionConfig`/`PoolConfig` typings must include all real options — `connectionString`, `sslnegotiation` — and `pg-connection-string`'s `ConnectionOptions` must be assignable to `PoolConfig`. _(refs: node-postgres#1447, postgres.js#1158, node-postgres#2280)_
- **Test:** Error/event types must match runtime: `PostgresError` exported as a real constructor so `err instanceof PostgresError` narrows (and its constructor signature matches the actual options/Error argument), and the `Query` EventEmitter `row`/`error`/`end` events must be typed with nullable callback args under strict mode. _(refs: postgres.js#862, postgres.js#703, node-postgres#1930, node-postgres#1829)_
- **Test:** The `sql()` helper overloads must type-check the documented call shapes: `string[]`/`readonly`/`as const` column arrays, mixed param arrays (`[string[], number]`), `bigint`/`Buffer[]`/object-as-`::json` values, nested arrays containing `null`, jsonb values in multi-row VALUES, and empty-column inserts — none should produce `No overload matches this call`. _(refs: postgres.js#85, postgres.js#331, postgres.js#335, postgres.js#355, postgres.js#358, postgres.js#415, postgres.js#464, postgres.js#551, postgres.js#587, postgres.js#664, postgres.js#674, postgres.js#685, postgres.js#743, postgres.js#765, postgres.js#916, node-postgres#3198)_
- **Test:** Documented runtime methods must appear in the types: `.values()`, `.simple()`, `sql.json/unsafe/file`, and the awaited `sql\`\`` tagged template must type-check as a valid thenable. _(refs: postgres.js#385, postgres.js#431, postgres.js#801, postgres.js#661, postgres.js#283)_
- **Test:** `TransactionSql` must retain `Sql`'s tagged-template call signatures (not stripped by `Omit`) and remain assignable to a `Sql` parameter, so `sql.begin(tx => tx\`...\`)` type-checks and helpers accept both a connection and a transaction. Guard: regressed in v3.4.8 (#1121). _(refs: postgres.js#1143, postgres.js#1150, postgres.js#1156, postgres.js#1163)_
- **Test:** With `transform.undefined` configured, passing `undefined` as a query parameter must type-check; `Serializable` must include `bigint`. _(refs: postgres.js#855, postgres.js#330)_

### ✅ Verification notes

**Expectation correctness (per Postgres/protocol semantics):** The protocol-compatible-server test (line 47) is sound. Redshift omits parts of the type-introspection path (`getTypeParser of undefined`, #759), and CrateDB/CockroachDB lack `pg_type.typarray` (added to real Postgres in 8.3), so the bootstrap `SELECT ... typarray FROM pg_type` test in postgres.js#957 is correctly grounded; "must degrade and still return rows" is the right expectation. The Buffer-deprecation expectation (line 31: `Buffer.alloc`/`Buffer.from`, never `new Buffer()`/`Buffer()`) is correct. The async-context expectation (line 33, AsyncLocalStorage readable inside the query callback) is correct. No wrong/misleading expectations found in the protocol-facing tests.

**Grounding flags (minor):**
- Line 47 cites `postgres.js#183` (kind=question, testable=none, empty intent) and `node-postgres#640` (kind=question, testable=low, empty intent) as evidence for the protocol-compatible-server test. Neither record's intent actually attests to a Redshift/CrateDB/CockroachDB type-bootstrap crash; the load-bearing refs here are #759, #1580, and postgres.js#957. Treat #183/#640 as decorative, not as grounding.
- Line 12 cites `postgres.js#822` for the "Cannot use import statement outside a module" CJS-entry test, but #822's intent is specifically about Node ESM trying to load the `cloudflare:` scheme — it belongs to the bundler/cloudflare cluster (where it is already correctly cited on line 17), not to the generic CJS↔ESM import-statement failure. node-postgres#3700 carries that test on its own.

**Coverage gap — native (`pg-native`) behavioral cluster (medium signal, not high):** The section tests `pg-native` only as a *bundler* concern ("must be lazily/optionally required," line 16). It never tests the documented *behavioral* contract of the native bindings, which is a distinct cluster of bug/regression records:
  - node-postgres#3431 (regression, medium): `pg.native` must be a valid object exposing `Pool`/`Client` when pg-native is installed, not `null`.
  - node-postgres#762 (bug, medium): JS and native clients must expose a consistent API surface (`readyForQuery`/`connected`).
  - node-postgres#940 (bug): native query objects must emit `row`/`end`/`error` events for streaming.
  - node-postgres#981 (bug) / #777 (question): activating native bindings in one module must not globally switch other modules off the JS bindings; a JS client must remain obtainable after native is loaded.
  - node-postgres#945 (bug): enumerating/cloning the `pg` export must not trigger a `require` of pg-native.
  Suggested addition: one test asserting that, with pg-native installed, `require('pg').native` is a non-null object whose `Client`/`Pool` construct and whose `query` emits `row`/`end`/`error`, and that requiring/enumerating `pg` without pg-native installed never throws — and that selecting native in one module does not mutate another module's binding choice.

**High-signal omissions (kind=bug/regression AND testable=high):** none — the record set contains no `testable:"high"` items, so there are zero strictly-high-signal omissions.


## API Ergonomics

_Covers how callers actually invoke the driver: the promise/callback surface, constructor & instanceof contracts, lifecycle guards, dynamic SQL composition, identifier quoting, helper builders (insert/update/upsert), query introspection, and logging/observability hooks. These are the most-hit-by-real-users behaviors; getting them wrong produces silent data loss, SQL injection, crashes, or "Promise { <pending> }" confusion. Where BOTH node-postgres (np) and postgres.js (pj) hit the same class of bug, that is flagged as a strong signal._

### Promise / async-await surface
**Why it matters / failure mode:** Users expect every entry point to return a real `Promise` when no callback is given; the historical footguns are hanging promises, double-resolution, and "bring your own promise" leaks. Most-requested feature across the corpus.
- **Test:** `client.query('select 1 as x')` with no callback returns a thenable that resolves to a result whose `rows[0].x === 1`. _(refs: node-postgres#694, #1162, #2602)_
- **Test:** `client.connect()` with no callback returns a Promise that resolves after the connection is established (and rejects on connect failure). _(refs: node-postgres#1117, #1162)_
- **Test:** Calling `.then()` on a query promise AFTER the query has already completed still resolves with the result and never hangs (regression: post-completion subscription). _(refs: node-postgres#1292)_
- **Test:** `pool.connect()` with no callback resolves to a usable client; `await` on it only proceeds once connected. _(refs: node-postgres#1162, #2110)_
- **Test:** Promise-style usage emits NO `EventEmitter`/deprecation warning to stderr (i.e. promise path must not trip the event-emitter deprecation, even when third-party instrumentation adds listeners). _(refs: node-postgres#1332, #1348, #1466, #3580, #3612)_

### Callback API contract
**Why it matters / failure mode:** The legacy callback path has subtle arity/consistency bugs that silently drop results or crash outside any catchable scope.
- **Test:** `client.query(text, cb)` invokes `cb(err, result)` exactly once; on success `err` is `null` for BOTH `Client.query` and `Pool.query` (consistency — currently one is `null`, the other `undefined`). _(refs: node-postgres#2318)_
- **Test:** A named-query config object plus a callback (`query({name, text, values}, cb)`) invokes the callback with the result. _(refs: node-postgres#27)_
- **Test:** `connect`/`query` always pass the client/result as the second argument regardless of the callback's declared `.length` (no arity sniffing). _(refs: node-postgres#223)_
- **Test:** Passing a non-function as the callback throws a synchronous, catchable `TypeError` at call time — not an uncatchable crash later in the event loop. _(refs: node-postgres#1184)_
- **Test:** Passing `null`/`undefined` as the query config produces a handleable rejection/error (callback still fires or promise rejects), not a `TypeError` that skips the callback. _(refs: node-postgres#628)_
- **Test:** `client.query(queryObject)` where `queryObject` is a pre-built Query returns that SAME object so its registered event listeners fire (identity preserved, native and JS paths agree). _(refs: node-postgres#941, #1944)_

### Constructor, instanceof & subclassing
**Why it matters / failure mode:** `new Pool() instanceof Pool === false` and subclasses losing their prototype are real bugs that break dependency-injection, type guards, and ORMs.
- **Test:** `new Pool()` is `instanceof` the exported `Pool`, and `new Client()` is `instanceof` the exported `Client`; the two are reliably distinguishable via `instanceof`. _(refs: node-postgres#1612, #2742)_
- **Test:** `class MyPool extends Pool {}` produces instances on which custom prototype methods are callable and not overwritten by the base constructor. _(refs: node-postgres#1505, #1887)_
- **Test:** Calling the constructor without `new` either works consistently or throws a clear error (no silent broken instance). _(refs: node-postgres#1077, #1468)_

### Method binding (`this`)
**Why it matters / failure mode:** `const { query } = pool; query(...)` is idiomatic destructuring; losing `this` yields a cryptic failure.
- **Test:** A destructured `pool.query` reference remains bound and executes correctly (or fails with a clear, predictable error) — it must not silently lose `this`. _(refs: node-postgres#1681)_
- **Test:** Wrapping `client.query` and forwarding via `.apply(client, args)` does not infinitely recurse into a stack overflow. _(refs: node-postgres#1995)_

### Lifecycle guards & connection-state introspection
**Why it matters / failure mode:** Querying before connect silently hangs; users repeatedly ask for a way to check connection state.
- **Test:** `client.query()` before `connect()` rejects (or errors via callback) with a clear "must connect first" message rather than hanging forever. _(refs: node-postgres#1861)_
- **Test:** A connected `Client` exposes a public getter/method reporting whether it is currently connected (true after connect, false after end). _(refs: node-postgres#1014, #3010, #2761)_
- **Test:** A connected client exposes the resolved `host` and `port` actually used. _(refs: node-postgres#1698)_
- **Test:** `sql` (pj) exposes a connection-readiness status field readable without a try/catch round-trip. _(refs: postgres.js#515)_

### Query config object integrity
**Why it matters / failure mode:** The driver mutating or shallow-copying the user's config object breaks reuse and drops fields — both are regressions.
- **Test:** Passing the same config object to multiple `query()` calls succeeds every time; the driver must not write `config.callback` (or any field) onto the user's object. _(refs: node-postgres#2651)_
- **Test:** `client.query(config)` reads `text`/`values` even when those properties are defined as non-enumerable. _(refs: node-postgres#3014)_

### Query input validation
**Why it matters / failure mode:** Empty/undefined query text should fail loudly with a stable message, not produce confusing downstream errors.
- **Test:** `query()` with a plain string executes; with `undefined`/empty `text` and no `name` it throws the exact error "A query must have either text or a name." _(refs: node-postgres#2435, #2575)_

### Dynamic query / fragment composition
**Why it matters / failure mode:** Composing nested `sql` fragments is the #1 postgres.js use-case and the source of many syntax-error and `str.replace is not a function` crashes. Joining fragments with native `Array.join` must NOT be the supported path.
- **Test:** Interpolating a nested `sql\`...\`` fragment into a parent template produces one valid parameterized statement (placeholders renumbered correctly), not a syntax error at the join point. _(refs: postgres.js#12, #26, #733, #777)_
- **Test:** A `sql.join`/fragment-join helper joins N parameterized fragments with a delimiter into a single query with correctly bound params and returns matching rows; using JS `Array.join` instead yields a documented/clear failure (not silent malformed SQL). _(refs: postgres.js#807, #813, #845, #656)_
- **Test:** A conditionally-included `WHERE`/`AND`/`OR` fragment composes without leaving a trailing operator and returns the correctly filtered rows. _(refs: postgres.js#31, #244, #512, #860, #152)_
- **Test:** An array mixing string identifiers and `sql\`\`` fragments passed to `sql()` builds valid SQL and does not throw `str.replace is not a function`. _(refs: postgres.js#777, #947)_
- **Test:** A built fragment is lazy: it can be returned from an async function / stored in a variable and executed later, and `sql.fragment` (or equivalent) is non-thenable so it is not auto-executed when awaited in scope. _(refs: postgres.js#50, #245, #1019)_

### Identifier quoting & escaping
**Why it matters / failure mode:** Unquoted dynamic identifiers cause case-folding bugs, reserved-word syntax errors, and (worst) injection. Dots in string VALUES being split into qualified identifiers is a recurring data-corruption bug.
- **Test:** Dynamic column/table identifiers via `sql('camelCaseCol')` emit double-quoted `"camelCaseCol"` so case is preserved (not folded to lowercase). _(refs: postgres.js#21, #57, #111)_
- **Test:** Reserved-word identifiers (`order`, `user`, `offset`) used in the insert/update helper are double-quoted so the statement parses. _(refs: postgres.js#71, #97, #254)_
- **Test:** `sql(['projects.id'])` emits a schema/table-qualified `"projects"."id"`, NOT a single quoted `"projects.id"`. _(refs: postgres.js#188)_
- **Test:** A bound string parameter containing dots (e.g. `'a.b.c'`) is sent literally as one value and is never split into quoted identifier parts. _(refs: postgres.js#910, #987, #913)_
- **Test:** `sql\`select * from ${sql('table_name')}\`` interpolates the identifier and executes without syntax error. _(refs: postgres.js#902, #973)_
- **Test (inline vs param):** `sql()` used in an `ORDER BY`/identifier position emits the identifier/expression inline, not a bound `$1` placeholder; whitelisted column input only. _(refs: postgres.js#174, #744, #894)_

### Insert / update / upsert helpers
**Why it matters / failure mode:** The `sql(obj | array, ...cols)` helper must disambiguate insert vs update vs select-builder vs IN-list by context; getting it wrong throws or drops columns.
- **Test:** `sql(arrayOfObjects)` in an `INSERT` expands to a multi-row `(cols) VALUES (...),(...)` insert with one set of bound params per cell. _(refs: postgres.js#775, #88, node-postgres#880)_
- **Test:** `sql(obj, ...cols)` honors the column allowlist: columns omitted from the list are NOT inserted (DB default applies) and listed-but-`undefined` entries are ignored. _(refs: postgres.js#61, #91, #799)_
- **Test:** `sql([1,2,5])` as an `IN` list binds numbers as typed integers and does not call string escaping (no `str.replace is not a function`). _(refs: postgres.js#947, #956)_
- **Test:** `sql(obj)` inside `INSERT ... AS alias`/CTE expands to `(cols) VALUES (...)` (insert form), not the select-builder form; column array before a `SELECT` in `INSERT...SELECT` expands to a column list, not a VALUES clause. _(refs: postgres.js#774, #769)_
- **Test:** An upsert helper generates `ON CONFLICT (...) DO UPDATE SET col = EXCLUDED.col` for the inserted columns and completes the upsert. _(refs: postgres.js#217, #1025, #88)_
- **Test:** `sql(obj, ...cols)` in `UPDATE ... SET` emits `set col = $n` (and with a table alias emits `set col = expr`, not `set expr as col`), without throwing on null/undefined fields. _(refs: postgres.js#799, #974)_
- **Test:** A raw SQL expression (e.g. `NOW()`) can be embedded as a value inside the dynamic insert helper and is emitted as an expression, not a bound literal. _(refs: postgres.js#63, #945)_

### Column-name transforms
**Why it matters / failure mode:** camelCase↔snake_case mapping must apply symmetrically on read AND write or round-trips corrupt data.
- **Test:** With a camelCase→snake_case transform enabled, JS object keys map to snake_case columns on insert/update, and result rows map snake_case columns back to camelCase keys. _(refs: postgres.js#16, node-postgres#1370)_

### Query introspection without a DB connection
**Why it matters / failure mode:** Parameterized queries send placeholders, so there is no single interpolated string; users still need to inspect text + values for debugging, templating, and tests.
- **Test:** A built query/fragment exposes its compiled SQL `text` and its `values` array WITHOUT requiring a live connection or executing. _(refs: postgres.js#816, #818, #156, node-postgres#1828)_
- **Test:** The driver exposes the parameterized `text` and `values` separately (and optionally a helper that renders an inlined preview for logging only) — it must not pretend to hand back an executable interpolated string. _(refs: node-postgres#1282, #1596, #2486, #2623, #3258)_

### Logging & observability hooks
**Why it matters / failure mode:** Per-query logging/metrics is a top recurring ask in both libs; a first-class hook avoids monkey-patching.
- **Test:** A debug/query hook (option or event) fires for every executed query with the final query string and its parameters. _(refs: node-postgres#1781, #2580, postgres.js#113, #595)_
- **Test:** A logging hook receives per-query execution timing usable for metrics. _(refs: node-postgres#1532, #2929, #2950, postgres.js#555)_
- **Test:** Query/connection lifecycle events are published via `diagnostics_channel` TracingChannel (`start`/`end`/`error`/`asyncStart`/`asyncEnd`) for OpenTelemetry-style consumers. _(refs: node-postgres#3619, postgres.js#1171, #880, #461)_

### Resource cleanup & misc contracts
**Why it matters / failure mode:** Modern `await using` and independent pools are correctness/cleanup expectations.
- **Test:** A `Client`/`sql` instance implements `Symbol.asyncDispose` so `await using c = ...` ends the connection at scope exit. _(refs: node-postgres#3515, postgres.js#1094)_
- **Test:** Independent pool instances are isolated: ending one pool does not break queries on another. _(refs: node-postgres#185)_
- **Test:** `INSERT ... RETURNING id` returns the generated id accessible as `result[0].id`. _(refs: postgres.js#887)_
- **Test:** `sql.unsafe(text, params)` / raw text + separate params array executes as a parameterized query and returns correct rows; a reserved connection runs multiple sequential queries on one connection. _(refs: postgres.js#768, #848, #898, #940)_

### ✅ Verification notes
- Coverage of high-signal items (kind=bug/regression AND testable=high) is COMPLETE: np#628, #1292, #1612, #1681, #2318, #2651; pj#21, #57, #71, #188, #254; plus regression np#3014 are all represented. No omissions.
- Grounding: every test maps to its cited issues; no hallucinated expectations found. Identifier/dot-splitting and inline-vs-parameter claims are correct postgres.js behavior, and the PG upsert/RETURNING/parameterization semantics are accurate.
- Minor correction (line ~47): the test asserts the "exact error" string `A query must have either text or a name.` — node-postgres's actual message historically carries a trailing clause (`...Supplying neither is unsupported.`) and varies by version. Assert via substring/contains, not strict equality, to avoid version-brittle failures.
- Minor refinement (line ~52): postgres.js has no built-in `sql.join` method; the canonical fragment-join path is interpolating an array of `sql\`\`` fragments (pj#656/#813). Keep the test but pin the helper name to this driver's actual exported API so it doesn't presume an API name that doesn't exist.
- Minor note (line ~72): `ON CONFLICT (...) DO UPDATE SET col = EXCLUDED.col` is valid PG, but postgres.js does not auto-generate the `EXCLUDED.col` form; this is a driver design choice — confirm the helper emits EXCLUDED references rather than re-binding params before asserting it.


## Security
_Covers how the driver keeps untrusted input (query values, identifiers, server-supplied column names, connection strings) from becoming code, and how it protects secrets (passwords, key files). A driver is the trust boundary between application data and the wire protocol, so these failures are high-severity by default._

### Parameterized queries / SQL injection
**Why it matters / failure mode:** If user input is concatenated into SQL instead of bound as a parameter, an attacker can alter query semantics or stack additional statements. This is the single most important driver guarantee. Both ecosystems received injection reports (node-postgres reactive, postgres.js tagged-template misuse).
- **Test:** A parameterized query `SELECT $1::text AS v` (or tagged template `` sql`SELECT ${input}` ``) with `input = "1; DROP TABLE users; --"` must return one row with `v` equal to the literal string; the `users` table must still exist afterward. Values travel in the Bind message, never the query text. _(refs: node-postgres#44, postgres.js#1170)_
- **Test:** Extended-protocol queries reject multiple statements in a single parameterized command: `query("SELECT 1; SELECT 2", [])` errors (PostgreSQL: "cannot insert multiple commands into a prepared statement") rather than executing both. This blocks stacked-query injection. _(refs: postgres.js#1170, node-postgres#44)_
- **Test:** A bound parameter containing PG quote/escape metacharacters (`'`, `\`, `$$`, `%`, `\0`) round-trips unchanged through `RETURNING` — confirming the value is never re-parsed as SQL. _(refs: node-postgres#44)_

### SQL identifier escaping helper
**Why it matters / failure mode:** Table/column/schema names cannot be parameterized, so dynamic-identifier queries need a safe quoting helper. A missing or naive helper pushes users toward string concatenation and injection.
- **Test:** `escapeIdentifier('foo')` returns `"foo"` (wrapped in double quotes); `escapeIdentifier('fo"o')` returns `"fo""o"` — embedded double quotes are doubled, nothing else is interpreted. _(refs: node-postgres#1699, node-postgres#2295)_
- **Test:** `escapeIdentifier` on an injection attempt like `tbl"; DROP TABLE x; --` yields a single quoted identifier (`"tbl""; DROP TABLE x; --"`) that, when interpolated, references one (non-existent) table name and executes no DDL. _(refs: node-postgres#2295, node-postgres#1699)_
- **Test:** `escapeLiteral`/value-quote helper (if provided) wraps in single quotes and doubles embedded single quotes, matching PostgreSQL `quote_literal` semantics. _(refs: node-postgres#446)_

### Prototype pollution (server-supplied + statement names)
**Why it matters / failure mode:** Result rows are built from server-controlled column names; an attacker-influenced query (e.g. via a view/CTE alias) returning `__proto__`, `constructor`, or `prototype` must not mutate `Object.prototype`. Internal name→object maps have the same risk.
- **Test:** A query aliasing a column as `__proto__` (e.g. `SELECT 1 AS "__proto__"`) produces a row where the value is set as an own property and `({}).__proto__` / `Object.prototype` is unchanged (no global pollution). Row objects should be built with null-prototype or own-property assignment. _(refs: node-postgres#3654)_
- **Test:** Preparing/naming a statement `constructor` (or another `Object.prototype` key) stores and retrieves it correctly without colliding with inherited properties — the internal parsedStatements map is prototypeless. _(refs: node-postgres#3625)_
- **Test:** Result column named `toString` or `hasOwnProperty` yields a row whose own property holds the value and does not shadow/break later object operations. _(refs: node-postgres#3654, node-postgres#3625)_

### Secret handling (password never leaks to logs/errors/serialization)
**Why it matters / failure mode:** Passwords stored as plain enumerable fields leak via `console.log`, `JSON.stringify`, error objects, or crash dumps. Connection-string parse errors echoing credentials are a common footgun.
- **Test:** `JSON.stringify(client)` and `util.inspect(client)` of a configured client must not contain the plaintext password; the password is stored non-enumerably (or redacted). _(refs: node-postgres#2064, node-postgres#1568)_
- **Test:** An error thrown for an invalid connection string that contains a password must not embed the plaintext password/credentials in `error.message` or `error.stack`. _(refs: node-postgres#3145, node-postgres#1568)_
- **Test:** Serializing a thrown connection/auth error object (`JSON.stringify(err)`) does not expose the connection password. _(refs: node-postgres#1568)_

### Arbitrary file read via connection-string file paths
**Why it matters / failure mode:** SSL options (`sslcert`, `sslkey`, `sslrootcert`) in a connection string name local files. If an untrusted connection string is parsed and those files are auto-read, an attacker can trigger arbitrary local file reads (SSRF-of-disk).
- **Test:** Parsing a connection string containing `sslcert=/etc/passwd` (or `sslrootcert=...`) does NOT read the file unless the caller explicitly opts into reading SSL files from the string; default parse leaves the path as data only. _(refs: node-postgres#3651)_
- **Test:** With opt-in disabled, no `fs` read occurs for the supplied SSL paths (assert via a spied/instrumented fs or by pointing at a non-readable path and confirming no read-time error). _(refs: node-postgres#3651)_

### No code execution from result metadata
**Why it matters / failure mode:** Column names/aliases are server-supplied strings; they must be treated purely as data and never `eval`'d, `Function()`'d, or used to build executable code.
- **Test:** A result column aliased with a payload like `"); process.exit(1);//` (or any JS) becomes an inert property key/string and triggers no code execution or interpreter call. _(refs: node-postgres#1408)_

### Session-scoped RLS / SET LOCAL
**Why it matters / failure mode:** Row-Level-Security setups set a per-session/per-transaction user id; if `SET LOCAL` leaks across pooled connections or outside the transaction, one user's context bleeds into another's queries.
- **Test:** `SET LOCAL "app.user_id" = $X` inside a transaction is visible to `current_setting('app.user_id')` within that transaction and is reset to default immediately after `COMMIT`/`ROLLBACK`; a subsequent checkout of the same pooled connection sees no residual value. _(refs: postgres.js#559)_

### ✅ Verification notes
- **Correction (line 8 — NUL byte expectation is wrong):** The list of metacharacters claimed to "round-trip unchanged" through a bound parameter includes `\0`. PostgreSQL's `text`/`varchar` types cannot contain a NUL (0x00) byte; the server rejects it (`ERROR: invalid byte sequence for encoding ... 0x00`). A NUL will NOT round-trip — it errors. Drop `\0` from this test, or split it into a separate negative test asserting that a NUL in a text parameter produces a server error (still proving the value is treated as data, not SQL). The remaining metacharacters (`'`, `\`, `$$`, `%`) are correct and do round-trip.
- **Refinement (line 14 — escapeLiteral semantics, not a hard error):** "wraps in single quotes and doubles embedded single quotes, matching `quote_literal`" is incomplete: `quote_literal`/node-postgres `escapeLiteral` also doubles backslashes and emits an `E''` (escape-string) prefix when a backslash is present. If the helper exists, the test should also cover a backslash-containing input rather than only single quotes.
- **Grounding:** All other tests trace to cited refs. node-postgres#3291 (MD5 static-analysis flag) and the testable=none refs (#1820, #2347, #2759, #3059, #3138) are correctly omitted as non-deterministic / untestable.
- **High-signal coverage:** The only record with kind=bug AND testable=high is node-postgres#3654 (server-supplied `__proto__` column polluting Object.prototype), which IS covered (line 18). No high-signal bug omissions.


## Build & Native Bindings

_This area covers how the driver is packaged, installed, resolved, and (optionally) compiled across Node/runtime versions, OSes, CPU architectures, and package managers. For a driver these are availability bugs: if `require('the-driver')` throws, fails to compile, or pulls in a broken native addon, no query ever runs — so the bar is "installs and loads cleanly everywhere, with native code strictly opt-in."_

### Optional native bindings must never be a hard requirement
**Why it matters / failure mode:** The single largest cluster. Both ecosystems repeatedly broke because loading the JS client transitively `require()`'d the native addon (`pg-native`/`libpq`), throwing `Cannot find module 'pg-native'` for users who never asked for native mode. This is a recurring regression (notably reintroduced in pg@8.4.0).
- **Test:** With `pg-native` NOT installed, `require('driver')` and `new Client()/Pool()` then running a simple `SELECT 1` succeeds and returns `[{ '?column?': 1 }]`; no module-not-found error is thrown. _(refs: node-postgres#1140, node-postgres#1145, node-postgres#2165, node-postgres#2387, node-postgres#2403, node-postgres#3201)_
- **Test:** Regression guard: pin a test that imports the driver with the native dep absent and asserts no `Cannot find module 'pg-native'` is ever thrown at import time (lazy-load only when native mode is explicitly selected). _(refs: node-postgres#2403, node-postgres#2800)_
- **Test:** Accessing the native-client accessor/getter when the native binding is absent must NOT emit a `console.error`/warning as a side effect; it returns a typed error or `undefined` only when explicitly invoked. _(refs: node-postgres#1871, node-postgres#1140)_
- **Test:** An explicit opt-out (env var, e.g. `DRIVER_FORCE_JS=1`, or constructor option) forces the pure-JS client and prevents any attempt to load native bindings, producing no warnings. _(refs: node-postgres#1894, node-postgres#3626)_
- **Test:** Requesting native mode explicitly while `pg-native` is not installed yields a clear, actionable error message naming the missing optional package — not a raw `MODULE_NOT_FOUND` stack. _(refs: node-postgres#2098, node-postgres#2955, node-postgres#231, node-postgres#574)_

### Internal modules must resolve under all package managers / layouts
**Why it matters / failure mode:** Many crashes were `Cannot find module './x'` from internal relative requires or sub-packages not declaring their deps. These break under npm workspaces, pnpm, and Yarn PnP/Berry where hoisting and strict resolution differ.
- **Test:** Every internal module the entrypoint depends on is present in the published tarball; `require('driver')` resolves all internal paths (no missing `./pool-factory`, `./type-overrides`, `helper.js`). Assert via a clean install from the packed tarball. _(refs: node-postgres#1201, node-postgres#731, node-postgres#882)_
- **Test:** Sub-packages reference each other by package name, not deep relative paths, so symlinked/hoisted layouts (workspaces) resolve correctly. _(refs: node-postgres#2188)_
- **Test:** Companion packages (cursor/query-stream equivalents) declare the core driver as a real `dependency`/`peerDependency`, so `pnpm` and `Yarn PnP` strict mode resolve them without "tried to access X but it isn't declared." _(refs: node-postgres#2249, node-postgres#2458)_
- **Test:** All runtime dependencies are in `dependencies` (not `devDependencies`); a production-only install (`npm ci --omit=dev`) loads and runs `SELECT 1`. Guard specifically against transitive runtime deps like `split2` being absent. _(refs: node-postgres#2521, node-postgres#2249)_

### Published package integrity (tarball contents)
**Why it matters / failure mode:** Repeated "garbage in npm package," "missing dist folder," "no suitable image," and oversized-package reports. If the published artifact lacks compiled `dist/` or includes junk, the package is dead on arrival.
- **Test:** `npm pack` then install in a clean dir: the package's `main`/`exports` entrypoint exists in the tarball and is requireable (catches missing `dist/`). _(refs: node-postgres#2408, node-postgres#2703)_
- **Test:** Tarball excludes test/build/source-control artifacts via `files`/`.npmignore`; assert no `.git`, `test/`, `build/` intermediates, or stray binaries are shipped. _(refs: node-postgres#813, node-postgres#21, node-postgres#47, node-postgres#102)_
- **Test:** The packed tarball is valid (parses, installs without "Unexpected end of JSON input"); CI publishes only after a pack-and-install smoke test. _(refs: node-postgres#2186, node-postgres#2335)_

### Pure-JS client works with zero build tools / no libpq / no pg_config
**Why it matters / failure mode:** A huge volume of install failures were `pg_config: not found`, missing `libpq`, node-gyp/python errors on Windows/CentOS/Heroku — all from compiling native code at install time. A modern driver should install with no compiler and no Postgres client libs present.
- **Test:** On a machine with NO C toolchain, NO `pg_config`, and NO `libpq`, `npm install driver` exits 0 and `SELECT 1` works over the wire (pure-JS protocol path). _(refs: node-postgres#522, node-postgres#602, node-postgres#641, node-postgres#684, node-postgres#717, node-postgres#466, node-postgres#355)_
- **Test:** Installing the core driver does not trigger any `node-gyp`/python build step on a stock Windows or Linux setup. _(refs: node-postgres#2838, node-postgres#618, node-postgres#651, node-postgres#560, node-postgres#108)_
- **Test:** The optional native peer dependency does NOT auto-compile under npm 7/8+ default peer-install behavior; core install succeeds even when the native toolchain would fail. _(refs: node-postgres#2812, node-postgres#674, node-postgres#205)_
- **Test:** Pure-JS connect succeeds on ARM / Apple Silicon with no native bindings. _(refs: postgres.js#135, node-postgres#2465)_

### If native code IS shipped, it must build/load on current toolchains
**Why it matters / failure mode:** When native bindings exist, every Node/V8 ABI bump (io.js, 0.11, 6, 10, 12, 23, 24) broke compilation, and ABI mismatches/symbol-not-found errors crashed at load. Guard the optional native path explicitly.
- **Test:** The optional native addon compiles cleanly on the project's full supported-Node matrix (current LTS + latest, e.g. Node 22/23/24) in CI; build failure fails the matrix job. _(refs: node-postgres#3332, node-postgres#3458, node-postgres#1757, node-postgres#1908, node-postgres#858, node-postgres#763, node-postgres#810, node-postgres#411, node-postgres#528, node-postgres#624)_
- **Test:** Loading a prebuilt/compiled native addon under a Node version with a different ABI fails with a clear, actionable error (rebuild instruction) rather than a raw `%1 is not a valid Win32 application`/dyld symbol crash. _(refs: node-postgres#1078, node-postgres#965, node-postgres#448, node-postgres#414)_
- **Test:** Native addon loads under alternative runtimes it claims to support (or fails gracefully with a clear message) — e.g. Bun. _(refs: node-postgres#3201)_

### Native client must not segfault
**Why it matters / failure mode:** The native path produced hard segmentation faults (process death, not catchable) on parameterized queries, pool connect, and nested queries — the worst failure mode for a server.
- **Test:** Native client: a parameterized `SELECT $1` and `pool.connect()` complete without segfault across the supported-Node matrix; run under repeated/concurrent load to surface races. _(refs: node-postgres#1905, node-postgres#2332, node-postgres#469, node-postgres#136)_
- **Test:** Native client: nested queries (issuing a query from within another query's callback) do not produce a "connection pointer is null" error or crash. _(refs: node-postgres#61)_
- **Test:** A native `PQsendQuery` failure surfaces as a query error via the callback/promise rejection with a descriptive message — never thrown synchronously or swallowed. _(refs: node-postgres#48, node-postgres#81, node-postgres#60)_

### Bundler / browser build compatibility
**Why it matters / failure mode:** webpack/esbuild builds failed because the optional native client and Node-only modules (`dns`, `pg-native`) were statically imported, breaking tree-shaking and browser/edge bundling.
- **Test:** Bundling the driver with esbuild/webpack succeeds with `pg-native` absent; the optional native client is dynamically (not statically) imported so it's externalizable/ignorable. _(refs: node-postgres#2800, node-postgres#1440)_
- **Test:** A browser/edge-target bundle does not require Node-only natives (`dns`, `pg-native`) at build time when only the JS client is used. _(refs: node-postgres#1440)_

### Dependency hygiene & deprecation warnings
**Why it matters / failure mode:** Version drift (`pg-types` mismatch between core and native) and deprecated APIs (`new Buffer()`) caused runtime breakage and noisy warnings.
- **Test:** Core and native clients resolve the SAME version of shared type/parsing deps (e.g. `pg-types`); assert no duplicate/mismatched copies that cause divergent decoding. _(refs: node-postgres#1520, node-postgres#820)_
- **Test:** Normal data parsing emits NO `DeprecationWarning` for the legacy `Buffer()` constructor (use `Buffer.alloc`/`Buffer.from`); run with `--throw-deprecation` to fail on any. _(refs: node-postgres#1811)_
- **Test:** Installing the native package pulls in its required core-driver dependency so `Cannot find module 'driver'` cannot occur from a native-only install. _(refs: node-postgres#3321)_

### Install must fail loudly, not silently
**Why it matters / failure mode:** A native build could fail while `npm install` still exited 0, leaving a broken-but-"installed" package.
- **Test:** When a (opt-in) native build genuinely fails, the install step returns a non-zero exit code OR the package still loads in pure-JS mode — never a zero exit with an unusable module. _(refs: node-postgres#654, node-postgres#363)_

### ✅ Verification notes
- PG/SQL semantics: the only protocol-shaped expectation, line 7's `SELECT 1` → `[{ '?column?': 1 }]`, is correct (unaliased literal column is `?column?`; int4 decodes to a JS number). No incorrect PostgreSQL expectations found — the rest are packaging/install/load assertions, which are sound.
- Correction (grounding): line 7 mis-cites `node-postgres#3201`. That issue is about native bindings loading/running under **Bun** (an alt-runtime native-load test, correctly placed on line 37), NOT about the JS-only `require` succeeding when `pg-native` is absent. Drop #3201 from the line-7 ref list.
- Correction (grounding): line 30 cites old features `#205`/`#674` (empty intent, pre-npm-7 era) to support npm 7/8 default peer auto-install behavior that postdates them. Anachronistic — keep `#2812` as the real anchor and drop/replace the weak refs.
- High-signal coverage: NO `testable=high` bug/regression issues exist in the records (max is `medium`). The two medium items, `#2165` and `#2403`, are already covered (lines 7–8). No required high-signal omissions.
- Minor low-signal omissions (optional to add): `node-postgres#1645` (pure-JS client connects without pg-native/libpq built → fits line 28) and `node-postgres#2610` (pg-native/libpq builds on supported platforms → fits line 35). Both are low/question, not load-bearing.


## Docs

_Most of the 163 "docs" issues are non-testable (typos, wiki/extras links, changelogs, broken site links, example style). But a substantial minority document **observable driver behavior** — type parsing defaults, parameter encoding, pool/cursor lifecycle, escaping helpers, and the tagged-template/fragment semantics of postgres.js. Those documented behaviors are exactly the contracts a new driver must honor, because users code against the documented behavior, not the source. The tests below distill the testable subset; the rest are noted as non-testable._

### Integer / bigint type parsing defaults
**Why it matters / failure mode:** int8 (bigint) exceeds JS safe-integer range, so the documented default is to return it as a **string** to avoid silent precision loss. A driver that "helpfully" coerces to Number loses data above 2^53.
- **Test:** `SELECT 9007199254740993::int8` with default settings returns the JS **string** `"9007199254740993"` (not a Number), and `typeof value === "string"`. _(refs: node-postgres#968)_
- **Test:** After enabling the documented int8-as-number opt-in (`parseInt8`/custom type parser), `SELECT 1::int8` returns the JS Number `1` and `typeof value === "number"`. _(refs: node-postgres#968)_
- **Test:** `SELECT 1::int4` and `SELECT 1::int2` are returned as JS Numbers by default (only int8 is special-cased). _(refs: node-postgres#968)_

### Custom type parsers / per-query type maps
**Why it matters / failure mode:** Docs promise a per-query `types` option (a type-parser map) to override result decoding; undocumented/inconsistent behavior breaks user-supplied codecs.
- **Test:** A query run with a custom `types` parser map that registers a parser for OID 23 (int4) returns the value transformed by that parser instead of the default decode. _(refs: node-postgres#1727, node-postgres#1945)_
- **Test:** Supplying an explicit per-parameter type-OID array in the query config binds the parameter with that OID — e.g. passing a JS array for a parameter typed as `text[]` (OID 1015) sends it as a Postgres `text[]` and round-trips to `text[]`. _(refs: node-postgres#808)_

### Parameter serialization of JS objects/arrays (JSON vs array)
**Why it matters / failure mode:** The documented (and frequently surprising) rule: a JS **object** passed for a json/jsonb column auto-serializes via `JSON.stringify`, but a JS **array** is treated as a Postgres array, not JSON — so inserting an array into a json column needs explicit stringify. Both drivers field this confusion; a new driver must pick and document one deterministic rule.
- **Test:** Passing a JS object `{a:1}` as a parameter for a `jsonb` column inserts the JSON `{"a": 1}` and reads back deep-equal `{a:1}`. _(refs: node-postgres#2482, node-postgres#3200)_
- **Test:** Passing a JS array `[1,2,3]` as a parameter binds as a Postgres array (e.g. for an `int[]` column round-trips to `[1,2,3]`); inserting it into a `json` column requires explicit `JSON.stringify` (documented footgun — assert the explicitly-stringified form yields valid JSON `[1,2,3]`). _(refs: node-postgres#2482, node-postgres#1462)_
- **Test:** An array of objects passed as a parameter encodes deterministically per the driver's documented rule (Postgres array literal vs JSON) and round-trips byte-for-byte. _(refs: node-postgres#1462, node-postgres#3200)_

### SQL escaping & dynamic identifiers
**Why it matters / failure mode:** Docs promise safe-quoting helpers; if they're missing or quote incorrectly, users hand-roll string concat and create SQL-injection holes.
- **Test:** `escapeIdentifier('foo"bar')` returns `"foo""bar"` (double-quoted, internal `"` doubled); `escapeLiteral("O'Brien")` returns `'O''Brien'` (single-quoted, internal `'` doubled). Both available on the Client (and Pool). _(refs: node-postgres#1978)_
- **Test:** In a tagged-template/fragment API, interpolating a column/identifier via the identifier helper emits a **quoted identifier** (`"col"`), while bare value interpolation emits a **bound parameter** (`$1`), never inlined SQL. _(refs: postgres.js#629)_

### Tagged-template fragments & query composition (postgres.js style)
**Why it matters / failure mode:** The fragment/composition model is the core documented API of postgres.js; fragments, arrays of fragments, and `unsafe` must compose into one valid parameterized statement.
- **Test:** An `sql`` ` fragment embedded inside a larger `sql`` ` query produces a single valid statement with correctly renumbered parameters and returns the expected rows. _(refs: postgres.js#566, postgres.js#753)_
- **Test:** An **array** of `sql`` ` fragments interpolated into a query is joined into valid SQL (not stringified as `[object Object]`), executing successfully. _(refs: postgres.js#753)_
- **Test:** `sql.unsafe(raw)` embedded as a fragment within a tagged-template query injects the raw text verbatim while sibling interpolations remain parameterized. _(refs: postgres.js#566)_
- **Test:** `.simple()` sends the query via the **simple query protocol** (no parameter binding / no Parse-Bind-Execute) and supports multi-statement strings; a parameterized `.simple()` call is rejected. _(refs: postgres.js#541)_

### Lazy execution semantics (postgres.js style)
**Why it matters / failure mode:** Documented contract: a query is only sent when awaited/`.then()`'d. A driver that eagerly sends on construction breaks transaction ordering and composition.
- **Test:** Building `const q = sql`SELECT 1`` without awaiting it sends **no** bytes to the server (assert via query-count / pg_stat); awaiting it then executes exactly once. _(refs: postgres.js#429)_

### Result shape & INSERT-without-RETURNING
**Why it matters / failure mode:** Documented result objects expose both row data and command metadata; the README transaction example is wrong because INSERT without RETURNING yields no rows.
- **Test:** A `SELECT` result is an array-like of row objects that also carries `command` (`"SELECT"`) and a row `count` matching `rows.length`. _(refs: postgres.js#69)_
- **Test:** `INSERT ... ` **without** `RETURNING` produces an empty rows array with `command === "INSERT"` and the affected-row `count`; `INSERT ... RETURNING *` returns the inserted row(s). _(refs: postgres.js#649)_

### Pool & client lifecycle contract
**Why it matters / failure mode:** Docs repeatedly mislead on `done()` vs `release()`, `max:0`, and process-exit-on-idle-error. Wrong behavior leaks connections or crashes apps.
- **Test:** A client obtained via `pool.connect()` exposes `client.release()`; calling it returns the client to the pool (subsequent `pool.connect()` reuses it; pool does not exhaust). _(refs: node-postgres#1302, node-postgres#930, node-postgres#1522)_
- **Test:** Configuring pool `max: 0` resolves to the documented default of **10** (does not disable pooling / hang). _(refs: node-postgres#1977)_
- **Test:** When an **idle** pooled client emits an `error` (server closes it), the pool removes that client and continues serving subsequent `pool.connect()`/queries successfully — no `process.exit` required. _(refs: node-postgres#2843)_

### Cursor lifecycle
**Why it matters / failure mode:** Cursor `read` past end and cursor-close-on-error semantics are documented contracts for streaming large result sets.
- **Test:** After a cursor has yielded all rows, an additional `cursor.read(n)` resolves with a **zero-length** rows array (clean EOF, no error). _(refs: node-postgres#3034)_
- **Test:** When a query through a cursor errors, the cursor can be closed and the underlying client is released back to the pool in a usable state (no leaked/locked client). _(refs: node-postgres#3607)_

### Raw SQL / anonymous blocks / low-level execution
**Why it matters / failure mode:** Users execute DDL and PL/pgSQL `DO` blocks directly; these have no result rows and must not error.
- **Test:** Executing a `DO $$ BEGIN ... END $$;` anonymous PL/pgSQL block via `client.query` succeeds and returns a result with `command === "DO"` and no rows. _(refs: node-postgres#3163)_
- **Test:** A query executed through the lower-level connection/query API returns awaitable results (rows + metadata) equivalent to the high-level API. _(refs: node-postgres#3220)_

### Connection via unix socket (peer auth)
**Why it matters / failure mode:** Setting `host` to a socket-directory path must connect over the local unix socket (enabling peer auth), not attempt TCP to a hostname.
- **Test:** Setting `host` to a unix-socket directory path (e.g. `/var/run/postgresql`) connects via the local socket and authenticates as the OS user under `peer`/`trust`, with no TCP connection attempted. _(refs: node-postgres#1797)_

### Getting-started example runs as documented (ESM/CJS)
**Why it matters / failure mode:** The published example must run verbatim under both module systems; a named-export mismatch breaks every new user's first script.
- **Test:** The documented getting-started snippet runs unchanged under CommonJS (`const { Client } = require(...)`) and under ESM (default + named import) without a missing-named-export error, connecting and returning `SELECT NOW()`. _(refs: node-postgres#3190, node-postgres#3096)_

> **Non-testable majority:** typos, wiki/"extras" link additions, changelog/release-notes requests, broken site links, SSL-cert/site-down reports, "how do I…" questions, and example-style preferences (async/await vs callbacks) carry no asserted driver behavior and are intentionally excluded from the suite.

### ✅ Verification notes
Behaviors are overwhelmingly correct and well-grounded in the cited issues. Two corrections to the expected outcomes:

- **Wrong OID label (line 14, ref node-postgres#808).** The text claims `text[]` is OID **1015**. OID 1015 is `_varchar` (varchar[]); the correct OID for `text[]` is **1009**. The test should either bind/round-trip as `varchar[]` if it keeps OID 1015, or use OID 1009 to assert `text[]`. (The mislabel was inherited from the issue's intent string, but it is still incorrect per pg_type.)
- **escapeIdentifier/escapeLiteral on Pool (line 24, ref node-postgres#1978).** The reference driver exposes these as `Client` static/instance methods, not on `Pool`. The issue itself only asks for them on Pool "ideally." Asserting they MUST be available on Pool would fail against node-postgres; recommend softening to Client-required, Pool-optional.

Everything else verified correct: int8-as-string default + `parseInt8` opt-in and int2/int4-as-Number (#968); `max:0`→10 via falsy coalesce (#1977); JS object→JSON auto-serialize vs JS array→Postgres array footgun (#2482); identifier/literal doubling rules; postgres.js `.simple()` rejecting params, lazy thenable execution (#429), fragment param-renumbering (#566/#753), result `command`/`count` shape (#69), INSERT-without-RETURNING empty rows + RETURNING (#649); cursor EOF zero-length read (#3034); `DO $$…$$` → command tag `"DO"` (#3163); unix-socket host-path peer auth (#1797).

Coverage of high-signal items is complete: no record is `kind=bug/regression AND testable=high` (bugs #1929/#1994 are testable=none); the sole testable=high item #968 is covered. No omitted tests to add.


## Other

_This bucket is mostly meta/governance/off-topic noise (releases, CI, ORM questions, SQL-help), but a thin seam of genuinely testable driver behavior runs through it: how the driver passes raw SQL to the server unchanged, how Postgres identifier casing/quoting and `search_path` resolution surface to the user, rejection of foreign (MySQL) dialect, and query cancellation. These matter because a new driver must be a faithful, transparent pipe to the backend — it must not rewrite SQL, must surface PG's exact error codes, and must not silently swallow or mangle results._

### SQL passthrough — driver must not rewrite or interpret statements
**Why it matters / failure mode:** A driver is a transport, not a SQL parser. Several "it works in psql/pgAdmin but not here" reports stem from expectations that the driver normalizes or special-cases SQL. The driver must send the statement bytes verbatim and let the server validate them.
- **Test:** A multi-statement-feature like `WITH d AS (DELETE FROM t WHERE ... RETURNING *) SELECT * FROM d` is sent unchanged; the rows actually deleted are returned, identical to running it in psql. The driver must not strip, reorder, or reinterpret the CTE/`WHERE` clause. _(refs: postgres.js#850)_
- **Test:** `CREATE OR REPLACE TRIGGER ...` is forwarded verbatim. On a server that supports it (PG 14+) it succeeds; on older servers the server returns a syntax error — the driver must surface whatever the server says and never pre-validate/reject the syntax itself. _(refs: postgres.js#971)_
- **Test:** Upsert / `INSERT ... ON CONFLICT ... DO UPDATE` and `INSERT ... RETURNING` execute exactly as written, with `RETURNING` rows delivered in the result set. _(refs: node-postgres#1251, node-postgres#2571, node-postgres#2562)_

### Identifier case-folding and quoting (Postgres semantics)
**Why it matters / failure mode:** Postgres folds **unquoted** identifiers to lowercase and only preserves case for **double-quoted** identifiers. Users coming from case-insensitive or different-folding databases hit "relation does not exist" and assume a driver bug. The driver must transmit identifiers byte-for-byte and not quote/case-normalize on the user's behalf.
- **Test:** `CREATE TABLE Foo (...)` then `SELECT * FROM foo` succeeds (object stored as lowercase `foo`); but `SELECT * FROM "Foo"` raises `42P01` (relation does not exist), because the unquoted DDL folded the name. _(refs: node-postgres#3257, node-postgres#3259)_
- **Test:** `CALL getAllProjects()` resolves to the lowercase routine name `getallprojects`; case is preserved only when the routine is both created and called with double quotes (`CALL "getAllProjects"()`). Verify both the folding and the quoted-preservation paths. _(refs: node-postgres#3257)_
- **Test:** `CREATE TABLE "user" (id int)` — a double-quoted reserved word — succeeds and is queryable via `SELECT * FROM "user"`, while unquoted `SELECT * FROM user` returns the session user name (reserved keyword), not the table. _(refs: node-postgres#3221, node-postgres#1268)_
- **Test:** A column name containing a space, e.g. `"first name"`, is selectable only when double-quoted; the driver passes the quotes through untouched. _(refs: node-postgres#1268)_

### Schema / search_path resolution
**Why it matters / failure mode:** "relation does not exist" against a table the user *knows* exists is almost always a `search_path`/schema mismatch between the connection and where the object lives. The driver must apply connection-string/`options` search_path correctly and not inject its own default that masks the user's schema.
- **Test:** With a table created in schema `myschema`, a query `SELECT * FROM t` fails with `42P01` unless the connection's `search_path` includes `myschema` (or the table is qualified `myschema.t`); setting `options=-c search_path=myschema` (or equivalent driver config) makes the unqualified query succeed and return rows. _(refs: node-postgres#1754, node-postgres#3259, node-postgres#2985)_
- **Test:** A schema-qualified function call `myschema.func()` resolves when `myschema` exists and contains `func`; otherwise the server returns `42883`/`42P01`. Driver does not rewrite the qualification. _(refs: node-postgres#2478)_

### Reject foreign (MySQL) dialect — no silent success, no driver-side translation
**Why it matters / failure mode:** Users paste MySQL-flavored SQL and expect it to work or get a clear error. The driver must NOT translate MySQL syntax, and the server's error must propagate so the result is never a silent empty set that looks like "lost data."
- **Test:** A query using MySQL backtick identifiers, e.g. ``SELECT `col` FROM `t` ``, raises a server syntax error (`42601`). It must NOT silently return zero rows or be auto-rewritten to double quotes. _(refs: node-postgres#2903)_
- **Test:** `LOAD DATA LOCAL INFILE ...` (MySQL) raises `42601` syntax error; the driver offers no client-side file-loading shim. (Correct PG path is `COPY ... FROM STDIN`.) _(refs: node-postgres#1817)_

### psql backslash meta-commands are not SQL
**Why it matters / failure mode:** Commands like `\l`, `\dt`, `\d` are psql client features, not server SQL; sending them to the wire yields a syntax error. A driver must not pretend to support them.
- **Test:** Sending `\l` raises a server syntax error (`42601`); listing databases must instead use `SELECT datname FROM pg_database`, which returns the expected database rows. _(refs: node-postgres#2057)_

### Query cancellation / no client-induced server lockup
**Why it matters / failure mode:** A reported "freezes the entire database server" points at a missing or broken cancel path and at lock contention the driver must not deadlock on. The driver must expose cancellation and never hold a connection in a state that blocks the backend indefinitely.
- **Test:** A long-running statement (e.g. `SELECT pg_sleep(30)`) can be cancelled via the driver's cancel mechanism (out-of-band CancelRequest); the statement returns query-canceled (`57014`) promptly and the connection is reusable afterward. The driver must not require killing the process or restarting the server. _(refs: node-postgres#2953)_
- **Test:** A statement that blocks on a lock held by another session does not wedge the pool: the blocked query respects `statement_timeout`/`lock_timeout` if set and returns `55P03`/`57014`, freeing the connection. _(refs: node-postgres#2953)_

### API surface footguns (wrong-library / version drift)
**Why it matters / failure mode:** Cross-library confusion (calling a postgres.js method on a node-postgres client) and breaking-change regressions show up as `TypeError`s and silent behavior shifts. A driver's public method names and result shape are a contract to lock down.
- **Test:** The driver's documented query entry points exist and are functions on a fresh client/pool instance (guard against `client.X is not a function` regressions); calling an unknown method throws a clear `TypeError`, not a hang. _(refs: node-postgres#3120)_
- **Test:** Result objects expose a stable shape (`rows`, `rowCount`, `fields`) across releases; a regression that changes parameter handling or default types is caught by a snapshot of `SELECT 1 AS n` returning `rowCount=1` and `rows=[{n:1}]`. _(refs: node-postgres#1745)_

### ✅ Verification notes
Verified live against PostgreSQL 14.15. Most expectations are correct, including the non-obvious ones:
- Line 13 (case folding) — confirmed: `SELECT * FROM foo` succeeds, `SELECT * FROM "Foo"` → `42P01`.
- Line 14 (CALL folding) — confirmed: `CALL getAllProjects()` resolves to `getallprojects`; `CALL "getAllProjects"()` → `42883`.
- Line 15 — confirmed (my initial skepticism was wrong): `SELECT * FROM user` does NOT error and does NOT hit the table; the reserved word `user` in FROM position evaluates as the special value expression and returns the session user (one-column, one-row). Claim is accurate.
- Lines 20/25/26/30 — confirmed: unqualified table w/o search_path → `42P01`; MySQL backticks → `42601`; `LOAD DATA ...` → `42601`; literal `\l` sent as SQL → `42601`.

Correction (1):
- **Line 21** — error-code list `42883/42P01` for a schema-qualified function call is imprecise. A **missing schema** raises `3F000` (invalid_schema_name), not `42883`/`42P01` (live: `SELECT myschema.func()` → `3F000`). `42883` (undefined_function) only applies when the schema EXISTS but the function does not. `42P01` (undefined_table) does not apply to a function call at all. Recommend: "missing schema → `3F000`; existing schema but missing function → `42883`."

Omitted high-signal tests: none. No record in this section is `kind ∈ {bug,regression} AND testable=high` (all testable values are `none`/`low`); the two low-testable bugs/regressions that are genuinely behavioral — cancellation (#2953) and result-shape regression (#1745) — are already covered. No coverage gap.


## Coverage Gaps & Test-Suite Priorities

_Meta-review of the 43 issue-derived section files. The suite is unusually strong: every section pairs concrete, ref-grounded assertions with a failure-mode rationale and a PostgreSQL-semantics verification pass. The gaps below are the predictable blind spots of an **issue-derived** corpus — correct behaviors that rarely generate GitHub issues, and therefore are thin or absent above — plus cross-cutting consistency risks._

---

### Mandatory behaviors UNDER-represented in issues

An issue cluster is a proxy for *pain*, not for *importance*. Behaviors that "just work" produce no issues, so a suite mined from issues structurally under-tests them. The following are must-haves a correct driver needs that the current sections cover thinly, implicitly, or not at all.

**Whole type-families that are absent or single-issue-thin (no happy-path round-trip exists):**
- **Network/address types — entirely missing.** `inet`, `cidr`, `macaddr`, `macaddr8` appear in **no** section. These are common columns; the driver must at minimum round-trip them as canonical strings (and decide on a structured representation). Add insert→select round-trip + NULL + array (`inet[]`) tests.
- **`money` (scalar)** — only present as a `money[]` array-element decode (array §, np#781). No scalar `money` encode/decode/round-trip, no locale/`lc_monetary` note.
- **Full-text types `tsvector` / `tsquery`** — only `to_tsquery($1)` appears as a *parameter-context* case (parameters §). No decode/encode/round-trip of a stored `tsvector` column.
- **`xml`, `pg_lsn`, `"char"` (oid 18), `name` (scalar), `int2vector`, `txid`/`xid8`** — absent. `name[]` is tested (array §) but scalar `name`/`"char"` are not.
- **`time` (without tz)** — `timetz` gets one test (datetime §9, pgjs#54); bare `time` decode/encode is not asserted on its own.
- **`bit`/`varbit`** — present only inside the `bool` section as a sub-item; deserves an explicit width/round-trip test independent of boolean.

**The single biggest structural gap — there is no "all-common-types round-trip matrix."** Because the suite is bug-clustered, there is no one test that guarantees *every* common scalar (`bool, int2, int4, int8, float4, float8, numeric, text, varchar, char(n), bytea, uuid, date, time, timestamp, timestamptz, interval, json, jsonb, inet, money, oid`) survives a `INSERT $1 → SELECT` round-trip, NULL round-trip, and `= ANY($1::T[])` array round-trip. The array section references such a matrix (np#125) for array decode; the scalar/param path has no equivalent. **Add a parameterized type-matrix smoke test** — the highest-value single addition, since it converts dozens of implicit assumptions into one explicit guarantee and is exactly what no issue will ever file.

**Protocol & CRUD baselines that exist only "around a bug," not as positive guarantees:**
- **Successful extended-protocol message sequence.** Lots of tests assert recovery *after* an error (Sync/RFQ cleanup) and the Bind byte-layout (np#3487), but there is no positive "a clean Parse→Bind→Describe→Execute→Sync round trip emits exactly those messages in order and yields the row" baseline. Make the happy path a first-class assertion, not just the error path.
- **Binary result format for every common type.** Only int4/int8/uuid/timestamp binary decode is asserted (binary-format §). A correct driver needs binary↔text equivalence across the full common-type set (esp. `numeric`, `bool`, `bytea`, `date`, arrays) — currently a hole, and silent binary corruption is invisible (np#3495 shows the class).
- **Plain CRUD without a footgun attached.** UPDATE/DELETE happy paths surface only via `rowCount`/RETURNING bug tests (results §). Add bare "UPDATE n rows then SELECT observes them" and "DELETE then SELECT gone" baselines.
- **Multi-row ordering & completeness** — covered for `ORDER BY` (results §) but not as a general "N rows in, N rows out, same order, no dedup" invariant across row counts (1, 0, large).
- **NULL in every position, per type.** NULL is well covered for numeric/text/bool/parameters, but not uniformly: NULL as param AND as result for *each* type, and NULL elements inside *each* array type (only int2[]/text[]/bytea[]/numeric[] have explicit NULL-element tests).
- **Parameter escaping / injection** is well covered (parameters "verbatim transmission" + security §) — not a gap, listed for completeness.

---

### Priority ranking of test modules

Ranked by (issue volume × severity × protocol-criticality), and ordered for *build sequence* — P0 is the foundation you cannot test anything else without, plus the highest-severity (silent-corruption / process-crash / production-outage) surfaces.

**P0 — build first (foundation + max severity/criticality):**
| module | one-line justification |
|---|---|
| `connection` | 196 issues; nothing runs until URL/env/socket/startup parsing works — blocks all usage. |
| `auth` | The gate every connection passes; wrong-password/SCRAM-concurrency bugs crash the process before any query. |
| `query-protocol` | Wire framing + simple-vs-extended routing; one bug here silently corrupts or desyncs everything downstream. |
| `parameters` | 315 issues / 171 high-testable — the highest-traffic correctness surface; the Bind path itself. |
| `results` | 141 issues / 76 high-testable — the data contract every consumer destructures; small deviations silently corrupt app data. |
| `errors-notices` | 162 issues, biggest source of uncatchable crashes; the "every error is catchable" invariant is load-bearing. |
| `prepared-statements` | Extended-protocol cache correctness; a wrong cache key silently executes the wrong text. |
| `transactions` | Highest data-loss stakes — commit/rollback/abort-state correctness. |
| `pooling` | 250 issues — #1 production hang/leak/"too many clients" source; deterministic check-in/out is foundational. |
| `lifecycle-reconnect` | 207 issues / 150 bugs — the "promise hangs forever / uncatchable crash" cluster; every terminal event must settle. |

**P1 — build second (connection gates, data-corrupting types, dangerous protocol sub-states):**
| module | one-line justification |
|---|---|
| `tls-ssl` | 90 issues / 42 bugs; a connection gate with heavy regression history (config coercion, negotiation framing, verification). |
| `types/datetime` | 47 high-testable; the single most silently-corrupting type (wall-clock vs instant, off-by-one-day/N-hours). |
| `types/numeric` | 38 high-testable; int8/numeric precision loss above 2^53 silently corrupts ids. |
| `types/json` | 53 high-testable; double-encoding/`[object Object]`/array-vs-jsonb is the top silent-corruption footgun. |
| `types/array` | 42 high-testable; touches every scalar codec + the brace grammar + element-type inference. |
| `types/bytea` | 18 high-testable; binary safety — any UTF-8 coercion silently truncates files/blobs. |
| `cursors-streaming` | 90 issues / 44 bugs; leak/deadlock at the protocol×pool×transaction intersection. |
| `cancellation-timeout` | Production hangs; CancelRequest + AbortSignal + statement_timeout catchability. |
| `concurrency` | Single-connection serialization + pool parallelism; protocol-state races corrupt results. |
| `copy` | Protocol sub-state (CopyIn/Out) — drives connection hangs/leaks if mis-driven; dangerous failure class. |
| `security` | Low volume (19) but max severity: SQL injection, prototype pollution, secret redaction, identifier escaping. |
| `types/text` + `encoding` | UTF-8 byte-fidelity + non-UTF8 client_encoding + NUL handling — cross-cutting with parameters. |
| `listen-notify` | 33 issues; out-of-band delivery on a long-lived connection with reconnect/re-registration. |
| `api-ergonomics` | Volume inflated by feature requests, but the promise/callback/instanceof/dynamic-SQL core is a hard contract. |
| `runtime-portability` (import/load subset only) | 0 high-testable, but a basic "imports & connects under Node/Deno/Bun/ESM/CJS" smoke is a P1 CI gate; the bundler matrix is P2. |

**P2 — build later (low protocol-criticality, niche types, environment/meta):**
| module | one-line justification |
|---|---|
| `types/composite`,`custom`,`domain`,`enum`,`geometric`,`range`,`hstore`,`uuid`,`bool`,`oid`,`binary-format`,`types/other` | Low issue volume; mostly extension/custom-parser surfaces — round-trip + registration-hook tests, build after core codecs. |
| `replication` | 16 issues, niche logical-replication sub-protocol; valuable but not a general-driver gate. |
| `build-native` | 126 issues / 0 high-testable — packaging/install (no compiler, optional native); belongs in a **CI install matrix**, not the unit suite. |
| `runtime-portability` (bundler/alt-runtime matrix) | 250 issues / 0 high-testable — webpack/Vite/Deno/Bun/edge; a **build-matrix harness**, not in-process tests. |
| `performance` | 80 issues / 0 high-testable — relative benchmarks (plateau/within-constant-factor); a **separate perf-regression harness**, flaky as pass/fail. |
| `docs` | 163 issues / 1 high-testable — the section correctly extracts ~15 behavioral items; the rest is non-testable noise. |
| `other` | 131 issues / 0 high-testable — governance/ORM-help noise; thin testable seam (SQL passthrough, identifier folding) already captured. |

---

### Risk notes

**Volume-inflated / not unit-testable in the main runner (don't let issue counts drive priority):**
- `runtime-portability` (166 bugs) and `build-native` (91 bugs) carry the largest bug counts after lifecycle, but **0 high-testable** each — they are bundler/install/ABI concerns that need a CI build-and-import matrix, not an in-process test runner. Pulling them forward by raw bug count would misallocate effort.
- `performance` (33 bugs, 0 high) asserts *relative* bounds (plateau, "within a constant factor of libpq"); these are inherently flaky as boolean assertions and belong in a dedicated perf-regression job.
- `docs` (2 bugs, 1 high) and `other` (14 bugs, 0 high) are mostly non-behavioral noise; both sections already self-identify the thin testable seam.

**Internal-consistency / miscategorization flags surfaced by the sections' own verification passes (worth a second look):**
- `types/numeric`: the **NaN round-trip** assertion contradicts the section's own string-default design (`'NaN'::numeric` decodes to the *string* `"NaN"` by default, not JS `NaN`). A self-inconsistent spec — fix before implementing.
- `types/json`: the `::json` equality test codifies an **impossible** PG expectation (`json` has no equality operator; needs `::jsonb`/`::text`).
- `prepared-statements`: the parameterized **`CREATE VIEW`** test (pgjs#1102) expects bind/infer success, but PG returns 0 parameters for a DDL param — unachievable as written.
- `types/datetime`: np#1350 is **input** serialization miscategorized under the **output** type-parser registry (§8); np#783 (parse-as-UTC) is listed but its behavior is never actually exercised.
- Numerous **mis-cited refs** are caught per-section (e.g. encoding/§ np#1562, pooling idle-timeout-0 inverted semantics between the two parent drivers, transactions §3 25001/25P01 are warnings not errors). The verification notes catching these is a *strength*; they should be applied as edits, not left as caveats.

**Cross-cutting concerns that span multiple modules and need ONE canonical contract each (otherwise sections will assert subtly divergent behavior):**
- **Timezone / DateStyle** spans `types/datetime` + `connection` (startup `TimeZone`/`DateStyle` params) + `pooling` (per-connection SET) + `results`. The wall-clock-vs-instant model only holds if the startup/session timezone tests are pinned together — test as one cross-module suite.
- **NUL byte (0x00)** is asserted independently in `parameters`, `query-protocol` (C-string termination), `types/text`, `encoding`, and `security` — with at least one section (security) wrongly listing it as round-trippable. Define ONE contract: text/varchar 0x00 → deterministic error every time; bytea 0x00 → round-trips; query-text 0x00 → client-side reject before the wire.
- **bigint default** spans `types/numeric` (int8→string), `types/json` (bigint-in-json precision), `parameters` (`BigInt` serialization), `results` (`BIGINT` as string). One default (string) must be asserted identically everywhere; the opt-in BigInt path likewise.
- **Type-parser registry scoping** (global vs pool vs client vs query) spans `types/custom`, `types/oid`, `types/datetime`, `types/json`, `results`. The no-cross-contamination model must be one shared invariant, not re-specified per type.
- **Simple-vs-extended protocol routing** spans `query-protocol`, `parameters`, `transactions` (implicit txn), `results` (multiple result sets), `prepared-statements`, `copy`, `security` (stacked-query injection), `replication` (simple-only). A single routing model + multi-statement policy must underpin all of them.
- **"Every terminal event settles a promise or surfaces a catchable event, never an uncaught crash"** spans `errors-notices`, `lifecycle-reconnect`, `auth`, `tls-ssl`, `connection`, `pooling`, `cursors-streaming`, `copy`. This is the suite's single most-repeated invariant — make it a shared test harness/assertion helper applied uniformly rather than re-derived in each section.
- **Pooled session-state leakage** (`SET`/GUC/`search_path`/RLS `SET LOCAL`) spans `pooling`, `transactions`, `connection`, `security` — both a correctness and a security boundary; test the reset-on-checkin contract once and reference it from all four.
