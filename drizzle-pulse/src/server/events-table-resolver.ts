import { getColumns } from 'drizzle-orm';
import type {
  AnyPgColumnBuilder,
  PgColumn,
  PgColumnToBuilderOverrides,
  PgTable,
} from 'drizzle-orm/pg-core';
import { bigint, getTableConfig, integer, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';
import { getPulsePkColumn } from '../pulse-table.js';

// Events tables are built through the normal pgSchema().table() flow; each source column is
// cloned via its public toBuilder() (see docs/events-table-convention.md).

export const DEFAULT_EVENTS_SCHEMA = 'drizzle_pulse';

const POSTGRES_IDENTIFIER_BYTE_LIMIT = 63;

function assertIdentifierLength(identifier: string): void {
  const byteLength = Buffer.byteLength(identifier, 'utf8');
  if (byteLength > POSTGRES_IDENTIFIER_BYTE_LIMIT) {
    throw new Error(
      `Derived identifier "${identifier}" is ${byteLength} bytes, exceeding Postgres's ${POSTGRES_IDENTIFIER_BYTE_LIMIT}-byte identifier limit`,
    );
  }
}

// `_` -> `__` per component before joining the two with a single `_`. Keeps names readable,
// but different source tables can still collide: ("a_","b") and ("a","_b") both derive
// "a___b". Collisions are rejected at registration (see pulse-runtime.ts).
function escapeComponent(component: string): string {
  return component.replaceAll('_', '__');
}

export function getEventsTableName(sourceTable: PgTable): string {
  const config = getTableConfig(sourceTable);
  const name = `${escapeComponent(config.schema ?? 'public')}_${escapeComponent(config.name)}`;
  assertIdentifierLength(name);
  return name;
}

const RESERVED_EVENTS_COLUMN_NAMES = new Set(['$snapshot', '$op', '$timestamp']);

// A source column named after a metadata column, or carrying the derived `$old_` prefix,
// would collide with a synthesized column; fail loudly instead of silently overwriting. Both
// the JS property key and the SQL name are now events-table keyspaces, so check each.
function assertNotReservedSourceColumnName(jsKey: string, sqlName: string): void {
  for (const name of new Set([jsKey, sqlName])) {
    if (RESERVED_EVENTS_COLUMN_NAMES.has(name)) {
      throw new Error(
        `Source column "${name}" collides with a reserved events-table metadata column name (${[...RESERVED_EVENTS_COLUMN_NAMES].join(', ')}); rename the source column`,
      );
    }
    if (name.startsWith('$old_')) {
      throw new Error(
        `Source column "${name}" starts with the reserved "$old_" prefix used for derived old-value columns; rename the source column`,
      );
    }
  }
}

// Serial-family columns must shed their auto-increment identity in the events table (it
// rejects explicitly-supplied insert values); relax them to plain integer/bigint. The name is
// explicit so the builder's SQL name never drifts from the source column's.
function relaxSerial(column: PgColumn, name: string) {
  switch (column.getSQLType()) {
    case 'serial':
    case 'smallserial':
      return integer(name);
    case 'bigserial':
      return bigint(name, { mode: column.columnType === 'PgBigSerial64' ? 'bigint' : 'number' });
  }
}

/**
 * Builds the events-table {@link PgTable} for a pulsed source table by convention: name
 * `<escapedSchema>_<escapedTable>` in {@link DEFAULT_EVENTS_SCHEMA}, an `$old_` twin per
 * source column, and `$snapshot`/`$op`/`$timestamp` metadata columns. Pure; no I/O.
 * See docs/events-table-convention.md.
 */
export function buildEventsTable(
  sourceTable: PgTable,
  options?: { eventsSchema?: string },
): PgTable {
  const eventsSchema = options?.eventsSchema ?? DEFAULT_EVENTS_SCHEMA;
  const tableName = getEventsTableName(sourceTable);
  const pkColumnName = getPulsePkColumn(sourceTable).name;

  // The explicit sequence name keeps the rendered DDL deterministic for the bootstrap
  // hash. It can newly overflow 63 bytes even when tableName fit.
  const snapshotSequenceName = `${tableName}_snapshot_seq`;
  assertIdentifierLength(snapshotSequenceName);

  // Events columns carry only the source column's type; every value/constraint clause
  // (pk, notNull, defaults, unique, generated, identity) stays behind.
  const stripSourceConfig: PgColumnToBuilderOverrides<unknown> = {
    primaryKey: false,
    notNull: false,
    default: undefined,
    defaultFn: undefined,
    onUpdateFn: undefined,
    unique: false,
    generated: undefined,
    generatedIdentity: undefined,
  };

  const columns: Record<string, AnyPgColumnBuilder> = {};

  for (const [jsKey, column] of Object.entries(getColumns(sourceTable))) {
    assertNotReservedSourceColumnName(jsKey, column.name);

    const newValue =
      relaxSerial(column, column.name) ??
      column.toBuilder({ ...stripSourceConfig, name: column.name });
    columns[jsKey] = column.name === pkColumnName ? newValue.notNull() : newValue;

    const oldName = `$old_${column.name}`;
    assertIdentifierLength(oldName);
    columns[`$old_${jsKey}`] =
      relaxSerial(column, oldName) ?? column.toBuilder({ ...stripSourceConfig, name: oldName });
  }

  Object.assign(columns, {
    $snapshot: integer().generatedAlwaysAsIdentity({ name: snapshotSequenceName }),
    $op: text().notNull(),
    $timestamp: timestamp({ withTimezone: true }).notNull().defaultNow(),
  });

  return pgSchema(eventsSchema).table(tableName, columns);
}
