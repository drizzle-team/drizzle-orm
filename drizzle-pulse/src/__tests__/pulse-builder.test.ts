import { describe, expect, test } from 'bun:test';
import { getColumns, getTableUniqueName } from 'drizzle-orm';
import { boolean, integer, pgSchema, primaryKey, serial, text, varchar } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { pulse } from '../pulse-table.js';
import { PulseBuilder } from '../server/pulse-builder.js';
import { createPulseRegistry } from '../server/pulse-registry.js';
import type { PulseQueryConfig, PulseQueryContext } from '../server/pulse-types.js';

const testSchema = pgSchema('test');

const testTable = testSchema.table('test_items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  score: integer('score'),
});

function makeEmptyConfig(): PulseQueryConfig<
  typeof testTable,
  Record<string, boolean>,
  Record<never, never>
> {
  const columns = getColumns(testTable);
  return {
    table: {
      source: testTable,
    },
    pkColumn: columns.id,
    columns,
    selectedColumns: columns,
    argsSchema: null,
    queryFn: null,
    transformFn: null,
    order: null,
    limit: null,
  };
}

// PK declared only via table extras (no inline `.primaryKey()`) — the case
// PulseTable.query()'s pure gate can't see, so the registry's defensive
// re-check is exercised via a hand-built config/builder, bypassing pulse-table.ts.
const compositePkTable = testSchema.table(
  'composite_items',
  {
    leftId: integer('left_id').notNull(),
    rightId: integer('right_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.leftId, table.rightId] })],
);

// PK declared via table extras as a SINGLE column — a supported PK: `getPulsePkColumn`
// resolves it from the extras `primaryKey()` declaration, so the table is accepted.
const singleColumnExtrasPkTable = testSchema.table(
  'single_column_extras_items',
  {
    id: integer('id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.id] })],
);

const unsupportedPkTable = testSchema.table('unsupported_items', {
  id: boolean('id').primaryKey(),
  name: text('name').notNull(),
});

const varcharPkTable = testSchema.table('varchar_items', {
  code: varchar('code', { length: 64 }).primaryKey(),
  name: text('name').notNull(),
});

describe('PulseBuilder', () => {
  test('.columns() stores resolved selected columns and returns new instance', () => {
    const builder = new PulseBuilder(makeEmptyConfig());
    const b2 = builder.columns({ name: true, status: true });
    expect(b2).not.toBe(builder);
    expect(Object.keys(b2.config.selectedColumns)).toEqual(['name', 'status']);
    expect(Object.keys(builder.config.selectedColumns)).toEqual(['id', 'name', 'status', 'score']);
  });

  test('.args() stores Zod schema', () => {
    const schema = z.object({ driverId: z.number() });
    const builder = new PulseBuilder(makeEmptyConfig()).args(schema);
    expect(builder.config.argsSchema).toBe(schema);
  });

  test('.transform() stores transform function', () => {
    const transformFn = (rows: Record<string, unknown>[]) => rows;
    const builder = new PulseBuilder(makeEmptyConfig()).transform(transformFn);
    expect(builder.config.transformFn).toBe(transformFn);
  });

  test('.columns() after .transform() throws loudly instead of silently dropping the transform', () => {
    const transformFn = (rows: Record<string, unknown>[]) => rows;
    const builder = new PulseBuilder(makeEmptyConfig()).transform(transformFn);

    expect(() => builder.columns({ name: true })).toThrow(
      '.columns() cannot follow .transform(); call .columns() before .transform() instead',
    );
  });

  test('.columns() before .transform() still works (correct chain order)', () => {
    const transformFn = (rows: Record<string, unknown>[]) => rows;
    const builder = new PulseBuilder(makeEmptyConfig())
      .columns({ name: true })
      .transform(transformFn);

    expect(builder.config.transformFn).toBe(transformFn);
    expect(Object.keys(builder.config.selectedColumns)).toEqual(['name']);
  });

  test('.order() stores sort direction', () => {
    const builder = new PulseBuilder(makeEmptyConfig()).order('desc');
    expect(builder.config.order).toBe('desc');
  });

  test('.limit() stores row limit', () => {
    const builder = new PulseBuilder(makeEmptyConfig()).limit(10);
    expect(builder.config.limit).toBe(10);
  });

  test('.query() stores queryFn and returns PulseBuilder', () => {
    const queryFn = (_ctx: PulseQueryContext<Record<never, never>, Record<string, unknown>>) =>
      null;
    const builder = new PulseBuilder(makeEmptyConfig());
    const query = builder.query(queryFn);
    expect(query).toBeDefined();
    expect(query).toBeInstanceOf(PulseBuilder);
    expect(query.config).toBeDefined();
    expect(query.config.queryFn).toBe(queryFn);
  });

  test('.query() result has builder fields', () => {
    const query = new PulseBuilder(makeEmptyConfig()).query(() => null);
    expect(query).toHaveProperty('_');
    expect(query).toHaveProperty('config');
  });

  test('chain immutability: each method returns new instance', () => {
    const b0 = new PulseBuilder(makeEmptyConfig());
    const b1 = b0.columns({ name: true });
    const b2 = b1.limit(5);
    expect(b0).not.toBe(b1);
    expect(b1).not.toBe(b2);
    expect(Object.keys(b0.config.selectedColumns)).toEqual(['id', 'name', 'status', 'score']);
    expect(b0.config.limit).toBeNull();
  });

  test('full chain: .columns().args().order().limit().query() produces valid query', () => {
    const schema = z.object({ driverId: z.number() });
    const query = new PulseBuilder(makeEmptyConfig())
      .columns({ name: true, status: true })
      .args(schema)
      .order('desc')
      .limit(5)
      .query((ctx) => ({ driverId: ctx.args.driverId }));
    expect(Object.keys(query.config.selectedColumns)).toEqual(['name', 'status']);
    expect(query.config.argsSchema).toBe(schema);
    expect(query.config.queryFn).toBeDefined();
    expect(query.config.order).toBe('desc');
    expect(query.config.limit).toBe(5);
  });

  test('query callback can use ctx.query(...) with args', () => {
    const schema = z.object({ status: z.string() });
    const query = new PulseBuilder(makeEmptyConfig())
      .columns({ name: true })
      .args(schema)
      .query((ctx) => ctx.query({ status: ctx.args.status }));
    expect(Object.keys(query.config.selectedColumns)).toEqual(['name']);
    expect(query.config.argsSchema).toBe(schema);
    expect(query.config.queryFn).toBeDefined();
  });

  test('config is exposed on the builder', () => {
    const builder = new PulseBuilder(makeEmptyConfig());
    expect(builder.config).toEqual(makeEmptyConfig());
  });
});

describe('pulse(table) — collection-first construction', () => {
  test('pulse(table).query() returns PulseBuilder', () => {
    const builder = pulse(testTable).query();
    expect(builder).toBeInstanceOf(PulseBuilder);
    expect(getTableUniqueName(builder.config.table.source)).toBe('test.test_items');
  });

  test('pulse(table).query() creates builder with full selected columns and null optional fields', () => {
    const builder = pulse(testTable).query();
    const config = builder.config;
    expect(Object.keys(config.selectedColumns)).toEqual(['id', 'name', 'status', 'score']);
    expect(config.argsSchema).toBeNull();
    expect(config.queryFn).toBeNull();
    expect(config.transformFn).toBeNull();
    expect(config.order).toBeNull();
    expect(config.limit).toBeNull();
  });

  test('builder chain from pulse(table).query() produces valid query', () => {
    const query = pulse(testTable)
      .query()
      .columns({ name: true, status: true })
      .args(z.object({ status: z.string() }))
      .query((ctx) => ctx.query({ status: ctx.args.status }));
    expect(Object.keys(query.config.selectedColumns)).toEqual(['name', 'status']);
    expect(query.config.queryFn).toBeDefined();
  });

  test('pulse(table).query(fn) seeds queryFn directly (collection-level spelling)', () => {
    const query = pulse(testTable).query((ctx) => ctx.query({ status: ctx.args.status }));
    expect(query).toBeInstanceOf(PulseBuilder);
    expect(query.config.queryFn).toBeDefined();
  });

  test('pulse(table).query() rejects a table with a composite (multi-column) primary key', () => {
    expect(() => pulse(compositePkTable).query()).toThrowError('has multiple primary keys');
  });

  test('pulse(table).query() accepts a single-column table-extras primary key', () => {
    expect(() => pulse(singleColumnExtrasPkTable).query()).not.toThrow();
  });

  test('pulse(table).query() rejects unsupported default PK SQL types', () => {
    expect(() => pulse(unsupportedPkTable).query()).toThrowError('unsupported SQL type');
  });

  test('pulse(table).query() accepts PK types with length modifiers', () => {
    expect(() => pulse(varcharPkTable).query()).not.toThrow();
  });
});

describe('createPulseRegistry — derived-queries-only contract', () => {
  test('rejects a table whose true PK is a composite primaryKey() declared in table extras', () => {
    const columns = getColumns(compositePkTable);
    const config: PulseQueryConfig<
      typeof compositePkTable,
      Record<string, boolean>,
      Record<never, never>
    > = {
      table: { source: compositePkTable },
      pkColumn: columns.leftId,
      columns,
      selectedColumns: columns,
      argsSchema: null,
      queryFn: null,
      transformFn: null,
      order: null,
      limit: null,
    };
    const builder = new PulseBuilder(config);

    expect(() => createPulseRegistry({ compositeQuery: builder })).toThrowError(
      'has multiple primary keys',
    );
  });

  test('accepts a table whose PK is a single-column primaryKey() declared in table extras', () => {
    const columns = getColumns(singleColumnExtrasPkTable);
    const config: PulseQueryConfig<
      typeof singleColumnExtrasPkTable,
      Record<string, boolean>,
      Record<never, never>
    > = {
      table: { source: singleColumnExtrasPkTable },
      pkColumn: columns.id,
      columns,
      selectedColumns: columns,
      argsSchema: null,
      queryFn: null,
      transformFn: null,
      order: null,
      limit: null,
    };
    const builder = new PulseBuilder(config);

    // Exactly one distinct PK column resolved from the extras declaration → supported.
    expect(() => createPulseRegistry({ singleColumnExtrasQuery: builder })).not.toThrow();
  });

  test('a valid derived-queries registry builds and resolve() output carries no eventsTable field', () => {
    const registry = createPulseRegistry({ allOrders: pulse(testTable).query() });

    const query = registry.resolve('allOrders', undefined, { userId: null });

    expect(query.where).toBeNull();
    expect(query).not.toHaveProperty('eventsTable');
    expect(Object.keys(query.selectedColumns)).toEqual(
      expect.arrayContaining(['id', 'name', 'status', 'score']),
    );
    expect(Object.keys(query.selectedColumns).length).toBe(4);
    expect(query.order).toBe('asc');
  });

  test('resolve() substitutes an empty object for args on a schemaless query — client-supplied operator payloads never reach queryFn', () => {
    // Collection-level spelling: no `.args()` is ever chained, matching the pattern
    // pulse-table.ts's doc-comment describes and the one flagged as unsafe.
    const registry = createPulseRegistry({
      ordersByTenant: pulse(testTable).query((ctx) => ctx.query({ status: ctx.args.status })),
    });

    // Attacker-controlled JSON straight off an HTTP body, shaped as an operator
    // object rather than a plain value — pre-fix this reached `ctx.args` verbatim and
    // widened the filter (`{ status: { isNotNull: true } }` matches every row).
    const maliciousRawArgs = { status: { isNotNull: true } };
    const query = registry.resolve('ordersByTenant', maliciousRawArgs, { userId: null });

    // The queryFn read `ctx.args.status`, which must be undefined (args resolved to
    // `{}`), so the resulting where clause carries no filter value at all — never the
    // attacker's operator object.
    expect(query.where).toEqual({ status: undefined });
  });

  test('resolve() still validates and forwards args when .args(schema) is chained', () => {
    const registry = createPulseRegistry({
      ordersByStatus: pulse(testTable)
        .query()
        .args(z.object({ status: z.string() }))
        .query((ctx) => ctx.query({ status: ctx.args.status })),
    });

    const query = registry.resolve('ordersByStatus', { status: 'active' }, { userId: null });
    expect(query.where).toEqual({ status: 'active' });

    expect(() =>
      registry.resolve('ordersByStatus', { status: { isNotNull: true } }, { userId: null }),
    ).toThrow();
  });
});
