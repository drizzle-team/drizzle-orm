import { describe, expect, test } from 'bun:test';
import { getColumns, is } from 'drizzle-orm';
import type { PgColumn, PgTable as PgTableType } from 'drizzle-orm/pg-core';
import {
  bigint,
  bigserial,
  bit,
  char,
  decimal,
  geometry,
  getTableConfig,
  halfvec,
  integer,
  numeric,
  PgTable,
  pgEnum,
  pgTable,
  point,
  serial,
  smallserial,
  sparsevec,
  text,
  timestamp,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';
import {
  buildEventsTable,
  DEFAULT_EVENTS_SCHEMA,
  getEventsTableName,
} from '../server/events-table-resolver.js';

const moodEnum = pgEnum('resolver_test_mood', ['sad', 'ok', 'happy']);

const sourceTable = pgTable('resolver_fixture', {
  id: serial('id').primaryKey(),
  smallSerialCol: smallserial('small_serial_col'),
  bigSerialNumberCol: bigserial('big_serial_number_col', { mode: 'number' }),
  bigSerialBigIntCol: bigserial('big_serial_bigint_col', { mode: 'bigint' }),
  bigIntNumberCol: bigint('big_int_number_col', { mode: 'number' }),
  bigIntBigIntCol: bigint('big_int_bigint_col', { mode: 'bigint' }),
  bigIntStringCol: bigint('big_int_string_col', { mode: 'string' }),
  numericStringCol: numeric('numeric_string_col', { precision: 10, scale: 2 }),
  numericNumberCol: numeric('numeric_number_col', { mode: 'number' }),
  decimalBigIntCol: decimal('decimal_bigint_col', { mode: 'bigint' }),
  varcharCol: varchar('varchar_col', { length: 64, enum: ['red', 'green', 'blue'] }),
  charCol: char('char_col', { length: 3 }),
  moodCol: moodEnum('mood_col'),
  timestampTzCol: timestamp('timestamp_tz_col', { withTimezone: true }),
  timestampStringCol: timestamp('timestamp_string_col', { mode: 'string' }),
  pointTupleCol: point('point_tuple_col'),
  pointObjectCol: point('point_object_col', { mode: 'xy' }),
  geometryCol: geometry('geometry_col', { type: 'point', srid: 4326 }),
  vectorCol: vector('vector_col', { dimensions: 3 }),
  halfvecCol: halfvec('halfvec_col', { dimensions: 3 }),
  sparsevecCol: sparsevec('sparsevec_col', { dimensions: 3 }),
  bitCol: bit('bit_col', { dimensions: 8 }),
  notNullCol: text('not_null_col').notNull(),
  defaultedCol: text('defaulted_col').default('hello'),
  identityCol: integer('identity_col').generatedAlwaysAsIdentity(),
  tagsCol: text('tags_col').array(),
  timesCol: timestamp('times_col', { withTimezone: true }).array(),
});

function getColumnByName(table: PgTableType, name: string): PgColumn {
  const column = Object.values(getColumns(table)).find((candidate) => candidate.name === name);
  if (!column) {
    throw new Error(`Column "${name}" not found on table`);
  }
  return column;
}

const SERIAL_COLUMN_TYPES = new Set([
  'PgSerial',
  'PgSmallSerial',
  'PgBigSerial53',
  'PgBigSerial64',
]);

describe('buildEventsTable', () => {
  test('derives the events table name and schema by convention', () => {
    const eventsTable = buildEventsTable(sourceTable);
    const config = getTableConfig(eventsTable);
    expect(config.name).toBe('public_resolver__fixture');
    expect(config.schema).toBe(DEFAULT_EVENTS_SCHEMA);
    expect(DEFAULT_EVENTS_SCHEMA).toBe('drizzle_pulse');
    expect(getEventsTableName(sourceTable)).toBe('public_resolver__fixture');

    const customSchema = buildEventsTable(sourceTable, { eventsSchema: 'custom_schema' });
    expect(getTableConfig(customSchema).schema).toBe('custom_schema');
  });

  test('produces 2x source columns + 3 metadata columns, every name present', () => {
    const eventsTable = buildEventsTable(sourceTable);
    const sourceColumns = Object.values(getColumns(sourceTable));
    const eventsColumns = getColumns(eventsTable);
    const eventsColumnNames = Object.values(eventsColumns).map((column) => column.name);

    expect(Object.keys(eventsColumns).length).toBe(sourceColumns.length * 2 + 3);

    for (const sourceColumn of sourceColumns) {
      expect(eventsColumnNames).toContain(sourceColumn.name);
      expect(eventsColumnNames).toContain(`$old_${sourceColumn.name}`);
    }
    for (const metadataName of ['$snapshot', '$op', '$timestamp']) {
      expect(eventsColumnNames).toContain(metadataName);
    }
  });

  test('only the PK new-value column is notNull; primaryKey is stripped everywhere', () => {
    const eventsTable = buildEventsTable(sourceTable);

    const idColumn = getColumnByName(eventsTable, 'id');
    expect(idColumn.notNull).toBe(true);
    expect(idColumn.primary).toBe(false);

    const notNullCol = getColumnByName(eventsTable, 'not_null_col');
    expect(notNullCol.notNull).toBe(false);

    const oldId = getColumnByName(eventsTable, '$old_id');
    expect(oldId.notNull).toBe(false);

    for (const column of Object.values(getColumns(eventsTable))) {
      expect(column.primary).toBe(false);
    }
  });

  test('non-serial columns preserve the source getSQLType(); serial family relaxes to integer/bigint', () => {
    const eventsTable = buildEventsTable(sourceTable);

    for (const sourceColumn of Object.values(getColumns(sourceTable))) {
      if (SERIAL_COLUMN_TYPES.has(sourceColumn.columnType)) continue;
      const clone = getColumnByName(eventsTable, sourceColumn.name);
      expect(clone.getSQLType()).toBe(sourceColumn.getSQLType());
    }

    expect(getColumnByName(eventsTable, 'id').getSQLType()).toBe('integer');
    expect(getColumnByName(eventsTable, 'small_serial_col').getSQLType()).toBe('integer');
    expect(getColumnByName(eventsTable, 'big_serial_number_col').getSQLType()).toBe('bigint');
    expect(getColumnByName(eventsTable, 'big_serial_bigint_col').getSQLType()).toBe('bigint');
  });

  test('cloned columns carry no default/generated/identity config; metadata columns match the spec', () => {
    const eventsTable = buildEventsTable(sourceTable);
    const metadataNames = new Set(['$snapshot', '$op', '$timestamp']);

    for (const column of Object.values(getColumns(eventsTable))) {
      if (metadataNames.has(column.name)) continue;
      expect(column.hasDefault).toBe(false);
      expect(column.generatedIdentity).toBeUndefined();
      expect(column.generated).toBeUndefined();
      expect(column.primary).toBe(false);
    }

    const snapshot = getColumnByName(eventsTable, '$snapshot');
    expect(snapshot.generatedIdentity?.type).toBe('always');
    expect(snapshot.getSQLType()).toBe('integer');

    const op = getColumnByName(eventsTable, '$op');
    expect(op.notNull).toBe(true);
    expect(op.getSQLType()).toBe('text');
    expect(op.generatedIdentity).toBeUndefined();

    const timestampCol = getColumnByName(eventsTable, '$timestamp');
    expect(timestampCol.notNull).toBe(true);
    expect(timestampCol.hasDefault).toBe(true);
    expect(timestampCol.getSQLType()).toBe('timestamp with time zone');
  });

  test('enum columns reference the same enum instance on the twin', () => {
    const eventsTable = buildEventsTable(sourceTable);
    const sourceMood = getColumnByName(sourceTable, 'mood_col');
    const moodNew = getColumnByName(eventsTable, 'mood_col');
    const moodOld = getColumnByName(eventsTable, '$old_mood_col');

    expect(moodNew.getSQLType()).toBe(sourceMood.getSQLType());
    expect(moodOld.getSQLType()).toBe(sourceMood.getSQLType());
    expect(moodNew.enumValues).toEqual(['sad', 'ok', 'happy']);
    expect(moodOld.enumValues).toEqual(['sad', 'ok', 'happy']);
  });

  test('throws loudly when the derived table name exceeds 63 bytes', () => {
    const longTable = pgTable(`resolver_fixture_${'x'.repeat(60)}`, {
      id: serial('id').primaryKey(),
    });

    expect(() => buildEventsTable(longTable)).toThrow(
      /exceeding Postgres's 63-byte identifier limit/,
    );
  });

  test('throws loudly when a derived $old_ column name exceeds 63 bytes', () => {
    const longColumnName = 'a'.repeat(60);
    const longColumnTable = pgTable('resolver_long_col_fixture', {
      id: serial('id').primaryKey(),
      longCol: text(longColumnName),
    });

    expect(() => buildEventsTable(longColumnTable)).toThrow(
      /\$old_a+.*exceeding Postgres's 63-byte identifier limit/,
    );
  });

  test('throws loudly when the derived $snapshot sequence name exceeds 63 bytes', () => {
    // Events name is 55 bytes (fits), but `${name}_snapshot_seq` = 68 bytes (overflows).
    const longSeqTable = pgTable('x'.repeat(48), {
      id: serial('id').primaryKey(),
    });

    expect(() => buildEventsTable(longSeqTable)).toThrow(
      /_snapshot_seq" is \d+ bytes, exceeding Postgres's 63-byte identifier limit/,
    );
  });

  test("the synthesized table passes drizzle's is(result, PgTable) check", () => {
    const eventsTable = buildEventsTable(sourceTable);
    expect(is(eventsTable, PgTable)).toBe(true);
  });

  test('throws loudly when a source column name collides with a reserved metadata column name', () => {
    for (const reservedName of ['$snapshot', '$op', '$timestamp']) {
      const collidingTable = pgTable('resolver_reserved_name_fixture', {
        id: serial('id').primaryKey(),
        collided: text(reservedName),
      });
      expect(() => buildEventsTable(collidingTable)).toThrow(
        /collides with a reserved events-table metadata column name/,
      );
    }
  });

  test('throws loudly when a source column name starts with the reserved $old_ prefix', () => {
    const collidingTable = pgTable('resolver_old_prefix_fixture', {
      id: serial('id').primaryKey(),
      collided: text('$old_id'),
    });
    expect(() => buildEventsTable(collidingTable)).toThrow(/reserved "\$old_" prefix/);
  });

  test('array columns preserve dimensions and getSQLType on both new-value and $old_ clones', () => {
    const eventsTable = buildEventsTable(sourceTable);
    const sourceTags = getColumnByName(sourceTable, 'tags_col');
    const sourceTimes = getColumnByName(sourceTable, 'times_col');

    const tagsClone = getColumnByName(eventsTable, 'tags_col');
    const oldTagsClone = getColumnByName(eventsTable, '$old_tags_col');
    expect(tagsClone.dimensions).toBe(sourceTags.dimensions);
    expect(tagsClone.dimensions).toBe(1);
    expect(tagsClone.getSQLType()).toBe(sourceTags.getSQLType());
    expect(oldTagsClone.dimensions).toBe(sourceTags.dimensions);

    const timesClone = getColumnByName(eventsTable, 'times_col');
    expect(timesClone.dimensions).toBe(sourceTimes.dimensions);
    expect(timesClone.getSQLType()).toBe(sourceTimes.getSQLType());
  });

  test('cloned array columns keep the source column array (de)serialization codec', () => {
    const eventsTable = buildEventsTable(sourceTable);
    const timesClone = getColumnByName(eventsTable, 'times_col');
    const now = new Date('2024-01-01T00:00:00.000Z');

    // Without postBuild(), mapToDriverValue receives the raw array and calls
    // value.toISOString() on it directly (reproduced in review: throws
    // "value.toISOString is not a function"). postBuild() wraps the codec to map
    // each array element instead.
    expect(() => timesClone.mapToDriverValue([now])).not.toThrow();
    expect(timesClone.mapToDriverValue([now])).toEqual([now.toISOString()]);
  });
});
