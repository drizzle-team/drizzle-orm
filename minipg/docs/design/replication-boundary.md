# Replication logic: what belongs in minipg, what stays in pulse

> **Superseded by `replication-proposal.md`.** This file is kept for its Part 2 (what the
> move does to drizzle-pulse), which the proposal drops. Where the two disagree, the proposal
> wins, most visibly on section D below, whose setup helpers the proposal removed entirely.

Investigation of which replication-related logic in drizzle-pulse would move down into
minipg, so that minipg consumers (prisma, kysely, drizzle-orm, hand-rolled) can consume WAL
without carrying replication folklore. Sources: the vendored minipg 0.1.0 dist and the
upstream repo (fully converged as of `30978a9`: `bf6dba3` landed the shapes half rewritten
as shapes-as-tuples, `30978a9` landed the session-ergonomics half and adopted the vendored
capability-gate `binary:'auto'` by deleting `replBinaryMatchesText`, so the value-neutral
auto question is an open semantics decision, item 1.2 of the proposal), the full
pulse-runtime
inventory (31 mechanisms), and a survey of pg-logical-replication, postgres.js
`subscribe()`, Debezium, ElectricSQL, Sequin, Supabase Realtime, and wal2json/psycopg2
history. Claims below were adversarially checked against driver source, pulse source, and
Postgres source (`proto.c`, `heapam.c`).

Guiding split, following the precedent of commit 4bb5eeb (CopyDone typed error, AbortSignal,
ack normalization, shape-aware binary probe all moved down): **minipg owns mechanism**,
anything true of Postgres logical replication for every consumer. **Pulse keeps policy and
product semantics**: collections, auth scoping, events tables, and every decision where two
reasonable consumers would choose differently.

