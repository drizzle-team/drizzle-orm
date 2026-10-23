# Logical replication playground (drizzle-pulse groundwork)

Raw walsender client + end-to-end verification, zero `src/` changes — the same pattern
copy-client.ts served for COPY. Requires the local cluster with `wal_level=logical`
(one-time: `alter system set wal_level = logical` + restart; done on the bench cluster).

- `repl-client.ts` — startup with `replication=database` (reuses src protocol framing), the
  walsender grammar over simple 'Q' (IDENTIFY_SYSTEM / CREATE_REPLICATION_SLOT / START_REPLICATION),
  CopyBoth streaming, XLogData + keepalive envelopes, standby-status acks with consumer-driven
  `ack(lsn)`, and a full pgoutput proto-v1 parser (B/C/R/I/U/D/T/M) with per-relation column
  caching. LSN helpers included.
- `demo.ts` — the proof, all asserted:

## What the demo proved (PG 14, all passing)

1. **Gapless backfill handoff**: `CREATE_REPLICATION_SLOT … EXPORT_SNAPSHOT` → a second normal
   connection does `begin repeatable read; set transaction snapshot '…'` and sees EXACTLY the
   pre-slot rows; a row inserted after slot creation is excluded from the snapshot and arrives
   as the FIRST streamed transaction. Zero gap, zero overlap — the Pulse initial-sync story.
2. **pgoutput decode**: begin/commit brackets in commit order; relation ('R') metadata with
   column names + type OIDs precedes first use and RE-SENDS on schema change (identity flips
   produced 3 more 'R's); tuple values are query-wire text -> the existing decoder catalog
   applies unchanged.
3. **REPLICA IDENTITY semantics**: DEFAULT -> updates carry NO old tuple; FULL -> full old row.
4. **TOAST 'u' marker**: unchanged out-of-line values arrive as an explicit unchanged marker,
   distinct from null. Subtlety found: `repeat('x',100k)` COMPRESSES INLINE (pglz) and never
   TOASTs — only incompressible >~2KB values go out-of-line and produce 'u'.
5. **`pg_logical_emit_message`** arrives with prefix + payload (sync barriers / app markers).
6. **At-least-once**: disconnect WITHOUT ack -> reconnect + START_REPLICATION replays all 30
   events; `ack(lsn)` ('r' standby status, flushed field) advances `confirmed_flush_lsn` to
   exactly the acked LSN (verified via pg_replication_slots).

## Gotchas collected

- PG 14 needs the LEGACY slot syntax (`EXPORT_SNAPSHOT` keyword); the parenthesized
  `(SNAPSHOT 'export')` form is PG 15+.
- DDL transactions emit EMPTY begin/commit pairs on PG 14 (visible as `begin commit` noise in
  the stream; PG 15+ can skip empty xacts). A consumer must tolerate content-less txs.
- Replication connections: simple protocol only, no poolers, one per slot.
- Slot hygiene is a product feature: an unacked durable slot retains WAL forever.

## src/ design this validates (not yet implemented)

`conn.subscribe({ slot, publications, createSlot?, backfill?, binary?, onChange | asyncIterator, ack })`:
startup param + CopyBoth state machine (a bidirectional cousin of the CopyIn pump), the
pgoutput parser feeding relation-cached row mappers (JIT mappers get (name, oid) straight from
'R' messages), keepalive/ack timer, auto-reconnect from confirmed_flush with LSN dedupe.
