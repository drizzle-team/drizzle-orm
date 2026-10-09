import { describe, expect, test } from 'vitest';
import { eq, sql } from '~/index';
import { drizzle } from '~/singlestore';
import { alias, customType, int, singlestoreTable as table } from '~/singlestore-core';

describe('SingleStore custom type SELECT SQL', () => {
	const custom = customType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		selectFromDb: (column) => sql`lower(${column})`,
		fromDriver: (value) => value.toUpperCase(),
	});
	const values = table('custom_values', { id: int().primaryKey(), customValue: custom().notNull() });
	const db = drizzle.mock({ casing: 'snake_case' });
	const countTransforms = (query: { sql: string }) => query.sql.match(/lower\(/g)?.length ?? 0;

	test('uses cased identifiers and aliases transformed projections', () => {
		expect(db.select({ value: values.customValue }).from(values).toSQL().sql).toBe(
			'select lower(`custom_value`) as `custom_value` from `custom_values`',
		);
		const other = alias(values, 'other');
		const query = db.select({ value: values.customValue, other: other.customValue })
			.from(values).leftJoin(other, eq(values.id, other.id)).where(eq(values.customValue, 'Raw')).toSQL();
		expect(query.sql).toContain('lower(`custom_values`.`custom_value`)');
		expect(query.sql).toContain('lower(`other`.`custom_value`)');
		expect(countTransforms(query)).toBe(2);
		expect(query.sql.split('where')[1]).not.toContain('lower(');
		expect(query.params).toEqual(['Raw']);
	});

	test('transforms once across subqueries and CTEs', () => {
		const inner = db.select().from(values).as('inner');
		const outer = db.select().from(inner).as('outer');
		expect(countTransforms(db.select().from(outer).toSQL())).toBe(1);
		const cte = db.$with('cte').as(db.select().from(values));
		expect(countTransforms(db.with(cte).select().from(cte).toSQL())).toBe(1);
	});
});
