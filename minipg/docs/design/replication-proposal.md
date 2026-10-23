# minipg replication: proposed changes

> Extracted 2026-08-13. Supersedes `replication-boundary.md`. Items 1.2 and 1.9 were deferred
> and tier D was dropped. Line references target `main @ 30978a9` and have drifted, so
> verify them again before acting on any of them.

Proposal · minipg replication

# Moving replication knowledge into the driver

Changes proposed from building drizzle-pulse on minipg's replication API. The goal:
a consumer wiring up change data capture (CDC) with prisma, kysely, or drizzle should
get correct behavior without carrying Postgres replication folklore. Every claim below
is checked against the shipped code, and the hard ones against Postgres source.

Baseline: **`main` @ `30978a9`**
Line refs: files under **`src/`**, at the baseline commit
Implementation: **by the proposer**, pending confirmation

## Summary

Three tiers, ordered by how soon they should land. Tiers 1 and 2 are small and self-contained. Tier 3 is the one architectural addition. Collapsed **Background** notes throughout explain the Postgres mechanics an item leans on; skip them where you know the territory.

Tier | What | Items | Shape | 

1 | Raw-layer fixes (hardening + one behavior change) | 9 | small patches | 

2 | Event-semantics helpers (TOAST, batching, diagnostics, keys) | 4 | opt-in API | 

3 | Managed CDC session (reconnect, slot modes, backfill, ack) | 1 module | new subpath | 

## Verified facts the design leans on

These four came out of adversarial review of an earlier draft and killed several plausible-sounding features. Worth having on the table before reading the tiers.

**Background: the four primitives these facts are about**

- **Replica identity** is a per-table setting that controls what the "old row" of a replicated update or delete contains. DEFAULT sends just the primary key, and only when it changed; FULL sends the entire previous row.

- **TOAST** is where Postgres keeps large values (long text, big jsonb) out of line. Replication avoids re-sending a large value that didn't change: the column is simply absent from the new row image, with a marker instead of the data.

- **The walsender** is the special connection replication runs over. It speaks its own command grammar (CREATE_REPLICATION_SLOT, START_REPLICATION) rather than the normal query protocol; `replication()` opens one. **CopyDone** is the message a server sends to end the streaming phase, during a shutdown or failover for example.

- **Snapshot export**: creating a slot can also export a snapshot, a name that another, normal connection can adopt to see the database exactly as it was at the slot's starting point.

**Background: minipg names used throughout**

**Public surface.** `replication(config)` opens the walsender connection
and returns a `ReplicationConnection`. On it: `command(sql)`
runs one command (walsender grammar or plain SQL) and returns its rows;
`identify()` reports the server's identity (system id, timeline, current
position); `createSlot()` and `dropSlot()` manage the slot;
`start(opts)` begins streaming and returns an async iterator of events;
`ack(lsn)` confirms processed positions; `end()` closes the
connection. The `binaryTuples` getter reports whether the active stream
negotiated the binary format.

**Types.** `StartOptions` is the options bag for `start()`:
slot name, publication list, `shapes`, and tuning such as
`statusIntervalMs` (how often the client reports its positions to the
server), `idleAck`, `binary`, `signal`.
`TableShape` declares how one table's columns decode and under which JS
keys; its `columns` field maps a JS key to its SQL column when the two
differ. `ReplicationEvent` is the union the stream yields: begin, commit,
insert, update, delete, truncate, message, relation; row events carry
`new`, `old`, `oldKind`, `unchanged`.
`ReplicationRelation` is the table description delivered by a relation
announcement, including `replicaIdentity` and per-column `key`
flags. `ReplicationStreamEnded` is the error thrown when the server ends
the stream (CopyDone).

**Positions.** An LSN is a position in the WAL, a 64-bit number written like
`0/1A2B3C4`. A commit event carries two: `lsn`, the commit
record's own position, and `endLsn`, the first position after it, which is
the one to acknowledge.

**Internals the evidence cites.** `onData` parses incoming socket bytes
into protocol messages and pushes them onto an internal queue (`q`);
`next()` hands them out one at a time. The protocol has no separate
channels per operation, so `command()` replies and stream data travel
through this same queue, and whoever calls `next()` gets the next message
(the point of item 1.4). `relEntry()` builds a table's
decode plan (per-column decoders and output key names) when a relation announcement
arrives; `tuple()` decodes one row image using that plan.
`replBinaryFor` and `replBinaryForCol` (in
`decode.ts`) answer whether a type or a declared column has a binary
decoder, and the pre-start "probe" is one catalog query using them to resolve
`binary: 'auto'`. `sendStatus()` writes the periodic status
message that reports received and acknowledged positions to the server.

**Under REPLICA IDENTITY FULL, every column is flagged `key: true`.**
The protocol sets the identity flag on all attributes in FULL mode, so
`ReplicationRelation.columns[].key` cannot identify the real key there.
The stream alone cannot answer "did the key change", in exactly the mode most CDC
setups run.

