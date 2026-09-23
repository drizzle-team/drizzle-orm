import { expect, test } from 'vitest';
import { PgDialect } from '~/pg-core';
import { sql } from '~/sql/sql';

test('mergeQueries: large param count should not cause RangeError', () => {
	// Reproduces drizzle-team/drizzle-orm#5994
	// When a nested SQL chunk accumulates >120k params, the outer mergeQueries
	// call does result.params.push(...query.params) which exceeds V8's
	// Function.prototype.apply argument limit and throws RangeError.
	const paramCount = 200_000;
	const params = Array.from({ length: paramCount }, (_, i) => i);

	// Build a nested SQL: inner SQL has all params, outer SQL wraps it
	const innerSql = sql`(${sql.join(params.map((p) => sql`${p}`), sql`, `)})`;
	const outerSql = sql`INSERT INTO t VALUES ${innerSql}`;

	// This should not throw RangeError: Maximum call stack size exceeded
	const query = new PgDialect().sqlToQuery(outerSql);

	expect(query.params.length).toBe(paramCount);
});
