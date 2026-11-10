# Events-table convention

This document pins the naming and column-derivation contract for the events table each
`pulse()`-tracked source table gets, by convention, with no hand-declared mirror table.

The events tables and all their bookkeeping are **runtime-owned**: the runtime provisions
them itself at boot (or ahead of boot via `provision()`) — drizzle-kit is not involved and
generates no migrations for them. Sections 1–4 fix the derived shape; sections 5–8 cover how
the runtime brings that shape in line with the live database, the privileges it needs, and how
to keep drizzle-kit from touching the pulse schema.

The normative shape is produced by
[`packages/drizzle-pulse/src/server/events-table-resolver.ts`](../packages/drizzle-pulse/src/server/events-table-resolver.ts)
(`buildEventsTable`, `getEventsTableName`, `DEFAULT_EVENTS_SCHEMA`) — a pure function:
no database connection, no I/O.

## 1. Name derivation

The events table name is:

```
<escapedSourceSchema>_<escapedSourceTable>
```

- `sourceSchema` is the source table's schema; if the source table has no explicit
  schema (i.e. it lives in `public`), `sourceSchema` falls back to the literal string
  `public`.
- `sourceTable` is the source table's SQL name (not its JS export name).
- **Escaping:** each component has every `_` doubled to `__` before the two are joined
  with a single `_`. This keeps names readable, but the join is **not injective**:
  distinct `(schema, table)` pairs can derive the same name (e.g. schema `a_` table `b`
  and schema `a` table `_b` both derive `a___b`). Such collisions are **rejected at
  registration** — the `PulseRuntime` constructor throws when two distinct source tables derive the same
  events-table name, naming both source tables and the derived name. There is no silent
  shadowing, so the pretty (un-injective) encoding stays safe in practice.

The events table itself lives in a dedicated **events schema** — never in the source
table's own schema, and independent of the project's migrations schema. It defaults to
**`drizzle_pulse`**, the resolver's `DEFAULT_EVENTS_SCHEMA` constant. It can be overridden
at runtime via `pull.eventsSchema`.

**Worked example:** a source table `orders` in the default `public` schema, with
`eventsSchema` left at its default, resolves to:

```
"drizzle_pulse"."public_orders"
```

## 2. Column derivation

Every source column produces **two** columns in the events table: a new-value column
and an `$old_` twin. The table also gets three fixed metadata columns (section 3).

### 2.1 New-value columns

One new-value column per source column, same SQL name, same type/mode/enum/length/
precision/dimensions/srid as the source column — with two systematic differences:

- **Nullability:** every new-value column is nullable, **except** the source table's
  primary-key column, which stays `NOT NULL`. This holds regardless of the source
  column's own nullability — a `NOT NULL` non-PK source column still becomes nullable
  in the events table (an events row only ever has one "side" populated on insert/
  update/delete, so blanket-nullable is required for every non-PK column).
- **No constraints carried over:** `PRIMARY KEY`, `DEFAULT`, `GENERATED` and identity
  clauses are all stripped from every cloned column — the events table has no primary
  key of its own (see section 3 for the one exception, `$snapshot`).

### 2.2 Serial-family relaxation

