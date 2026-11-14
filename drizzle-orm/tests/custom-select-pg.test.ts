import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { eq, relations, sql } from '~/index';
import { alias, customType, getViewConfig, integer, pgTable as table, pgView as view } from '~/pg-core';
import { drizzle } from '~/pglite';

describe('pg custom type SELECT transformation', () => {
	const custom = customType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		toDriver: (value) => `stored:${value}`,
		selectFromDb: (column) => sql`'selected:' || ${column}`,
		fromDriver: (value) => `${value}:decoded`,
	});
	const values = table('custom_values', {
		id: integer().primaryKey(),
		customValue: custom().notNull(),
		nullableValue: custom(),
	});
	const children = table('custom_children', {
		id: integer().primaryKey(),
		parentId: integer().notNull(),
		customValue: custom().notNull(),
	});
	const valuesRelations = relations(values, ({ many }) => ({ children: many(children) }));
	const childrenRelations = relations(children, ({ one }) => ({
		parent: one(values, { fields: [children.parentId], references: [values.id] }),
	}));
	const schema = { values, children, valuesRelations, childrenRelations };
	const client = new PGlite();
	const db = drizzle(client, { schema, casing: 'snake_case' });
	const expected = [{ id: 1, customValue: 'selected:stored:original:decoded', nullableValue: null }];
	beforeAll(async () => {
		await db.execute(
			sql`create table custom_values (id integer primary key, custom_value text not null, nullable_value text)`,
		);
		await db.execute(
			sql`create table custom_children (id integer primary key, parent_id integer not null, custom_value text not null)`,
		);
	});
	afterAll(async () => {
		await client.close();
	});
	beforeEach(async () => {
		await db.delete(children);
		await db.delete(values);
		await db.insert(values).values({ id: 1, customValue: 'original' });
		await db.insert(children).values({ id: 1, parentId: 1, customValue: 'child' });
	});

	test('transforms selected columns and decodes once, including nulls', async () => {
		expect(await db.select().from(values)).toEqual(expected);
		expect(await db.select({ value: values.customValue }).from(values)).toEqual([
			{ value: expected[0]!.customValue },
		]);
	});

	test('preserves physical table aliases and left join nullability', async () => {
		const other = alias(values, 'other');
		expect(await db.select().from(other)).toEqual(expected);
		expect(
			await db.select({ value: values.customValue, other: { value: other.customValue } })
				.from(values).leftJoin(other, eq(other.id, 99)),
		).toEqual([
			{ value: expected[0]!.customValue, other: null },
		]);
	});

	test('does not transform subquery output again, including nested object selections', async () => {
		const first = db.select({ nested: { value: values.customValue } }).from(values).as('first');
		const second = db.select().from(first).as('second');
		expect(await db.select().from(second)).toEqual([{ nested: { value: expected[0]!.customValue } }]);
	});

	test('does not transform CTE output again', async () => {
		const first = db.$with('first').as(db.select().from(values));
		const second = db.$with('second').as(db.select().from(first));
		expect(await db.with(first, second).select().from(second)).toEqual(expected);
	});

	test('preserves transformed values returned by data-modifying CTEs', async () => {
		const inserted = db.$with('inserted').as(
			db.insert(values)
				.values({ id: 2, customValue: 'new' }).returning(),
		);
		expect(await db.with(inserted).select().from(inserted)).toEqual([
			{ id: 2, customValue: 'selected:stored:new:decoded', nullableValue: null },
		]);
		const updated = db.$with('updated').as(
			db.update(values)
				.set({ customValue: 'updated' }).where(eq(values.id, 2)).returning(),
		);
		expect(await db.with(updated).select().from(updated)).toEqual([
			{ id: 2, customValue: 'selected:stored:updated:decoded', nullableValue: null },
		]);
		const deleted = db.$with('deleted').as(db.delete(values).where(eq(values.id, 2)).returning());
		expect(await db.with(deleted).select().from(deleted)).toEqual([
			{ id: 2, customValue: 'selected:stored:updated:decoded', nullableValue: null },
		]);
	});

	test('transforms raw SQL CTE columns described by an explicit schema', async () => {
		const raw = db.$with('raw', { customValue: values.customValue })
			.as(sql`select custom_value from custom_values`);
		expect(await db.with(raw).select().from(raw)).toEqual([{ customValue: expected[0]!.customValue }]);
	});

	test('preserves a query-built view and transforms a manually declared view', async () => {
		const built = view('custom_built_view').as(db.select().from(values));
		const manual = view('custom_manual_view', { customValue: custom('custom_value').notNull() }).existing();
		await db.execute(sql`create view custom_built_view as ${getViewConfig(built).query}`);
		await db.execute(sql`create view custom_manual_view as select custom_value from custom_values`);
		try {
			expect(await db.select().from(built)).toEqual(expected);
			expect(await db.select().from(manual)).toEqual([{ customValue: expected[0]!.customValue }]);
		} finally {
			await db.execute(sql`drop view custom_built_view`);
			await db.execute(sql`drop view custom_manual_view`);
		}
	});

	test('keeps writes, predicates, ordering and explicit SQL expressions raw', async () => {
		expect(
			await db.select().from(values).where(eq(values.customValue, 'original'))
				.orderBy(values.customValue),
		).toEqual(expected);
		expect(await db.select({ raw: sql<string>`${values.customValue}` }).from(values)).toEqual([
			{ raw: 'stored:original' },
		]);
		const query = db.select().from(values).where(eq(values.customValue, 'original'))
			.groupBy(values.id, values.customValue, values.nullableValue).orderBy(values.customValue).toSQL();
		expect(query.sql.split('where')[1]).not.toContain('selected:');
		expect(query.params).toEqual(['stored:original']);
	});

	test('transforms INSERT, UPDATE and DELETE returning projections', async () => {
		expect(await db.insert(values).values({ id: 2, customValue: 'inserted' }).returning({ value: values.customValue }))
			.toEqual([{ value: 'selected:stored:inserted:decoded' }]);
		expect(
			await db.update(values).set({ customValue: 'updated' }).where(eq(values.id, 2))
				.returning({ value: values.customValue }),
		).toEqual([{ value: 'selected:stored:updated:decoded' }]);
		expect(await db.delete(values).where(eq(values.id, 2)).returning({ value: values.customValue }))
			.toEqual([{ value: 'selected:stored:updated:decoded' }]);
	});

	test('transforms relational JSON fields with nested limits once', async () => {
		expect(
			await db.query.values.findMany({
				with: { children: { limit: 1, orderBy: (child, { asc }) => [asc(child.id)], with: { parent: true } } },
			}),
		).toEqual([{
			...expected[0],
			children: [{ id: 1, parentId: 1, customValue: 'selected:stored:child:decoded', parent: expected[0] }],
		}]);
	});

	test('does not reapply transformations to a UNION projected through a subquery', async () => {
		const union = db.select().from(values).unionAll(db.select().from(values)).as('combined');
		expect(await db.select().from(union)).toEqual([...expected, ...expected]);
	});

	test('converts a binary database type to text in SQL before driver decoding', async () => {
		const binary = customType<{ data: string; driverData: string }>({
			dataType: () => 'bytea',
			toDriver: (value) => sql`decode(${Buffer.from(value).toString('base64')}, 'base64')`,
			selectFromDb: (column) => sql`encode(${column}, 'base64')`,
			fromDriver: (value) => Buffer.from(value, 'base64').toString(),
		});
		const files = table('custom_files', { payload: binary().notNull() });
		await db.execute(sql`create table custom_files (payload bytea not null)`);
		try {
			expect(await db.insert(files).values({ payload: 'Hello, 世界' }).returning())
				.toEqual([{ payload: 'Hello, 世界' }]);
			const selected = db.select().from(files).as('selected');
			expect(await db.select().from(selected)).toEqual([{ payload: 'Hello, 世界' }]);
		} finally {
			await db.execute(sql`drop table custom_files`);
		}
	});
});
