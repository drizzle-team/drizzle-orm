import { describe, expect, test } from 'bun:test';
import {
  boolean,
  integer,
  pgSchema,
  primaryKey,
  serial,
  smallserial,
  text,
  varchar,
} from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { PulseTable, pulse } from '../pulse-table.js';
import { PulseBuilder } from '../server/pulse-builder.js';

const testSchema = pgSchema('test');

const serialPkTable = testSchema.table('serial_pk_items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

const noPkTable = testSchema.table('no_pk_items', {
  name: text('name').notNull(),
  score: integer('score'),
});

const twoInlinePkTable = testSchema.table('two_inline_pk_items', {
  leftId: integer('left_id').primaryKey(),
  rightId: integer('right_id').primaryKey(),
});

const unsupportedPkTable = testSchema.table('unsupported_pk_items', {
  id: boolean('id').primaryKey(),
  name: text('name').notNull(),
});

const varcharPkTable = testSchema.table('varchar_pk_items', {
  code: varchar('code', { length: 64 }).primaryKey(),
  name: text('name').notNull(),
});

const smallSerialPkTable = testSchema.table('smallserial_pk_items', {
  id: smallserial('id').primaryKey(),
  name: text('name').notNull(),
});

const tableLevelPkTable = testSchema.table(
  'table_level_pk_items',
  {
    id: integer('id').notNull(),
    name: text('name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.id] })],
);

const compositePkTable = testSchema.table(
  'composite_pk_items',
  {
    leftId: integer('left_id').notNull(),
    rightId: integer('right_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.leftId, t.rightId] })],
);

describe('pulse() construct-unconditionally + lazy .query()-time PK validation', () => {
  test('pulse() does not throw for a table with no primary key', () => {
    expect(() => pulse(noPkTable)).not.toThrow();
  });

  test('.query() on the no-PK table throws mentioning the table name and the missing-PK requirement', () => {
    const entity = pulse(noPkTable);
    expect(() => entity.query()).toThrowError(/test\.no_pk_items.*has no primary key/);
  });

  test('.query() on the two-inline-PK table throws mentioning "multiple primary keys"', () => {
    const entity = pulse(twoInlinePkTable);
    expect(() => entity.query()).toThrowError('has multiple primary keys');
  });

  test('.query() on a single-column table-level primaryKey() succeeds', () => {
    expect(() => pulse(tableLevelPkTable).query()).not.toThrow();
  });

  test('.query() on a composite table-level primaryKey() throws "multiple primary keys"', () => {
    expect(() => pulse(compositePkTable).query()).toThrowError('has multiple primary keys');
  });

  test('.query() on the boolean-PK table throws mentioning the unsupported SQL type', () => {
    const entity = pulse(unsupportedPkTable);
    expect(() => entity.query()).toThrowError('unsupported SQL type');
  });

  test('.query() on the varchar(64)-PK table succeeds (length-modifier stripping)', () => {
    const entity = pulse(varcharPkTable);
    expect(() => entity.query()).not.toThrow();
  });

  test('.query() on the smallserial-PK table succeeds', () => {
    const entity = pulse(smallSerialPkTable);
    expect(() => entity.query()).not.toThrow();
  });
});

describe('PulseTable.query(fn?)', () => {
  test('.query() returns a PulseBuilder whose config has queryFn null', () => {
    const query = pulse(serialPkTable).query();
    expect(query).toBeInstanceOf(PulseBuilder);
    expect(query.config.queryFn).toBeNull();
  });

  test('.query(fn) stores fn', () => {
    const fn = (ctx: { query: (w: Record<string, unknown>) => unknown }) =>
      ctx.query({ name: 'x' });
    const query = pulse(serialPkTable).query(fn as never);
    expect(query.config.queryFn).toBe(fn as never);
  });

  test('chaining .args().order().limit().query() on the result works and preserves the source table', () => {
    const schema = z.object({ name: z.string() });
    const chained = pulse(serialPkTable)
      .query()
      .args(schema)
      .order('desc')
      .limit(3)
      .query((ctx) => ctx.query({ name: ctx.args.name }));

    expect(chained).toBeInstanceOf(PulseBuilder);
    expect(chained.config.argsSchema).toBe(schema);
    expect(chained.config.order).toBe('desc');
    expect(chained.config.limit).toBe(3);
    expect(chained.config.table.source).toBe(serialPkTable);
  });

  test('pulse(t) constructs unconditionally even for tables with no primary key', () => {
    expect(pulse(noPkTable)).toBeInstanceOf(PulseTable);
  });
});