Serial-family source columns are relaxed to their plain integer/bigint equivalent,
because a literal clone would carry over auto-increment/identity semantics that reject
explicit insert values (the events writer always supplies `$snapshot` separately and
the row's actual primary-key value explicitly):

| Source column type | Events-table column type |
|---|---|
| `serial` | `integer` |
| `smallserial` | `integer` (**not** `smallint` — see worked example below) |
| `bigserial` (`mode: 'number'`) | `bigint` (`mode: 'number'`) |
| `bigserial` (`mode: 'bigint'`) | `bigint` (`mode: 'bigint'`) |

Every other column type (including `bigint`/`numeric`/`decimal` in all their modes,
`varchar`/`char` with length or enum constraints, `timestamp`/`time` with or without
timezone, `point`/`line`/`geometry` in either mode, `vector`/`halfvec`/`sparsevec` with
their dimensions, and `bit` with its dimensions) is preserved exactly — same
`getSQLType()`, same driver-value codec as the source column.

A `.array()` source column (any dimension) is likewise preserved exactly: the cloned
column keeps the source's element type, dimension count, and array (de)serialization
codec, and the emitted DDL renders the element type followed by one `[]` per dimension
(e.g. a 1-dimensional `text('tags').array()` renders as `"tags" text[]`).

### 2.3 `$old_` twins

Each source column also produces an `$old_`-prefixed twin. Its **JS property key** is
`$old_<jsKey>` (source key `smallIntCol` → twin key `$old_smallIntCol`) and its **SQL
name** is `$old_<sqlName>` (SQL name `small_int_col` → twin SQL name `$old_small_int_col`).
The twin is always nullable and uses the same relaxed type as the new-value column (i.e. the
twin of a `serial` PK is a nullable `integer`, not a `serial`).

### 2.4 Enum columns

An enum source column's new-value column and its `$old_` twin both **reference the
same `pgEnum` instance** the source column uses — the enum type is never redeclared.

### 2.5 Worked examples

Lifted directly from the `pg-data-types` integration fixture
(`packages/integration-tests/src/fixtures/pg-data-types/schema.ts`), which is the
byte-level acceptance spec for this section:

Note: the events table's JS object keys **mirror the source table's JS property keys** —
`buildEventsTable` builds its `columns` record keyed by the source table's property key
(the key in `getColumns(sourceTable)`), with the `$old_` twins keyed by `$old_<jsKey>`.
Only the columns' **SQL names** (the builder argument, and the emitted DDL) stay the source
column's SQL name. So the events table reads and writes exactly like the source table via the
drizzle query builder — property keys in, property keys out — while the physical schema is
byte-identical to before.

```ts
// Source table
id: serial('id').primaryKey(),                                    // PK, serial
smallSerialCol: smallserial('small_serial_col'),                  // non-PK, smallserial
bigSerialNumberCol: bigserial('big_serial_number_col', { mode: 'number' }),
moodCol: moodEnum('mood_col'),

// Events table (new-value columns) — JS keys mirror the source's property keys; SQL names unchanged
id: integer('id').notNull(),                                      // PK stays NOT NULL, serial -> integer
smallSerialCol: integer('small_serial_col'),                     // nullable, smallserial -> integer
bigSerialNumberCol: bigint('big_serial_number_col', { mode: 'number' }),
moodCol: moodEnum('mood_col'),                                    // same enum instance

// Events table ($old_ twins) — JS key is $old_<jsKey>; SQL name is $old_<sqlName>
$old_id: integer('$old_id'),
$old_smallSerialCol: integer('$old_small_serial_col'),
$old_bigSerialNumberCol: bigint('$old_big_serial_number_col', { mode: 'number' }),
$old_moodCol: moodEnum('$old_mood_col'),                          // same enum instance again
```

### 2.6 Enum type identifiers in emitted DDL

An enum column's SQL type is a developer-controlled identifier, not a fixed type
keyword, so the generated DDL renders it like any other identifier: quoted, and
schema-qualified when the enum was declared in a non-default schema (e.g.
`"app"."order_status"` for `pgSchema('app').enum('order_status', ...)`, or
`"order_status"` for an enum with no schema). Every other column type keyword
(`integer`, `timestamp with time zone`, ...) is rendered unquoted, as returned by
`getSQLType()`.

### 2.7 Reserved source column names

A source column whose JS property key **or** SQL name would collide with a synthesized
events-table column is rejected outright rather than silently overwritten by object-spread
ordering (both are now events-table keyspaces, so both are checked):

- The three metadata names (`$snapshot`, `$op`, `$timestamp`, section 3) are reserved —
  a source column whose JS key or SQL name is `$snapshot`, `$op`, or `$timestamp` throws at
  `buildEventsTable()` time.
- Any source column whose JS key or SQL name starts with the `$old_` prefix is reserved (it
  is the derivation scheme's own prefix for old-value twins, section 2.3) and likewise throws.

Both are hard failures, matching this document's philosophy for other derivation hazards
(section 4's 63-byte guard) — there is no silent-collision fallback.

## 3. Metadata columns

Every events table gets exactly these three columns, in addition to the new-value and
`$old_` twin columns above:

| Column | Type | Notes |
|---|---|---|
| `$snapshot` | `integer` | `GENERATED ALWAYS AS IDENTITY` — the only identity column on the table; a monotonic ordinal used as the event stream's watermark/cursor. |
| `$op` | `text` | `NOT NULL` — one of `insert` \| `update` \| `delete` \| `snapshot`. |
| `$timestamp` | `timestamp with time zone` | `NOT NULL DEFAULT now()` — the only column in the table with a runtime default. |

These three are built with plain column builders (not config-clones of any source
column) — they are constant across every events table regardless of the source
table's shape.

`$snapshot`'s identity is created with an **explicit sequence name**
`<eventsTableName>_snapshot_seq` (all other sequence options left at their integer
defaults: `INCREMENT BY 1`, `MINVALUE 1`, `START 1`, `MAXVALUE 2147483647`, `NO CYCLE`,
`CACHE 1`). The name is pinned so the DDL the runtime renders (`emitEventsTableDdl`) is
stable and deterministic — its sha256 is the recreate trigger (section 5.2), so an
auto-derived sequence name that shifts between Drizzle versions would spuriously rehash and
recreate the table. Drizzle otherwise defaults the name to `<eventsTableName>_$snapshot_seq`
(with the `$`).

## 4. Identifier length guard (error contract)

Postgres silently truncates identifiers over 63 bytes, which would let the resolver
and a DDL statement disagree on the real table/column name without either side
noticing (a `CREATE TABLE` targeting one truncated name while the runtime queries a
different truncated name — a silent zero-events failure). To avoid this, the resolver
checks every identifier it derives — the events table name, every `$old_<name>` twin,
and the `$snapshot` sequence name `<eventsTableName>_snapshot_seq` — and **throws
immediately** if it exceeds 63 bytes (UTF-8), rather than letting Postgres truncate it:

```
Derived identifier "<identifier>" is <N> bytes, exceeding Postgres's 63-byte identifier limit
```

New-value column names are not re-checked, because they reuse the source column's SQL
name verbatim — if it fit in the source table, it fits here too. Only names the
resolver actually *derives* (the table name, the `$old_` prefix, and the `_snapshot_seq`
sequence name) can newly exceed the limit — and the sequence name is the longest of the
three, so it can overflow even when the events table name itself fits.

**This is a hard failure, not a warning.** There is no deterministic truncation or
shortening scheme yet — an events table (or column) whose derived name overflows 63 bytes
cannot be created at all until a shortening scheme ships. Both `buildEventsTable` and the
DDL renderer that feeds `bootstrap()` derive from these same identifiers, so the guard fires
before any statement reaches Postgres.

## 5. Runtime provisioning & bootstrap

Nothing outside the runtime creates or migrates these tables. On `PulseRuntime.start()`
— and, identically, on `provision()` (section 5.5) — the runtime runs `bootstrap()`
([`pulse-runtime.ts`](../packages/drizzle-pulse/src/server/pulse-runtime.ts)): one transaction, guarded by a
`pg_advisory_xact_lock` keyed on the events schema so two booting runtimes can't race the same
DDL. In that transaction it, in order:

1. asserts `wal_level = logical` (server-wide, the one precondition it can't fix — boot rejects rather than proceeding without it);
2. sets `REPLICA IDENTITY FULL` on every registered source table (and resets it to `DEFAULT`
   on any table it un-pulses) — in both pull modes, so every update/delete carries a full old
   tuple and the runtime never reads old-row data back from the source tables;
3. creates the `CREATE PUBLICATION` (owning exactly the registered sources) or — unless the
   publication is `FOR ALL TABLES` — diffs its membership, `ADD`ing registered sources and
   `DROP`ping members that are no longer pulsed;
4. creates the events schema (`drizzle_pulse` by default) and the `pulse_meta` bookkeeping table;
5. creates/recreates each events table whose rendered DDL diverges from what's recorded
   (section 5.2), rotating its epoch (section 5.3);
6. sweeps orphans (section 5.4).

Any throw rolls the whole transaction back, so a database the runtime can't fully provision is
left untouched. `start()` then opens the WAL stream; `provision()` returns without opening it.

### 5.1 `pulse_meta` bookkeeping

The events schema holds one bookkeeping table alongside the events tables:

```sql
CREATE TABLE drizzle_pulse.pulse_meta (
  table_name text PRIMARY KEY,   -- events-table name (section 1), unqualified
  ddl_hash   text NOT NULL,      -- sha256 of the rendered CREATE DDL
  epoch      uuid NOT NULL        -- rotated on every recreate (section 5.3)
);
```

One row per events table the runtime owns. It is the source of truth for what pulse manages:
the recreate check (5.2) and the orphan sweep (5.4) both read from it.

### 5.2 DDL-hash recreate

The runtime renders each events table's DDL to a fixed string —
`CREATE SCHEMA IF NOT EXISTS`, `DROP TABLE IF EXISTS`, `CREATE TABLE` — with
`emitEventsTableDdl` ([`events-table-ddl.ts`](../packages/drizzle-pulse/src/server/events-table-ddl.ts)),
derived strictly from `buildEventsTable`'s output, and hashes it with sha256. On bootstrap:

- if the `pulse_meta` row exists, its `ddl_hash` matches, and the physical table is present →
  no-op (the epoch is retained);
- otherwise → `DROP TABLE IF EXISTS` + `CREATE TABLE`, and the `pulse_meta` row is upserted with
  the new hash and a **fresh epoch**.

So the events table is recreated exactly when its derived shape changes — a source-column
add/drop/retype, or a change to the derivation algorithm itself. Recreate is a drop: existing
events rows are discarded (section 7).

### 5.3 Epochs & cursor reset

Each events table carries an `epoch` (a uuid) in `pulse_meta`, rotated on every recreate.
Cursor tokens clients hold are opaque `"<epoch>:<snapshot>"` strings
([`cursor.ts`](../packages/drizzle-pulse/src/server/cursor.ts)); a pull echoes its token back and
the handler compares its epoch to the current one. A token minted before a recreate carries the
old epoch, so it's detected as stale and the client is told to reset (rebaseline) rather than
resume against a since-dropped table — a bounded re-fetch. Consequence: any migration that
changes a pulsed table's shape (hence recreates its events table) resets that table's
subscribers. This is accepted by design.

The same reset path covers the per-pull event cap: a pull that would replay more than
`pull.eventLimit` events (default 1000) resets instead of streaming an unbounded batch.

### 5.4 Orphan policy

After provisioning the desired set, the runtime sweeps the events schema:

- a `pulse_meta` row with no matching registered source → its table is dropped and its row
  deleted (a table pulse used to own but no longer does);
- a physical table in the events schema with **neither** a `pulse_meta` row **nor** a registered
  source → left untouched, logged as a warning (it may be an unrelated table someone else put in
  the schema; pulse never drops what it didn't record owning).

### 5.5 Privileges & `provision()`

By default the app's own database role owns its tables and can `CREATE`, so `start()`
self-provisions everything above on first boot and no-ops on subsequent boots (the hashes match).
When a self-provisioning statement fails, the error names the exact statement and the grant it
most likely needs (e.g. *ownership of `public.orders`*, *the database `CREATE` privilege*,
*ownership of the publication*).

For split-role deployments where the app role is deliberately unprivileged, call
`PulseRuntime.provision()` once from a migration/deploy step under an elevated role: it runs
the same `bootstrap()` over a short-lived admin connection and returns without opening the WAL
stream. The app's later `start()` then finds everything in place and no-ops the DDL. The
provisioning role needs, across the statements it may run:

- **ownership of each pulsed source table** — for `REPLICA IDENTITY FULL` / `DEFAULT`;
- **the database `CREATE` privilege** — for `CREATE PUBLICATION` and `CREATE SCHEMA`;
- **ownership of the publication** — for membership `ADD`/`DROP` once it exists.

The WAL streaming connection `start()` opens additionally needs the `REPLICATION` attribute (and
a replication-enabled connection); `wal_level = logical` must be set server-wide.

## 6. Keeping drizzle-kit out: `schemaFilter`

drizzle-kit is not involved in events-table DDL, but your `drizzle-kit push`/`pull` must not try
to manage or drop the pulse-owned schema. kit's `schemaFilter` is an **allowlist** of schemas it
manages (default `['public']`): make sure your pulse events schema — `'drizzle_pulse'` by default,
or whatever you pass as `pull.eventsSchema` — is **not** in it. At the default it already
is excluded; only a config that widens `schemaFilter` (or moves your app off `public`) needs the
explicit exclusion.

## 7. Retention

Events tables are append-only and are never trimmed on their own — rows accumulate for the life of
the table and are discarded only when the table is recreated (section 5.2). This is fine for the
current design (the cursor watermark advances monotonically); a periodic trim below the lowest
live subscriber's snapshot is a straightforward future addition and needs no schema change.

## 8. Reference implementation

- [`events-table-resolver.ts`](../packages/drizzle-pulse/src/server/events-table-resolver.ts)
  is normative for every rule in sections 1–4. `buildEventsTable(sourceTable, options?)`
  returns a genuine Drizzle `PgTable` — the runtime inserts events into it directly
  (`db.insert(eventsTable).values(...)` in `pulse-store.ts`), so codec-faithful column
  reconstruction (reusing each source column's own `mapToDriverValue`/`mapFromDriverValue`) is
  part of this contract, not an implementation detail.
- [`events-table-ddl.ts`](../packages/drizzle-pulse/src/server/events-table-ddl.ts) renders the
  recreate DDL strictly from `buildEventsTable`'s output; its joined text is the string `bootstrap()`
  hashes to detect divergence (section 5.2). It is internal to the package (not a public export).
- Unit tests over the full edge-case type matrix live in
  [`events-table-resolver.test.ts`](../packages/drizzle-pulse/src/__tests__/events-table-resolver.test.ts),
  and DDL-rendering tests in
  [`events-table-ddl.test.ts`](../packages/drizzle-pulse/src/__tests__/events-table-ddl.test.ts).
  Any change to the derivation rules above must keep those tests passing, and any change to the
  tests must be reflected back into this document.
