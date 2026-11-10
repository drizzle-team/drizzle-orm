import { describe, expect, test } from 'bun:test';
import { getColumns } from 'drizzle-orm';
import { integer, PgDialect, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { buildWhereClausePredicate } from '../server/drizzle-utils.js';
import type { WhereClause } from '../types.js';

const ordersTable = pgTable('orders', {
  id: serial('id').primaryKey(),
  status: text('status').notNull(),
  price: integer('price'),
  driverId: integer('driver_id'),
});

const columns = getColumns(ordersTable);
const dialect = new PgDialect();

const allowedColumnNames = new Set(['id', 'status', 'price', 'driverId']);

function compileWhere(where: WhereClause): { sql: string; params: unknown[] } {
  const predicate = buildWhereClausePredicate(where, columns, allowedColumnNames);
  if (!predicate) {
    return { sql: '', params: [] };
  }

  const compiled = dialect.sqlToQuery(predicate);
  return { sql: compiled.sql, params: compiled.params };
}

// Embedded and HTTP now share one pull pipeline, so operator semantics have a
// single implementation; the exact-SQL-string cases below are a smoke check for
// the compiler, not the source of truth for operator semantics.
describe('pulse-sql equivalence-sensitive behavior', () => {
  test('selected-column allowlist rejects filters on excluded columns', () => {
    const selectedColumnNames = new Set(['id', 'status']);

    expect(() =>
      buildWhereClausePredicate({ price: { gte: 10 } }, columns, selectedColumnNames),
    ).toThrow('Unsupported column: price');
  });

  test('numeric equality treats numeric strings like SQL comparison', () => {
    const where: WhereClause = { price: 12.5 };
    const { sql, params } = compileWhere(where);

    expect(sql).toBe('"orders"."price" = $1');
    expect(params).toEqual([12.5]);
  });

  test('gte/lte, in, and isNull operators compile together', () => {
    const where: WhereClause = {
      price: { gte: 10, lte: 50 },
      status: { in: ['requested', 'accepted'] },
      driverId: { isNull: true },
    };
    const { sql, params } = compileWhere(where);

    expect(sql).toBe(
      '(((("orders"."price" >= $1) and ("orders"."price" <= $2))) and ("orders"."status" in ($3, $4)) and (("orders"."driver_id" is null)))',
    );
    expect(params).toEqual([10, 50, 'requested', 'accepted']);
  });

  test('empty in arrays compile to false predicate', () => {
    const where: WhereClause = { id: { in: [] } };
    const { sql, params } = compileWhere(where);

    expect(sql).toBe('false');
    expect(params).toEqual([]);
  });

  test('null and undefined where clauses compile to no predicate', () => {
    expect(buildWhereClausePredicate(null, columns, allowedColumnNames)).toBeUndefined();
    expect(buildWhereClausePredicate(undefined, columns, allowedColumnNames)).toBeUndefined();
  });

  test('empty logical arrays compile to no predicate', () => {
    expect(buildWhereClausePredicate({ AND: [] }, columns, allowedColumnNames)).toBeUndefined();
    expect(buildWhereClausePredicate({ OR: [] }, columns, allowedColumnNames)).toBeUndefined();
  });

  test('invalid logical node shapes are rejected consistently', () => {
    expect(() =>
      // @ts-expect-error
      buildWhereClausePredicate({ AND: {} }, columns, allowedColumnNames),
    ).toThrow('Invalid where condition: AND must be an array');
    expect(() =>
      // @ts-expect-error
      buildWhereClausePredicate({ OR: {} }, columns, allowedColumnNames),
    ).toThrow('Invalid where condition: OR must be an array');
    expect(() =>
      buildWhereClausePredicate(
        // @ts-expect-error
        { NOT: [{ status: 'requested' }] },
        columns,
        allowedColumnNames,
      ),
    ).toThrow('Invalid where condition: NOT must be an object');
    expect(() =>
      buildWhereClausePredicate(
        // @ts-expect-error
        { status: 'requested', AND: [{ id: 1 }] },
        columns,
        allowedColumnNames,
      ),
    ).toThrow('Invalid where condition: logical node cannot include column filters');
    expect(() =>
      buildWhereClausePredicate(
        // @ts-expect-error
        { AND: [{ id: 1 }], OR: [{ id: 2 }] },
        columns,
        allowedColumnNames,
      ),
    ).toThrow('Invalid where condition: AND/OR/NOT are mutually exclusive per level');
  });

  test('unsupported columns are rejected consistently', () => {
    const where: WhereClause = { secret: 'nope' };

    expect(() => buildWhereClausePredicate(where, columns, allowedColumnNames)).toThrow(
      'Unsupported column: secret',
    );
  });
});
