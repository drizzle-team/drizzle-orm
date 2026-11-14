import { describe, expect, test } from 'vitest';
import { drizzle } from '~/gel';
import { alias, customType, gelTable as table, integer } from '~/gel-core';
import { eq, relations, sql } from '~/index';

describe('Gel custom type SELECT SQL', () => {
	const custom = customType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		selectFromDb: (column) => sql`lower(${column})`,
		fromDriver: (value) => value.toUpperCase(),
	});
	const values = table('custom_values', { id: integer().primaryKey(), customValue: custom().notNull() });
	const children = table('custom_children', { parentId: integer(), customValue: custom() });
	const valuesRelations = relations(values, ({ many }) => ({ children: many(children) }));
	const childrenRelations = relations(children, ({ one }) => ({
		parent: one(values, { fields: [children.parentId], references: [values.id] }),
	}));
	const schema = { values, children, valuesRelations, childrenRelations };
	const db = drizzle.mock({ schema, casing: 'snake_case' });
	const countTransforms = (query: { sql: string }) => query.sql.match(/lower\(/g)?.length ?? 0;

	test('uses cased identifiers and aliases transformed projections', () => {
		expect(db.select({ value: values.customValue }).from(values).toSQL().sql).toBe(
			'select lower("custom_values"."custom_value") as "custom_value" from "custom_values"',
		);
		const other = alias(values, 'other');
		const query = db.select({ value: values.customValue, other: other.customValue })
			.from(values).leftJoin(other, eq(values.id, other.id)).where(eq(values.customValue, 'Raw')).toSQL();
		expect(query.sql).toContain('lower("custom_values"."custom_value")');
		expect(query.sql).toContain('lower("other"."custom_value")');
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

	test('transforms relational JSON projections, leaving predicates unchanged', () => {
		const query = db.query.values.findMany({
			where: eq(values.customValue, 'Raw'),
			with: { children: { limit: 1 } },
		}).toSQL();
		expect(countTransforms(query)).toBe(2);
		expect(query.params).toContain('Raw');
	});
});