Source: postgres source: `proto.c` (writes the logical replication wire messages), `logicalrep_write_attrs`, replidentfull branch

**Old tuples never carry the `'u'` (unchanged TOAST) marker.**
Postgres inlines TOAST values before writing an old row into WAL, on both the FULL and
key paths. A FULL old row is therefore always complete: filling an update's missing
TOAST values from it is exact, and old rows need no `unchanged` list of
their own.

Source: postgres source: `heapam.c` (table row storage), `ExtractReplicaIdentity` calling `toast_flatten_tuple`

**The logical walsender accepts plain SQL through `command()`.**
Slot health checks, slot drops with retries, eviction polling, and startup checks can
all run on the replication connection itself, as long as they happen before
`createSlot` (the exported snapshot dies on the connection's next command)
and before `start()`. The managed layer needs zero extra connections.

Source: `replication.ts:254-276`, doc comment on `command()`

**CopyDone ends the copy, never the session.**
After `ReplicationStreamEnded` the connection is documented as usable for a
follow-up `start()`, and a temporary slot survives it. A CopyDone recovery
needs no new slot, no snapshot, no backfill. Only socket death does.

Source: `replication.ts:362-368`, `ReplicationStreamEnded` doc comment at `replication.ts:121-128`

## Tier 1 — Raw-layer fixes

No API surface added except one `StartOptions` field and one config field. Ordered by value per byte.

### 1.1 Validate slot names

`[~2 lines]` `[hardening]` 

Slot names are pasted into three walsender commands as raw text, while publication
names are escaped at their sites. Postgres restricts slot names to
`[a-z0-9_]`, so the fix is a regex and a throw, and rejecting early beats
escaping. The risk is real because slot names are often built from tenant or user
input in multi-tenant consumers.

**Evidence**

Raw interpolation: `createSlot` at `replication.ts:289`, `dropSlot` at `replication.ts:295`, and `START_REPLICATION SLOT ${opts.slot}` at `replication.ts:349`. Publication escaping for contrast: `replication.ts:319`.

### 1.2 Make `binary: 'auto'` value-neutral

`[small]` `[behavior change]` 

**Background: the binary wire format**

Row values in the replication stream arrive as text by default, the same strings
psql would show. PG 14 added a binary option: values arrive in their internal
encoding instead. Binary decodes faster and can express more, real JS arrays
instead of literal strings like `'{ml,beta}'`, and a float exactly as
stored. For a few types, though, the binary and text decodings produce different
JavaScript values, and that difference is what this item is about.

`binary: 'auto'` (the default) decides per stream whether to use the binary
format. The current rule: use it whenever the driver has a binary decoder for every
published column. The trouble is that for two types, float4 and arrays, "the driver
can decode it" and "it decodes to the same JS value as text" are different statements.
A concrete example, with no shape declared for the table:

```
create table metrics (id int primary key, score real, tags text[]);
update metrics set score = 0.1, tags = '{ml,beta}' where id = 1;
```

The same consumer code receives, for that one update event:

Server | `e.new.score` | `e.new.tags` | 

PG 13 (no binary support, stream is text) | `0.1` | `'{ml,beta}'` (a string) | 

PG 16 (auto turns binary on) | `0.10000000149011612` | `['ml', 'beta']` | 

The float differs because 0.1 has no exact float4 representation: text mode sends the
rounded display form, binary sends the stored bits. The array differs because text mode
passes the Postgres literal through as one string and binary parses it. Nothing in the
consumer's code chose either row of that table. Upgrade the database from 13 to 16 and
both values change with zero code changes. Add one column of a type the driver can't
binary-decode and the whole stream flips back to the text row on the next connect,
changing the values again. The only way to even detect which mode a stream got is the
`binaryTuples` getter.

The change: `'auto'` turns binary on only when every column decodes to the
identical JS value in both modes. A float4 or array column then keeps the stream on
text, and a consumer who wants exact floats and real arrays writes
`binary: true` and owns that choice. Columns covered by a shape are
unaffected either way, because the declared type pins the JS value.

**Evidence**

Probe: `replication.ts:332-346` (`replBinaryFor(...) !== null` + shaped-target check, "capability gate, nothing more"). Option doc stating the value divergence: `replication.ts:103-113`. The value-neutral variant is a small predicate over the same probe: false for float4 (oid 700) and element-typed oids, `replBinaryFor` otherwise.

### 1.3 Receive timeout

`[~6 lines]` `[new option]` 

**Background: how a connection dies without closing**

A firewall starts silently dropping packets, a NAT entry expires, a VM gets paused:
the socket still looks open, so the driver sits inside `next()` waiting
for data that will never arrive. The OS notices eventually, because its TCP
retransmissions of the driver's own outgoing status messages keep going unanswered,
but with default Linux settings that takes about 15 minutes. Behind some proxies it
never notices at all: the proxy keeps accepting the driver's packets even though the
server behind it is gone, so no error ever fires and the wait is indefinite.

Today the driver has no time limit on receiving, so a dead-but-open connection stalls
the stream for roughly 15 minutes in the common case and forever in the worst one. A
consumer can't fix this from outside the driver, because a reconnect loop only reacts
to thrown errors, and here nothing throws.

The fix: add `receiveTimeoutMs` to `StartOptions`. If no message
of any kind arrives for that many milliseconds, fail the stream, and the consumer's
normal reconnect logic takes over. The limit has to be measured against how often the
server speaks: even a fully idle server sends a heartbeat every
`wal_sender_timeout / 2` (15 seconds by default), so a limit around 60
seconds is safe, while deriving it from `statusIntervalMs` (how often the
**client** sends status) would kill every healthy idle stream. Roughly six lines,
checked from the existing status timer. Companion change: expose
`socket.setKeepAlive` through `ReplicationConfig`.

```
const events = repl.start({
slot, publications: ['app_pub'],
receiveTimeoutMs: 60_000, // 60 s of silence -> the iterator throws
})
try {
for await (const e of events) handle(e)
} catch (err) {
// a dead-but-open connection now lands here like any network error -> reconnect
}
```

**Evidence**

Wake paths in `next()` at `replication.ts:239-244`: queued message, stored socket error, or `ended`. Nothing times out silence; `connectTimeout` covers only the handshake (`replication.ts:191`). `lastReceived` bumps at `replication.ts:375` and `replication.ts:383` are the natural hook; the status timer at `replication.ts:358` is the natural checker.

### 1.4 Guard `command()` during streaming

`[~2 lines]` `[hardening]` 

**Background: one socket, one ordered message stream**

The Postgres protocol runs everything over a single socket. Command replies, the
replication stream's data, and keepalives all arrive as protocol messages, in
order, and nothing marks which operation a message belongs to. minipg parses them
into one queue; `next()` hands them out one at a time to whoever asks.
So "`command()` returns its rows" means: it writes the command,
then keeps popping messages from that shared queue until it has collected its full
reply (rows, then a done marker). The streaming loop inside `start()`
pops from the same queue, expecting WAL data.

Call `command()` while a stream is active and two readers interleave on
one queue. `command()`'s collect loop pops whatever arrives next, and
stream data messages are not part of a command reply, so it discards them: events
vanish with no error. Today the only protection is a doc comment ("one purpose per
connection"); a `streaming` flag and a throw turn the rule into an error
you can hit in a test. Prerequisite for Tier 3, which adds a layer that issues
commands and must be unable to do so at the wrong time.

**Evidence**

Both drain `this.q` via `next()`: `command()` loop at `replication.ts:256-276`, stream loop at `replication.ts:359-388`.

### 1.5 Backpressure on the message queue

`[~10 lines]` `[new option]` 

`onData` pushes every parsed message into an unbounded array regardless of
how fast the consumer drains it, so a consumer that stalls lets the queue grow until
the process runs out of memory. Add `maxQueueBytes`: pause the socket when
the queue crosses the limit, resume once it drains to half, the same pattern the
normal query stream already implements. The status timer keeps running while paused,
so the server will not time the client out. The failure today is memory only, never
data loss (nothing gets acknowledged while stalled, so the server retains everything),
which is why this is a hardening item and no higher.

```
repl.start({
slot, publications: ['app_pub'],
maxQueueBytes: 64 * 1024 * 1024, // buffer at most ~64 MiB, then pause the socket
})
```

**Evidence**

Unbounded push in `onData` at `replication.ts:223-226`. Existing hysteresis to reuse: `connection.ts:1428-1444` (`highWaterMark`, pause above HWM, resume at half).

### 1.6 Empty-publication probe becomes a signal

`[1 branch]` 

The binary auto-probe already queries `pg_publication_tables` and requires a
non-empty result. A missing or empty publication currently produces a silent downgrade
to text followed by a silent empty stream, which is the most common "why no events"
support question in every comparable library. Turning zero rows into a warning or error
costs one branch and no new queries. This is also the entire preflight worth having:
`wal_level` and role problems already fail loudly at
`CREATE_REPLICATION_SLOT` and connect.

**Evidence**

Probe and the `rows.length > 0` requirement at `replication.ts:332-346`.

### 1.7 Catch undecodable mid-stream DDL at announce time

`[small]` 

**Background: relation announcements**

The stream never sends a bare row. Before a table's first row, the server sends a
relation message describing that table's columns and types, and it sends a fresh one
after any DDL that changes the table. The driver builds its per-column decoders from
these announcements, in `relEntry()`.

Under binary mode, a column added after `start()` whose type has no binary
decoder currently throws hours later, on that column's first value, deep in tuple
decoding. `relEntry()` already runs on every re-announcement and already
resolves decoders. Checking "binary stream, and this column has no binary decoder"
right there turns a mid-flight crash into an immediate error naming the column.

**Evidence**

Documented caveat on the `binary` option at `replication.ts:111-113`; the late throw at `replication.ts:423`; `relEntry()` decoder resolution at `replication.ts:483`.

### 1.8 Throw on tuples for unannounced relations

`[1 line]` 

A row for a table that was never announced currently decodes against a placeholder
relation, producing columns named `"0"`, `"1"` holding raw
bytes: corrupted data with no error. The protocol makes this near-impossible (an
announcement always precedes a table's first row, see 1.7), so a one-line throw
covers it. The existing throw on unknown message tags stays as it is: the
driver pins protocol version 1, whose message set is fixed, so an unknown tag means
the server is speaking a newer protocol, and skipping such a message silently could
let uncommitted rows through.

**Evidence**

Placeholder at `replication.ts:434`; unknown-tag throw at `replication.ts:475`.

### 1.9 README

`[docs]` 

The package README is still a `bun init` stub. The d.ts comments are
excellent; there is no consumer-facing story. A real share of "users need perfect WAL
knowledge" is this file. It needs: the slot lifecycle and the durable-vs-temporary
trade, which position to acknowledge (`endLsn`, and why), what
`oldKind` means and what controls it, the exported snapshot's lifetime
(`start()` ends it, because START_REPLICATION is
itself a walsender command), and the REPLICA IDENTITY FULL trap that
`columns[].key` reads all-true.

## Tier 2 — Event-semantics helpers

Small and consumer-agnostic. For each of these, three comparable libraries picked three different answers, which is how you recognize a policy question: the driver ships the mechanism with a safe default, and every one of them can be switched.

### 2.1 TOAST hydration, on by default

`[small]` `[new option]` `[behavior change]` 

**Background: the missing-column surprise**

When an update doesn't touch a TOASTed (large, out-of-line) value, the replication
message doesn't repeat it. The new row image simply has no such key, and the
column's name appears in the event's `unchanged` list instead. Example: a
posts table with a 2 MB `body`; after
`update posts set status = 'published'`, the event's `e.new`
has a `status` key and no `body` key at all. With REPLICA
IDENTITY FULL the complete old row rides along in `e.old`, so the missing
value is sitting right there.

The driver holds both rows, keyed identically, and as the facts section verified
(Postgres inlines TOAST values before writing an old row into WAL), a FULL old row is
always complete, so filling the gaps is an exact operation:
`{ ...old, ...new }`. Ship it as `hydrateToast` on
`StartOptions`, default **true**: a consumer who has never heard of
TOAST then always reads `e.new` as "the row after the update", which is
what everyone assumes it means anyway. The consumers who specifically want the sparse,
WAL-faithful shape (a search indexer that reindexes only changed fields, a warehouse
loader recording which columns the update touched) switch it off, and they are exactly the
users who know why.

Two details support the default. The `unchanged` list stays populated
either way, so "what did the WAL carry" remains answerable with hydration on.
And when the old row is not full (replica identity DEFAULT), there is nothing to fill
from, hydration is a no-op, and the gap remains; that is exactly the case
2.3's warning names, so the two items cover the territory
together. For contrast: postgres.js collapses the marker into `undefined`
with no signal; pg-logical-replication does the same when no old tuple is available,
and under identity FULL silently repairs from it, so repair-by-default has precedent;
Debezium substitutes a placeholder string; Electric makes partial updates the normal
shape.

```
// posts: id int primary key, status text, body text (2 MB, TOASTed)
// update posts set status = 'published' where id = 7;
const events = repl.start({ slot, publications: ['app_pub'] })
for await (const e of events) {
if (e.kind !== 'update') continue
e.new // { id: 7, status: 'published', body: '...2 MB...' }
e.unchanged // ['body'], so you can still tell what the WAL carried
}
// hydrateToast: false restores the sparse shape:
// e.new is { id: 7, status: 'published' } with no body key at all
```

**Evidence**

`'u'` handling (absent + `unchanged.push`) at `replication.ts:410-418`; both tuples keyed via the same `rel.names[]` (`relEntry()` at `replication.ts:483`), so shape keys and `TableShape.columns` mapping apply to old and new identically; binary mode is orthogonal (the `'u'` check precedes the binary branch).

### 2.2 `batchTransactions()`: a helper, deliberately not a mode

`[~15 lines]` `[new export]` 

**Background: flat events and the mid-transaction trap**

The stream delivers events one at a time: begin, then each row change, then commit.
A consumer that wants to apply a transaction atomically has to collect the rows
between begin and commit itself. The commit event also carries the only position
that is safe to acknowledge; acknowledging a position from inside a transaction is a
known data-loss trap (wal2json's tracker documents it: restart in the middle and the
rest of that transaction is skipped). One more constraint: a transaction can be
huge. A 50M-row update is a single begin/commit pair.

An exported generator assembling
`{ xid, commitLsn, endLsn, commitTime, events[] }` from the flat stream,
with `maxEvents` as the memory ceiling. Commit boundaries are the one thing
a consumer cannot rebuild once a driver drops them; postgres.js proves it, its commit
handler is a no-op, so nobody downstream can ever apply changes atomically. A helper
rather than a `start()` mode, for two packaging reasons: the flat event
stream stays the driver's one primitive, so consumers that don't batch pay nothing
and consumers with different grouping needs compose their own; and the transaction
envelope stays out of the core API, which leaves room for protocol v2 (there, large
transactions arrive in chunks before they commit) without breaking the event union.

The contract of the helper itself:

- A huge transaction should be the consumer's informed memory decision, via `maxEvents`. When a transaction exceeds it, the helper yields it in chunks instead of throwing: a throw would be a poison pill, since the reconnect replays the same oversized transaction and dies again, forever. Intermediate chunks carry events and `done: false` and no commit fields; only the final chunk carries `done: true` with `commitLsn`/`endLsn`, so there is nothing to acknowledge mid-transaction even by accident. The cost: that one transaction is no longer applied atomically (the same trade protocol v2 streaming makes), so an oversized transaction needs an idempotent consumer: one for which re-applying the same events is harmless. Without `maxEvents`, and for every transaction under the ceiling, batches always arrive whole with `done: true`.

- Empty transactions (DDL produces bare begin/commit pairs) are yielded like any other batch: `events: []`, `done: true`, commit fields present. Ack them like any other batch, so the slot keeps releasing WAL through a DDL burst; the example below does that as written.

- `truncate` and `relation` events are delivered inside the batch, since dropping truncate is a consumer decision.

One loose end sits in the open decisions: a non-transactional
`pg_logical_emit_message` arrives outside any begin/commit, so batching has
no bucket for it. The recommended resolution is that the helper drops them and its
docs say so; a consumer that needs them reads the flat stream. If that resolution is
confirmed, implementing it means one if-statement in the helper that discards these
events, plus one sentence in its documentation saying they are discarded.

```
const stream = repl.start({ slot, publications: ['app_pub'] })
for await (const tx of batchTransactions(stream, { maxEvents: 10_000 })) {
await db.transaction(async (dbTx) => {
for (const e of tx.events) await apply(dbTx, e) // whole tx, atomically
})
if (tx.done) repl.ack(tx.endLsn) // the safe ack target; absent on a chunk of an oversized tx
}
```

### 2.3 Replica-identity diagnostics, event-triggered

`[small]` `[new option]` 

**Background: why one setting causes four different bugs**

Replica identity (see the facts section) decides what the old row of an update or
delete contains. Under DEFAULT, four separate consumer symptoms follow from the
missing old row: updates arrive with no previous values, an unchanged TOAST column
has nothing to fall back on, a key change can't be detected, and a delete carries
only the key. Each looks like its own mystery until you know they share the one
cause. Partitioned tables add a fifth surprise: unless
`publish_via_partition_root` is set on the publication, events arrive
under partition names like `orders_2026_07` instead of the parent
table's name, and any consumer that routes by table name drops them.

An optional `onWarning` callback that reports two misconfigurations:

- An update or delete arrives for a table without a full old row
(`oldKind !== 'full'`). The warning names the table, its replica identity,
and what events from it will be missing: previous values, the TOAST gap fills of
2.1, the key-change detection of 2.4,
delete payloads beyond the key. Fired once per table, and only when such an event
arrives, so a table that never updates or deletes never warns.

- Events for a published table arrive under a partition's name because
`publish_via_partition_root` is off. A consumer that routes by the parent
table's name is silently receiving nothing.

The value: both misconfigurations otherwise show up far from their cause, as
unrelated-looking consumer bugs that only appear on production data patterns. The
warning states the cause at the first occurrence, with the table name and the fix in
hand.

```
repl.start({
slot, publications: ['app_pub'],
onWarning: (w) => log.warn(w.message),
// e.g. "public.orders: replica identity is DEFAULT; updates and deletes
// will carry key-only old rows (oldKind: 'key' or null)"
})
```

**Evidence**

`relation.replicaIdentity` is already decoded from the `R` message (`replication.ts:438-446`), which always precedes the relation's first tuple, so the warning needs no probe and is never too late.

### 2.4 Key-change signal

`[small]` `[new shape field]` 

**Background: the ghost-row problem**

When an update changes a row's primary key, any consumer that keeps state keyed by
that key (a Map, a cache, an index) has to treat the event as delete-old plus
insert-new. Apply it as a plain upsert under the new key and the entry under the old
key survives forever: a ghost row. Detecting the case requires knowing which columns
form the key, and under REPLICA IDENTITY FULL the wire doesn't say (the fact
above: every column arrives flagged as key).

Under identity DEFAULT/INDEX the signal already exists and is exact:
`oldKind === 'key'` appears only when the identity key changed. That
deserves one sentence in the d.ts. Under FULL the driver needs the consumer to declare
the key: an optional `TableShape.key?: string[]`, compared with a
comparator that handles composite keys and `Date`/`Buffer`
values (`===` sees two equal Dates decoded from two tuples as different).
When declared, updates carry `keyChanged: boolean`. Without a declared key
the field is absent from the event entirely, rather than present with a guess: under
FULL the wire cannot answer, and a hardcoded `false` would be wrong exactly
on the key-changing update it exists to catch. The split into
delete+insert stays with the consumer: when the flag is set, remove the entry under
the old key and write the new one, as in the example below, in whatever order the
store needs.

```
shapes: [{
table: 'orders',
shape: { id: 'int4:number', customerId: 'int8:number', total: 'numeric:string' },
columns: { customerId: 'customer_id' },
key: ['id'], // declare the addressing key
}]

// in the stream:
if (e.kind === 'update' && e.keyChanged) {
removeByKey(keyOf(e.old)) // the two-line split, where the sink wants it
upsert(e.new)
} else if (e.kind === 'update') {
upsert(e.new)
}
```

## Tier 3 — Managed CDC session

A subpath export, `minipg/cdc`. The raw API stays untouched underneath. This is the layer where reconnects, slots, and the snapshot window stop being the consumer's homework.

### 3.0 Shape

`[new module]` 

```
const shutdown = new AbortController()

const r = replicate({
url,
slot: 'temporary', // or { name: 'my_slot' } for a durable slot
publications: ['app_pub'],
shapes,
signal: shutdown.signal, // aborting has the same effect as stop()
backfillTimeoutMs: 5 * 60_000, // a stuck backfill fails the attempt -> retry
maxTransactionEvents: 10_000, // oversized txs arrive chunked (contract from 2.2)

backfill: async ({ snapshot, streamStartLsn, isReconnect, signal }) => {
if (isReconnect) state.clear()
await db.transaction(async (tx) => { // your transaction adopts the exported snapshot
const rows = await tx.select().from(orders)
signal.throwIfAborted() // aborted at backfillTimeoutMs
state.load(rows, streamStartLsn)
}, { isolationLevel: 'repeatable read', snapshot })
},

onTransaction: async (tx) => {
for (const e of tx.events) state.apply(e) // ack follows resolution
},

retryDelayMs: (attempt, err) => (attempt log.warn(w.message),
onFatalError: (err) => { log.error('replication is dead', err); page(err) },
})

// graceful shutdown, e.g. from a SIGTERM handler:
await r.stop()
```

One stream as the consumer sees it, however many connections come and go underneath.
All slot administration runs over `command()` on the replication connection
itself (per the walsender fact), before
`createSlot` and `start()`, so the layer opens no
second connection. The pieces that are new here:

- `streamStartLsn` is the position (LSN) the stream will start from (the raw `createSlot()` returns the same value under Postgres's own name, `consistentPoint`).
The exported snapshot sees everything up to it; events deliver everything after it,
with no gap and no overlap between the two. The consumer stamps its loaded state with
it, as the position that state is consistent as of.

- `isReconnect` is false on the first connect and true when a dropped
connection forced a new session. With a temporary slot a new session means a new slot
and a fresh snapshot, so state loaded earlier no longer matches the stream and the
callback rebuilds it. One callback covers the first load and every rebuild; the flag
says which one is happening.

- `retryDelayMs` returns the delay before the next connection attempt in
milliseconds, or null to stop trying. When omitted, the default is jittered
exponential backoff.

- `onFatalError` reports the unrecoverable end of the stream, once the layer has stopped trying: `retryDelayMs`
returned null, or the failure is permanent (bad credentials, missing publication).
After it, no more events arrive and no reconnect happens. What that means is the
consumer's call: page someone, mark served state as stale, exit the process.

- `stop()` is the one control on the returned handle. It stops
delivering, waits for the in-flight `backfill` or
`onTransaction` to settle, acknowledges what completed, closes the session
(a temporary slot dies with it), and resolves. Idempotent, and clean: a
consumer-initiated stop never fires `onFatalError`. An
`AbortSignal` can be passed in the options for the same effect, mirroring
the raw layer's `signal`.

### 3.1 Reconnect

The loop itself is the same for every consumer: reconnect, wait with backoff (a wait
that `stop()` can interrupt), eventually give up and surface a final error.
The numbers are where consumers differ, so they live in the `retryDelayMs`
callback, jittered exponential by default, return null to stop. Two rules learned the
hard way come along. Any retry budget must reset on progress, otherwise a server that
keeps accepting connections and dropping them mid-failover reconnects forever on a
permanently refreshed budget. And progress means **acked**, never merely delivered.
CopyDone gets the cheap path: re-`start()` on the same live session (per
the fact above), which for a temporary slot means no new slot, no snapshot, and no
backfill; only a dead socket takes the full path. One teardown guarantee goes in the
contract: `stop()` resolves only after the in-flight backfill or
transaction handler has settled, so nothing keeps using the consumer's own connection
pools after they close.

### 3.2 Slot modes, explicit

**Background: slots and the ways they fail**

A replication slot is the server-side bookmark for one consumer: the server retains
every WAL segment the slot hasn't confirmed yet. That cuts both ways. A durable slot
whose consumer died keeps retaining WAL until the disk fills; that is why
`max_slot_wal_keep_size` exists, and when retention crosses it the server
discards the WAL and marks the slot `wal_status = 'lost'`, meaning it can
never resume without a gap. A slot also records which server process is currently
attached to it (`active_pid`), and after a crash a stale attachment can
linger for a while and block reconnects. A temporary slot avoids all of this by
dying with its connection, at the price of losing whatever was written during an
outage.

`'temporary'`: a random-suffixed temp slot per session with snapshot
export, documented as lossy across outages: changes made while disconnected
are gone. `{ name }`: durable, created if absent, health-checked on every
connect. The checks are the same for everyone and live in the layer: slot row absent,
`wal_status = 'lost'`, null `confirmed_flush_lsn`, and a
systemId/timeline change since the last connect (from `identify()`,
currently decoded and unused; a promoted standby invalidates all prior assumptions).
What to do about each finding differs per consumer, so the decisions go back as
explicit outcomes:

- `SlotInvalidatedError` rather than silently recreating the slot. Recreating skips everything between the old confirmed position and the new starting point; a consumer that can rebuild its state from a snapshot absorbs that, an audit log gets a permanent hole. The consumer decides.

- `onSlotBusy: 'error' | 'evict'`, default `'error'`. Eviction means killing the attached process via `pg_terminate_backend`, and the driver cannot tell a stale zombie from a colleague's healthy walsender on the same slot name. It also needs the `pg_signal_backend` privilege, and a cross-role attempt must fail permanently rather than retry. Consumers that own their slot name and their deployment opt in; the retry details ship with it (error `42704` on drop means the slot is already gone; `55006` means it still looks busy for a moment after its process died, so retry briefly).

- An `onResume({ confirmedFlush, restartLsn })` hook, because one health condition only the consumer can evaluate: whether the server's confirmed position has moved past what the consumer itself durably persisted.

### 3.3 The backfill window

**Background: what an exported snapshot buys, and what it costs**

Creating a slot with `snapshot: 'export'` returns a snapshot name. Any
other connection can adopt it (begin a repeatable-read transaction, then
`SET TRANSACTION SNAPSHOT '<name>'`) and see the database exactly
as it was at the slot's starting point. That is what makes a gapless initial load
possible: read your tables inside that transaction, then stream, and no change falls
between the two. Two constraints come with it. The name is valid only until the
replication connection issues its next command, and `start()` is a
command. And between slot creation and streaming nothing consumes WAL, so the server
retains everything written meanwhile; the longer the reads take, the more WAL piles
up.

Whenever a session creates a slot with an exported snapshot, the layer awaits
`backfill({ snapshot, streamStartLsn, isReconnect })` strictly between
`CREATE_REPLICATION_SLOT` and `START_REPLICATION`. The snapshot
is valid only until the connection's next command, and `start()` issues
one, so running the callback inside that window turns the validity rule into
structure: call order cannot violate it. The consumer adopts
the snapshot on its own client, which is the only workable contract: a raw minipg
connection is useless to drizzle, kysely, and prisma alike, so the layer hands over
names, never connections. An optional `backfillTimeoutMs` bounds the
window, since it holds the slot with nothing consuming WAL, so a hung baseline read
grows retained WAL for as long as it hangs. When set, the layer hands
`backfill` an `AbortSignal` that fires at the deadline (a
promise cannot be cancelled from outside, so the signal is the consumer's cancellation
path for its own queries), then abandons the session and routes the failure through
`retryDelayMs` as a named timeout error. Off when omitted: a legitimate first load
can run for an hour. The `isReconnect` flag lets first-connect seeding and
reconnect rebuilding share one callback.

### 3.4 Ack tied to handler completion

**Background: why the timing of an ack decides whether you lose data**

`ack()` tells the server that everything up to a position is durably
processed; the server releases the retained WAL and will never resend it. Ack
before your handler has persisted the data, and a crash in between loses
those events for good. Ack only after persisting, and a crash merely means the
server resends what wasn't confirmed: duplicates you can handle, instead of holes
you can't. pg-logical-replication's default acks on delivery, before the handler
runs, and its issue tracker shows what that costs.

The managed layer has exactly one consumption shape, the `onTransaction`
callback, because it is the one shape where "the handler finished" is knowable: the
layer acks when the callback resolves, and persist-then-ack falls out with no effort
from the consumer. An iterator shape was considered and dropped: auto-acking when the
consumer pulls the next transaction looks equivalent for a simple sequential loop, and
quietly turns into ack-before-persist the moment a consumer dispatches async or
batches (`void handle(tx)` compiles fine). A consumer that wants an
iterator uses the raw `start()`, with
`batchTransactions` and explicit `ack()`.

`replicate()` also takes the ceiling from 2.2, as
`maxTransactionEvents` (inside `batchTransactions` the shorter
`maxEvents` suffices, since the function name carries the context), with
the same chunk contract: an oversized transaction
spans several `onTransaction` calls, `done` marks the last one,
and the layer acks only after that final call resolves, so intermediate chunks cannot
be acknowledged even in principle. The raw driver's two-position model (the consumer's
acked position, plus the idle advance that only moves when nothing is unacked) is
already correct and stays underneath.

### 3.5 Considered and rejected for this layer

- **In-session replay dedupe.** Filtering replayed commits against what was delivered loses exactly the redelivery a reconnect exists to provide (delivered but not persisted); filtering against what was acked duplicates what the server already does. Dedupe-by-commit-LSN stays a four-line documented consumer recipe, because only the consumer knows what it durably processed.

- **Heartbeat emission.** Unnecessary while `idleAck` exists; the uncovered case (a stuck consumer while the slot keeps growing) is a monitoring concern.

- **Slot-lag monitoring while streaming.** Periodically querying `pg_replication_slots` to measure how far the slot's confirmed position trails the server's current WAL position, which is both the WAL the server is retaining for this consumer and how far behind live the consumer runs: the metric that pages you before a slow consumer fills the disk. Rejected because the streaming connection cannot run queries mid-copy (see 1.4), so this single feature would force the layer to manage a second connection, and the same measurement is one query in any monitoring system already watching the database. Deferred until someone asks.

## Non-goals, stated so nobody builds them

- **Durable offset or dedupe storage.** Needs the consumer's storage; the commit LSN on every batch is the entire interface.

- **Exactly-once across restarts.** Same reason. The contract stays at-least-once with dedupe-by-commit-LSN documented.

- **Initial-snapshot orchestration beyond the backfill window.** Chunked, resumable, concurrent snapshots belong to sync engines (Debezium's incremental snapshots, Electric's shape logs), a different product tier. The exported snapshot name plus the enforced window is the hook that lets such a tier be built on top.

- **Protocol v2/v3.** Streaming of in-progress transactions and two-phase commit are deferred deliberately, which is the second reason batching stays a helper and never becomes part of the core event shape.

- **Origin filtering** beyond a one-line `origin 'none'` start option (PG 16+), and **pooling** (a walsender cannot be pooled).

## Open decisions

The points where confirmation matters before implementation starts.

- 
`receiveTimeoutMs` default: off, or on at 60 s+? On-by-default protects
naive consumers; off-by-default is zero-risk for existing ones.
**Recommended:** off in the raw layer, on (60 s) in the managed layer.

- 
Non-transactional `pg_logical_emit_message` in
`batchTransactions()`: delivered out of band, meaning an optional
`onMessage: (m) => void` callback in the options, fired between batches
when such a message arrives, or documented as dropped, with consumers that need them
reading the flat `start()` stream?
**Recommended:** dropped and documented, until a consumer exists.

## Effort map

Item | Tier | Size | Notes | 

Slot-name validation | 1.1 | XS | throws on names that never worked server-side anyway | 

`binary:'auto'` value-neutral | 1.2 | S | value change for unshaped float4/array columns on PG 14+ | 

Receive timeout + keepalive config | 1.3 | S | opt-in field | 

`command()` guard, backpressure, relid throw, DDL announce check, probe signal | 1.4–1.8 | S each | hardening; no default changes | 

README | 1.9 | M | highest value per hour after 1.1 | 

TOAST hydration | 2.1 | S | on by default; `hydrateToast: false` restores the sparse shape | 

`batchTransactions()` | 2.2 | S | pure helper over the iterator | 

Identity diagnostics | 2.3 | S | optional callback | 

`TableShape.key` + `keyChanged` | 2.4 | M | needs the value comparator | 

Managed session | 3 | L | new module; raw layer untouched; needs 1.4 first | 

## Appendix: the target consumer experience

The measure of success. Today, correct pull-style CDC on minipg means hand-building a
reconnect loop, slot lifecycle, the snapshot window, transaction assembly, TOAST
handling, and ack discipline (drizzle-pulse's runtime carries roughly 400 lines of
exactly that, and they were the hardest lines in the codebase to get right). After
Tiers 1–3, a consumer on any ORM writes:

```
const r = replicate({
url,
slot: 'temporary',
publications: ['app_pub'],
shapes,
backfill: async ({ snapshot }) => {
// e.g. drizzle: db.transaction(fn, { isolationLevel: 'repeatable read', snapshot })
await reloadStateInside(snapshot)
},
onTransaction: async (tx) => applyAtomically(tx.events),
})
```

Which is the naive four-line sketch everyone writes first, made correct: the baseline
read runs while the exported snapshot is still valid, before streaming starts;
reconnects re-fire the same callback; transactions arrive whole, carrying the right
position to acknowledge; and every quirk that used to be a production incident is
either handled or a loud, named signal.

Positioning against the field, briefly: above pg-logical-replication (leaks slot
management, reconnect, ack discipline, and TOAST entirely) and postgres.js
`subscribe()` (buys a one-line API by silently losing downtime changes and
dropping commit boundaries), while staying far below Debezium's hundred-knob surface by
preferring defaults plus a handful of callbacks over configuration that encodes every
quirk.

Line references point into files under `src/` at `main` @ `30978a9`.
Postgres references: `proto.c` (`logicalrep_write_attrs`),
`heapam.c` (`ExtractReplicaIdentity`).