A structural note first. The raw `ReplicationConnection` API stays exactly as-is. New logic
lands in three places: fixes inside the raw layer, small pure helpers, and a managed CDC
session as a separate subpath export (or a sibling package; that is a packaging call, the
constraint is only that the raw layer stays minimal and the managed layer is skippable on
runtimes that can't hold a walsender anyway).

---

## Part 1 — what moves into minipg, in priority order

### A. Raw-layer fixes (do these regardless of everything else)

1. **Slot-name validation.** Slot names are interpolated raw into three commands
   (`createSlot`, `dropSlot`, and `START_REPLICATION SLOT` inside `start()`), while
   publication names are escaped at both their sites. Postgres restricts slot names to
   `[a-z0-9_]`, so a regex plus a throw closes an injection-adjacent hole in two lines.
   Highest value per byte in this whole list.

2. **`binary: 'auto'` value drift.** The vendored build dropped upstream's
   `replBinaryMatchesText` guard, so on PG 14+ auto-negotiated binary decodes arrays to real
   JS arrays and float4 to the exact f32, while PG 13 or a text fallback yields raw `'{…}'`
   literals and canonical numbers. Same consumer code, different values, decided by a probe
   the user never sees. For the stated goal this outranks every semantic helper: TOAST at
   least fails visibly. Either restore the matches-text constraint for `'auto'` (auto goes
   back to being representation-neutral) or document the divergence in bold and expose
   `binaryTuples` prominently. Shaped columns are safe either way (the spec pins the JS
   target); the exposure is unshaped columns.

3. **Receive timeout.** Today a black-holed connection parks `next()` until the TCP
   retransmission budget blows (~15 minutes on Linux), and forever behind a proxy that keeps
   ACKing. No consumer can fix this from outside; pulse's retry loop only reacts to throws.
   Add `receiveTimeoutMs` to `StartOptions` (absolute milliseconds, generous default or off,
   docs anchored on `wal_sender_timeout`: the server heartbeats at half of it, 15 s by
   default). Roughly six lines around `next()`, plus expose `socket.setKeepAlive` through
   the config. The trigger must be its own clock; tying it to `statusIntervalMs` (the
   client's send cadence) would false-positive on every idle stream.

4. **Guard `command()` during streaming.** `command()` and the `start()` loop drain the same
   queue; a mid-stream `command()` eats CopyData frames and corrupts the stream silently.
   A `streaming` flag and a throw. Prerequisite for any managed-layer logic that issues SQL.

5. **Backpressure.** The parsed-message queue is unbounded; a slow consumer buys an OOM.
   `maxQueueBytes` with `socket.pause()/resume()` hysteresis, lifting the pattern the
   normal query stream already implements in `connection.js`. The status timer keeps
   running while paused, so the server won't time the client out.

6. **Publication probe as a signal.** The binary auto-probe already queries
   `pg_publication_tables` and requires a non-empty result; an absent or empty publication
   currently produces a silent downgrade to text and then a silent empty stream. Turning
   zero rows into a warning or error is one branch and answers the single most common
   "why am I getting no events" support question. This is the entire preflight worth
   having: `wal_level` and the replication role already fail loudly at
   `CREATE_REPLICATION_SLOT` and connect.

7. **Mid-stream DDL under binary, caught at announce time.** A column added after `start()`
   whose type has no binary decoder currently throws hours later on its first value, deep in
   tuple decoding. `relEntry()` already runs on every DDL re-announce and already resolves
   decoders; detect there and throw something actionable naming the column.

8. **Unknown-relid tuples throw.** Tuples for a never-announced relation currently decode
   under a placeholder with columns named "0", "1" holding raw UTF-8. Near-unreachable per
   protocol, which makes it a correctly sized assert. The unknown-tag throw stays as-is: at
   pinned proto v1 the tag set is closed, and silently ignoring a v2 stream tag would mean
   uncommitted rows flowing through undetected.

9. **Documentation.** The package README is a `bun init` stub. Much of "users need perfect
   WAL knowledge" is this, and only this. The d.ts comments are already excellent; the
   README needs the consumer-facing story: the slot lifecycle, the ack taxonomy
   (`endLsn`, and why), what `oldKind` means and what drives it, the snapshot shelf life
   stated bluntly (`start()` ends it, full stop, since START_REPLICATION is itself a
   walsender command), and the trap that `columns[].key` reads all-true under
   REPLICA IDENTITY FULL (pgoutput sets the identity flag on every column in that mode).

### B. Event-semantics helpers (small, pure, opt-in)

10. **TOAST hydration, opt-in.** pgoutput omits an update's unchanged TOASTed columns from
    the new tuple (absent, never null); with a full old tuple the driver holds everything
    needed to fill them, in shape keys, for old and new alike. Ship it as
    `hydrateToast: true` or an exported `hydrateUnchanged(update)`, keeping `unchanged`
    populated as provenance. Never mutate `new` silently by default: a search indexer
    optimizing "reindex changed fields only" and a warehouse loader doing column-level
    provenance both need the un-hydrated shape, and the ecosystem split three ways here
    (Debezium placeholder, pg-logical-replication old-tuple repair, Electric
    changed-columns-only), which is the signature of policy. One thing verified along the
    way: old tuples can never carry the unchanged marker, because Postgres flattens TOAST
    before logging old images (`toast_flatten_tuple` in `ExtractReplicaIdentity`). That is
    precisely why hydration from a FULL old row is complete, and why no old-side `unchanged`
    surface is needed.

11. **Commit batching as a helper, not a mode.** A ~15-line exported generator
    `batchByCommit(stream, { maxEvents? })` assembling
    `{ xid, commitLsn, endLsn, commitTime, events[] }`. Commit boundaries are the one thing
    a consumer can't reconstruct if the driver drops them (postgres.js proves it: its commit
    handler is a literal noop, so atomic application is impossible downstream), and acking
    anything except a commit boundary is the wal2json mid-transaction data-loss trap.
    Helper rather than envelope because one transaction can be 50M rows (memory ceiling
    stays the consumer's informed choice via `maxEvents`), empty DDL begin/commit pairs must
    pass through by default (they are a liveness signal), `truncate` and `relation` must be
    delivered inside the batch (dropping truncate is consumer policy, pulse's specifically),
    and freezing a tx envelope now would fight the proto v2 streaming upgrade path.
    Non-transactional `pg_logical_emit_message` events need a stated home (out-of-band or
    documented as dropped in batched consumption).

12. **Replica-identity diagnostics, event-triggered.** Fire an optional `onWarning` once per
    relation the first time an `update`/`delete` arrives with `oldKind !== 'full'`, naming
    the table and what the consumer will be missing. Event-triggered means zero false
    positives (an insert-only outbox table under identity DEFAULT is correct and stays
    silent) and zero catalog queries. Same channel warns when a published relation is a
    partition and `publish_via_partition_root` is off, which otherwise surfaces as
    partition-named relations that break any consumer keyed by table name. This single
    signal converts four separate mystery bugs (missing old rows, TOAST holes,
    undetectable key changes, silently missing deletes) into one message. Precedent:
    every serious system documents replica identity as the root of these; a driver that
    reports it beats both JS libraries, which assume it silently.

13. **Key-change signal, the honest version.** Under identity DEFAULT/INDEX the signal
    already exists and is exact: `oldKind === 'key'` fires only when the identity key
    actually changed. One sentence of d.ts. Under FULL the wire genuinely does not say
    (every column is flagged key), so a driver-computed `keyChanged` needs a
    consumer-declared key: an optional `TableShape.key?: string[]`, compared with a
    driver-grade comparator (composite keys, `Date`/`Buffer` identity; pulse needed
    `pkValuesEqual` for exactly this). No event splitting in the driver: synthesizing
    delete+insert fabricates two records from one WAL record (an audit log must not see
    that), bakes in delete-before-insert ordering (a last-write-wins sink loses the row),
    and Debezium only gets away with it via correlation headers a driver has no place
    inventing. Pulse keeps the split; with a declared key it shrinks to checking one flag.

### C. Managed CDC session (`minipg/cdc` subpath or sibling package)

The consumer-facing shape, roughly:

```ts
const stream = replicate({
  url,
  slot: 'temporary' | { name: 'my_slot' },
  publications: ['pub'],
  shapes,
  backfill: async ({ snapshot, consistentPoint, reconnect }) => { /* pin + read */ },
  onTransaction: async (tx) => { /* persist */ },      // ack follows resolution
  retry: (attempt, err) => delayMs | null,             // default: jittered backoff
  onWarning, onTerminal,
})
```

14. **Reconnect loop.** The mechanism (loop, abortable sleep, terminal surfacing) is
    identical for every consumer; the numbers are not. So: a `retry` callback returning a
    delay or null-to-stop, with a jittered exponential default, and budget-style behavior
    expressible in the callback. Two insights from pulse move down with it: progress must
    reset the budget (otherwise failover flapping reconnects forever), and progress means
    **acked**, never merely delivered. One insight pulse itself missed moves in for free:
    a server CopyDone ends the copy, never the session, and the connection is documented as
    usable for a follow-up `start()`. A temp slot survives it. So the CopyDone path can
    re-`start()` on the same connection with no new slot, no snapshot, no rebaseline; only
    socket death forces the full path. Pulse today tears the connection down
    unconditionally in its `finally`, paying a rebaseline it doesn't owe.

15. **Slot modes, explicit and honestly named.** `'temporary'`: random-suffixed temp slot
    per session, snapshot export, documented as gap-ful across outages (the postgres.js
    lesson: the worst outcome is a library that looks durable and is not; second worst is
    durability requiring hand-rolled DDL, the pg-logical-replication status quo).
    `{ name }`: durable, create-if-absent, health-checked on connect. Detection is
    mechanism and moves down: slot row absent, `wal_status = 'lost'`, null
    `confirmed_flush_lsn`, timeline/systemId change since last connect (from
    `identify()`, currently decoded and unused; a promoted standby invalidates
    everything). Decisions stay with the consumer as typed outcomes: `SlotInvalidatedError`
    rather than silent recreate (recreating skips the WAL range between confirmed_flush and
    the new consistent point; pulse absorbs that by rebaselining, an audit log gets a
    permanent hole), `onSlotBusy: 'error' | 'evict'` defaulting to `'error'`
    (`pg_terminate_backend` can't distinguish a zombie from a colleague's healthy
    walsender, needs `pg_signal_backend`, and a cross-role attempt must be terminal, never
    retried), and an `onResume` seam receiving `{ confirmedFlush, restartLsn }` so a
    consumer can express "the server released WAL past what I durably persisted"
    (that one test only the consumer can run; it is the load-bearing row of pulse's resume
    decision table). The 42704/55006 drop-retry shapes and the eviction poll are mechanism
    and move down. No second connection needed for any of it: the logical walsender accepts
    plain SQL via `command()`, valid up until `createSlot` (the exported snapshot dies on
    the next command) and `start()`.

16. **Backfill window.** When a session (re)creates a slot with an exported snapshot, the
    layer awaits `backfill({ snapshot, consistentPoint, reconnect })` strictly between
    `CREATE_REPLICATION_SLOT` and `START_REPLICATION`, enforcing the shelf life
    structurally instead of documenting it. The consumer pins the snapshot on its own
    client (`transaction({ isolationLevel: 'repeatable read', snapshot })` in drizzle's
    case; prisma and kysely equally need their own handle, which is why the layer hands
    over names, never connections). An optional deadline races the callback promise: the
    pre-stream window holds the slot with nothing consuming WAL, so a hung baseline read
    grows retained WAL for as long as it hangs. A promise race protects that without the
    driver reaching into anyone's GUCs. The `reconnect` flag replaces pulse's
    `hasConnectedBefore` (first-connect seeding and reconnect rebaselining are different
    consumer actions on the same window).

17. **Consumption and ack.** The callback shape (`onTransaction`) is the one shape where
    "handler completed" is knowable, so there ack-on-resolution is a safe default and
    persist-then-ack falls out naturally. The iterator shape keeps explicit `ack()`:
    auto-ack-on-next-pull looks equivalent for a sequential `for await` body and silently
    becomes at-most-once the moment a consumer goes async or batches
    (`void handle(tx)` compiles fine), which is pg-logical-replication's
    `acknowledge.auto: true` bug re-implemented one tick later. psycopg2's history is the
    same lesson from the other side. The driver's existing two-position model (consumer
    `flushed` vs keepalive `idleAck`, the latter gated on nothing being unacked) is already
    correct; it stays.

18. **Explicitly rejected for the managed layer.** In-session replay dedupe: filtering on
    delivered loses exactly the redelivery a reconnect exists to provide, filtering on
    acked duplicates what the server already does; dedupe-by-commit-LSN stays a documented
    consumer recipe (four lines) because only the consumer knows what it durably processed.
    WAL-retention monitoring beyond the connect-time health check would need a true second
    connection mid-stream; defer until asked. A `pg_logical_emit_message` heartbeat:
    unnecessary while `idleAck` exists.

### D. Setup helpers (separate subpath, explicitly invoked, never stream options)

19. **`ensurePublication(conn, { name, tables, publishViaPartitionRoot })`.** Create if
    absent, refuse-to-start check otherwise, publication-before-slot ordering owned by the
    helper (a slot created before its publication silently sees nothing; Sequin documents
    this as a rule and surfaces it as a health check). No membership sync: `ALTER
    PUBLICATION ... DROP TABLE` against a shared object lets the second process to boot
    silently unsubscribe the first's tables. Pulse keeps its own diffing because it owns
    its publication by name and needs the un-pulse path. What generalizes from pulse
    instead is the error shaping: every DDL failure names the grant it most likely needs
    (the `execAssumingGrant` pattern). For a helper whose every statement has a distinct
    privilege requirement (CREATE on the database, publication ownership, table
    ownership), that error shaping is most of the product.

20. **Replica identity: emit SQL, never execute.** `ALTER TABLE ... REPLICA IDENTITY FULL`
    takes an ACCESS EXCLUSIVE lock, on boot, on tables the driver does not own, and its WAL
    cost is permanent and shared with every other consumer of that database. That is
    migration territory (drizzle-kit is right there). The helper generates the statements
    and the ordering rule (identity change and publication ADD in one transaction, so no
    change is ever published under the old identity); running them is the operator's
    decision. Pulse keeps forcing FULL itself, which is fine: pulse owns its deployment,
    a generic driver does not.

### E. Non-goals for minipg, stated so nobody builds them

Durable offset/dedupe storage (needs the consumer's storage; the commit LSN on every batch
is the entire interface). Exactly-once across restarts (same reason). Initial-snapshot
orchestration beyond the backfill window (chunked/resumable/concurrent snapshots are the
sync-engine tier: Debezium's incremental snapshots, Electric's shape logs; the exported
snapshot name plus the enforced window is the seam that keeps that tier buildable on top).
Origin filtering beyond a one-line `origin 'none'` option (PG 16+). Protocol v2/v3
(streaming in-progress transactions, two-phase); deferred consciously, which is a second
reason batching stays a helper. Pooling (a walsender cannot be pooled).

---

## Part 2 — what this does to drizzle-pulse

### Deleted from pulse-runtime.ts (pull:false path)

- The connection loop and retry tail: per-connect `replication()` wiring, `abortableSleep`,
  `backoffDelay`, retry budget and its progress reset, `startupSettled` choreography,
  CopyDone handling, `hasConnectedBefore`. Replaced by `retry` + `backfill.reconnect`.
- Temp-slot creation with the random suffix, and every `createSlot`/`start` option choice
  (`statusIntervalMs`, `idleAck`, `messages`, `from`).
- The whole transaction assembly in `stream()`: begin/commit buffering, the orphan-row
  guard, per-connection buffer scoping. Replaced by `onTransaction` batches.
- The ack cadence (both call sites), since ack follows the callback's resolution.
- The TOAST old-under-new spread, replaced by `hydrateToast: true`.
- Terminal give-up mechanics (the listener fan-out shrinks to a thin `onTerminal`).
- Most of the teardown ordering: "no in-flight decode, persist, or backfill outlives the
  consumer" becomes the layer's stated guarantee (`stream.return()` resolves after the
  current callback settles), which is what `await run.done` hand-builds today.
- For pull:true additionally: `recoverSlot`'s eviction poll and drop-with-retry move behind
  `onSlotBusy: 'evict'` and typed slot outcomes; the resume decision table shrinks to the
  `onResume` seam evaluating the one consumer-only condition (durable watermark vs
  confirmed_flush).

Roughly 400 of the runtime's ~1300 lines, and they are precisely the lines that took the
most protocol knowledge to get right, plus the resilience test surface that pins them.

### Stays in pulse, by design

What "rebaseline a collection" means (the drizzle transaction, the listener round, its
shared-transaction failure mode). The mid-run watermark handshake
(`pg_current_wal_lsn()` before the baseline SELECT, buffer + drain-at-or-above,
`watermarkFloor`, the generation token, `$pk` dedup): all of it is consumer-side state
management the driver cannot see, and `watermarkFloor` in particular guards a per-collection
axis (baseline position vs stream position) no stream-level mechanism replaces. The tap
fan-out with the double-sided auth WHERE and pk-only redaction. The drizzle-table-to-shape
bridge. The key-only loud skip (now a policy check on the driver's `oldKind` plus the
`onWarning` signal; the information genuinely isn't in the WAL, so the driver's job ends at
saying so loudly). The pk-change split (shrinks to one flag check once `TableShape.key`
exists). REPLICA IDENTITY FULL forcing as pulse's own DDL. Events tables, epoch rotation,
the durable commit-LSN dedupe, and the cursor protocol (pull:true only; pull:false needs no
durable dedupe at all, a fresh temp slot can't replay).

### Distance to the naive sketch

The naive flow was:

```ts
const repl = await replication(url)
const slot = await repl.createSlot('pulse', { temporary: true, snapshot: 'export' })
// baseline collections from latest DB state   <- how does it use slot.snapshot?
for await (const e of repl.start(...)) apply(e)
```

With the managed layer, pulse's pull:false becomes:

```ts
const stream = replicate({
  url,
  slot: 'temporary',
  publications: [publicationName],
  shapes,
  backfill: ({ snapshot, consistentPoint }) =>
    rebaselineCollections(snapshot, consistentPoint),
  onTransaction: async (tx) => persistAndEmit(tx),
  onWarning: log, onTerminal: fanOutTerminal,
})
```

That is the naive sketch with names on the two facts it couldn't see. First: the baseline
read has to happen inside the exported snapshot's validity window, pinned on your own
client, before the driver starts streaming; the `backfill` callback IS that window, which
also answers the `slot.snapshot` question (pin it via
`transaction({ isolationLevel: 'repeatable read', snapshot })`, read baselines, return; the
stream then starts exactly where those reads ended, gapless by construction). Second:
connections drop, and with a temporary slot every drop is a new world, so the same callback
re-fires on reconnect. Everything else the naive version was missing (TOAST holes, key-only
old rows, transaction boundaries, ack targets, backoff, CopyDone, stalls) stops being
pulse's code and becomes either driver behavior or a driver signal. The line count of the
naive sketch survives; the knowledge moves into the driver where every consumer,
drizzle-pulse included, gets it once.

### Found along the way (pulse issues independent of any migration)

- `rotateAndSeedEvents` holds the same pre-`start()` slot window as `rebaselineCollections`
  and sets no `statement_timeout`; same WAL-retention exposure, no guard.
- A black-holed connection stalls the loop for up to ~15 minutes (TCP retransmission
  budget), or indefinitely behind an ACKing proxy; nothing in pulse or the driver bounds
  receive silence today.
- On CopyDone, `finally { rep?.end() }` destroys a connection minipg documents as usable
  for a follow-up `start()`; with a temp slot that costs a full slot+snapshot+rebaseline
  cycle that a same-connection re-`start()` would avoid.
- `shared/event-normalization.ts` still references the deleted `server/wal-shape-bridge.ts`
  in a comment.
