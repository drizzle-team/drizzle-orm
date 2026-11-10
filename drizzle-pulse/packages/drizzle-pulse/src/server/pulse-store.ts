import { type Connection, createPool, type Pool } from '@drizzle-team/minipg';
import { eq, getColumns, sql } from 'drizzle-orm';
import { type PgTable, pgSchema, text, uuid } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres';
import type { PendingWalEvent } from './pulse-runtime.js';

type DbHandle = ReturnType<typeof drizzle>;
type TxHandle = Parameters<Parameters<DbHandle['transaction']>[0]>[0];

// Drizzle objects for the two bookkeeping tables bootstrap() creates in the events schema, so
// their DML runs through the query builder. The raw CREATE TABLE IF NOT EXISTS statements in
// bootstrap() must keep producing the identical column definitions declared here.
function buildMetaTables(eventsSchema: string) {
  const schema = pgSchema(eventsSchema);
  return {
    // One row per events table: the DDL hash bootstrap() compares against, plus the epoch that
    // rotates on every recreate.
    pulseMeta: schema.table('pulse_meta', {
      tableName: text('table_name').primaryKey(),
      ddlHash: text('ddl_hash').notNull(),
      epoch: uuid('epoch').notNull(),
    }),
    // Durable commit-LSN dedupe watermark, keyed by slot.
    pulseStream: schema.table('pulse_stream', {
      slotName: text('slot_name').primaryKey(),
      lastLsn: text('last_lsn').notNull(),
    }),
  };
}

type MetaTables = ReturnType<typeof buildMetaTables>;

export class PulseStore {
  private readonly pool: Pool;
  private readonly db: DbHandle;
  readonly pulseMeta: MetaTables['pulseMeta'];
  readonly pulseStream: MetaTables['pulseStream'];

  constructor(databaseUrl: string, eventsSchema: string) {
    this.pool = createPool(databaseUrl);
    this.db = drizzle({ client: this.pool });
    ({ pulseMeta: this.pulseMeta, pulseStream: this.pulseStream } = buildMetaTables(eventsSchema));
  }

  getDb(): DbHandle {
    return this.db;
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  checkout(): Promise<{ client: Connection; release: () => void }> {
    return this.pool.connect();
  }

  async getStreamWatermark(slotName: string): Promise<string | null> {
    const [row] = await this.db
      .select({ lastLsn: this.pulseStream.lastLsn })
      .from(this.pulseStream)
      .where(eq(this.pulseStream.slotName, slotName));
    return row?.lastLsn ?? null;
  }

  // Writes a WAL commit's event rows and advances the durable dedupe watermark in one
  // db.transaction, so rows and watermark move together and the caller (pulse-runtime.ts) acks
  // only after this resolves. An empty `events` array still upserts the watermark (a data-less
  // commit advances the dedupe floor).
  async ingestCommit(
    events: PendingWalEvent[],
    slotName: string,
    commitLsn: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const event of events) {
        await this.insertEventRow(event.eventsTable, this.buildEventRow(event), tx);
      }

      await tx
        .insert(this.pulseStream)
        .values({ slotName, lastLsn: commitLsn })
        .onConflictDoUpdate({ target: this.pulseStream.slotName, set: { lastLsn: commitLsn } });
    });
  }

  async createBaselineSnapshot(
    table: PgTable,
    pkKey: string,
    baselineRow: Record<string, unknown> | null,
    dbHandle: DbHandle | TxHandle = this.db,
  ): Promise<void> {
    const [existing] = await dbHandle.select({ one: sql`1` }).from(table).limit(1);
    if (existing) return;

    const row = baselineRow;
    if (!row) return;
    const pkValue = row[pkKey];
    if (pkValue === undefined) {
      throw new Error(`Baseline snapshot missing primary key ${pkKey}`);
    }

    await this.insertEventRow(
      table,
      this.buildEventRow({
        op: 'snapshot',
        pkKey,
        pkValue,
        row,
        oldRow: row,
      }),
      dbHandle,
    );
  }

  async getLatestSnapshot(table: PgTable): Promise<number> {
    const snapshotColumn = getColumns(table)['$snapshot'];
    const [row] = await this.db
      .select({ snapshot: sql<number | null>`max(${snapshotColumn})::int` })
      .from(table);
    return row?.snapshot ?? 0;
  }

  private async insertEventRow(
    table: PgTable,
    values: Record<string, unknown>,
    dbHandle: DbHandle | TxHandle = this.db,
  ): Promise<void> {
    if (Object.keys(values).length === 0) {
      return;
    }

    await dbHandle.insert(table).values(values);
  }

  private toOldRowValues(row: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [`$old_${key}`, value]));
  }

  // One builder for all four event-row shapes (insert/update/delete/snapshot), driven by `op`
  // rather than which fields are present. `row` is always passed (delete's is `{}` per
  // PendingWalEvent's tap contract) but deliberately ignored for deletes below — a delete's
  // persisted row is old-row-derived.
  private buildEventRow(
    input: { pkKey: string; pkValue: unknown; row: Record<string, unknown> } & (
      | { op: 'insert'; oldRow: null }
      | { op: 'update' | 'delete' | 'snapshot'; oldRow: Record<string, unknown> }
    ),
  ): Record<string, unknown> {
    const { pkKey, pkValue, op, row } = input;

    const nextRowData = op === 'delete' ? null : this.withPrimaryKeyValue(row, pkKey, pkValue);
    const nextOldRowData =
      op === 'insert' ? nextRowData : this.withPrimaryKeyValue(input.oldRow, pkKey, pkValue);

    return {
      [pkKey]: pkValue,
      ...(nextRowData ?? nextOldRowData),
      ...this.toOldRowValues(nextOldRowData ?? {}),
      $op: op,
    };
  }

  private withPrimaryKeyValue(
    row: Record<string, unknown>,
    pkKey: string,
    pkValue: unknown,
  ): Record<string, unknown> {
    return row[pkKey] === undefined ? { ...row, [pkKey]: pkValue } : row;
  }
}
