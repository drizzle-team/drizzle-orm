import initSqlJs from 'sql.js';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { eq, relations, sql } from '~/index';
import { drizzle, type SQLJsDatabase } from '~/sql-js';
import { alias, customType, getViewConfig, integer, sqliteTable as table, sqliteView as view } from '~/sqlite-core';
import { drizzle as proxyDrizzle } from '~/sqlite-proxy';

describe('sqlite custom type SELECT transformation', () => {
	const custom = customType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		toDriver: (value) => `stored:${value}`,
		selectFromDb: (column) => sql`'selected:' || ${column}`,
		fromDriver: (value) => `${value}:decoded`,
	});
	const values = table('custom_values', {
		id: integer().primaryKey(),
		customValue: custom('custom_value').notNull(),
		nullableValue: custom('nullable_value'),
	});
	const children = table('custom_children', {
		id: integer().primaryKey(),
		parentId: integer('parent_id').notNull(),
		customValue: custom('custom_value').notNull(),
	});
	const valuesRelations = relations(values, ({ many }) => ({ children: many(children) }));
	const childrenRelations = relations(children, ({ one }) => ({
		parent: one(values, { fields: [children.parentId], references: [values.id] }),
	}));
	const schema = { values, children, valuesRelations, childrenRelations };
	let client: initSqlJs.Database;
	let db: SQLJsDatabase<typeof schema>;
	const expected = [{ id: 1, customValue: 'selected:stored:original:decoded', nullableValue: null }];
	beforeAll(async () => {
		const engine = await initSqlJs();
		client = new engine.Database();
		db = drizzle(client, { schema, casing: 'snake_case' });
		db.run(sql`create table custom_values (id integer primary key, custom_value text not null, nullable_value text)`);
		db.run(
			sql`create table custom_children (id integer primary key, parent_id integer not null, custom_value text not null)`,
		);
	});
	afterAll(async () => {
		client.close();
	});
	beforeEach(async () => {
		db.delete(children).run();
		db.delete(values).run();
		db.insert(values).values({ id: 1, customValue: 'original' }).run();
		db.insert(children).values({ id: 1, parentId: 1, customValue: 'child' }).run();
	});

	test('transforms selected columns and decodes once, including nulls', async () => {
		expect(db.select().from(values).all()).toEqual(expected);
		expect(db.select({ value: values.customValue }).from(values).all()).toEqual([
			{ value: expected[0]!.customValue },
		]);
	});

	test('preserves physical table aliases and left join nullability', async () => {
		const other = alias(values, 'other');
		expect(db.select().from(other).all()).toEqual(expected);
		expect(
			db.select({ value: values.customValue, other: { value: other.customValue } })
				.from(values).leftJoin(other, eq(other.id, 99)).all(),
		).toEqual([
			{ value: expected[0]!.customValue, other: null },
		]);
	});

	test('does not transform subquery output again, including nested object selections', async () => {
		const first = db.select({ nested: { value: values.customValue } }).from(values).as('first');
		const second = db.select().from(first).as('second');
		expect(db.select().from(second).all()).toEqual([{ nested: { value: expected[0]!.customValue } }]);
	});

	test('does not transform CTE output again', async () => {
		const first = db.$with('first').as(db.select().from(values));
		const second = db.$with('second').as(db.select().from(first));
		expect(db.with(first, second).select().from(second).all()).toEqual(expected);
	});

	test('transforms raw SQL CTE columns described by an explicit schema', async () => {
		const raw = db.$with('raw', { customValue: values.customValue })
			.as(sql`select custom_value from custom_values`);
		expect(db.with(raw).select().from(raw).all()).toEqual([{ customValue: expected[0]!.customValue }]);
	});

	test('preserves a query-built view and transforms a manually declared view', async () => {
		const built = view('custom_built_view').as(db.select().from(values));
		const manual = view('custom_manual_view', { customValue: custom('custom_value').notNull() }).existing();
		db.run(sql`create view custom_built_view as ${getViewConfig(built).query}`);
		db.run(sql`create view custom_manual_view as select custom_value from custom_values`);
		try {
			expect(db.select().from(built).all()).toEqual(expected);
			expect(db.select().from(manual).all()).toEqual([{ customValue: expected[0]!.customValue }]);
		} finally {
			db.run(sql`drop view custom_built_view`);
			db.run(sql`drop view custom_manual_view`);
		}
	});

	test('keeps writes, predicates, ordering and explicit SQL expressions raw', async () => {
		expect(
			db.select().from(values).where(eq(values.customValue, 'original'))
				.orderBy(values.customValue).all(),
		).toEqual(expected);
		expect(db.select({ raw: sql<string>`${values.customValue}` }).from(values).all()).toEqual([
			{ raw: 'stored:original' },
		]);
		const query = db.select().from(values).where(eq(values.customValue, 'original'))
			.groupBy(values.id, values.customValue, values.nullableValue).orderBy(values.customValue).toSQL();
		expect(query.sql.split('where')[1]).not.toContain('selected:');
		expect(query.params).toEqual(['stored:original']);
	});

	test('transforms INSERT, UPDATE and DELETE returning projections', async () => {
		expect(db.insert(values).values({ id: 2, customValue: 'inserted' }).returning({ value: values.customValue }).all())
			.toEqual([{ value: 'selected:stored:inserted:decoded' }]);
		expect(
			db.update(values).set({ customValue: 'updated' }).where(eq(values.id, 2))
				.returning({ value: values.customValue }).all(),
		).toEqual([{ value: 'selected:stored:updated:decoded' }]);
		expect(db.delete(values).where(eq(values.id, 2)).returning({ value: values.customValue }).all())
			.toEqual([{ value: 'selected:stored:updated:decoded' }]);
	});

	test('transforms relational JSON fields with nested limits once', async () => {
		// Exercise relational decoding through the proxy driver using the same real SQLite database.
		const relationalDb = proxyDrizzle(async (query, params, method) => {
			const statement = client.prepare(query);
			try {
				statement.bind(params);
				const rows = [];
				while (statement.step()) rows.push(statement.get());
				return { rows: method === 'get' ? rows[0] ?? [] : rows };
			} finally {
				statement.free();
			}
		}, { schema });
		expect(
			await relationalDb.query.values.findMany({
				with: { children: { limit: 1, orderBy: (child, { asc }) => [asc(child.id)], with: { parent: true } } },
			}),
		).toEqual([{
			...expected[0],
			children: [{ id: 1, parentId: 1, customValue: 'selected:stored:child:decoded', parent: expected[0] }],
		}]);
	});

	test('does not reapply transformations to a UNION projected through a subquery', async () => {
		const union = db.select().from(values).unionAll(db.select().from(values)).as('combined');
		expect(db.select().from(union).all()).toEqual([...expected, ...expected]);
	});
});
