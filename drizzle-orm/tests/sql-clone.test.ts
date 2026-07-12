import { describe, test } from 'vitest';
import { sql, SQL } from '~/index.ts';
import { pgTable, serial, text } from '~/pg-core/index.ts';

const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	role: text('role'),
});

describe.concurrent('SQL.clone()', () => {
	test('basic cloning creates independent copy', ({ expect }) => {
		const baseQuery = sql`SELECT * FROM users`;
		const cloned = baseQuery.clone();

		// Clone should have same initial content
		expect(cloned).not.toBe(baseQuery);
		expect(cloned.queryChunks.length).toBe(baseQuery.queryChunks.length);

		// Mutating clone should not affect original
		cloned.append(sql` WHERE active = true`);
		expect(cloned.queryChunks.length).toBeGreaterThan(baseQuery.queryChunks.length);
	});

	test('clone preserves decoder', ({ expect }) => {
		const decoder = { mapFromDriverValue: (val: string) => val.toUpperCase() };
		const original = sql`SELECT name`.mapWith(decoder);
		const cloned = original.clone();

		expect(cloned.decoder).toBe(decoder);
	});

	test('clone preserves shouldInlineParams', ({ expect }) => {
		const original = sql`SELECT * FROM users`.inlineParams();
		const cloned = original.clone();

		// Both should generate same query with inlined params
		const param = 'test';
		const originalQuery = original.append(sql` WHERE name = ${param}`);
		const clonedQuery = cloned.append(sql` WHERE name = ${param}`);

		expect((clonedQuery as any).shouldInlineParams).toBe((originalQuery as any).shouldInlineParams);
	});

	test('clone preserves usedTables', ({ expect }) => {
		const original = sql`SELECT * FROM ${usersTable}`;
		const cloned = original.clone();

		expect(cloned.usedTables).toEqual(original.usedTables);
		expect(cloned.usedTables).not.toBe(original.usedTables); // Different array instance
	});

	test('clone with nested SQL expressions', ({ expect }) => {
		const subQuery = sql`SELECT id FROM users`;
		const original = sql`SELECT * FROM (${subQuery}) AS sub`;
		const cloned = original.clone();

		// Verify independence by mutating nested query in clone
		cloned.append(sql` WHERE sub.id > 100`);

		expect(cloned.queryChunks.length).toBeGreaterThan(original.queryChunks.length);
	});

	test('multiple clones are independent', ({ expect }) => {
		const base = sql`SELECT * FROM users`;
		const clone1 = base.clone().append(sql` WHERE active = true`);
		const clone2 = base.clone().append(sql` WHERE role = 'admin'`);

		// All three should be different
		expect(base.queryChunks.length).toBeLessThan(clone1.queryChunks.length);
		expect(base.queryChunks.length).toBeLessThan(clone2.queryChunks.length);
		expect(clone1.queryChunks.length).toBe(clone2.queryChunks.length);

		// But original should remain unchanged
		expect(base.queryChunks.length).toBe(1);
	});

	test('clone with columns', ({ expect }) => {
		const original = sql`${usersTable.name}`;
		const cloned = original.clone();

		expect(cloned.queryChunks.length).toBe(original.queryChunks.length);
		expect(cloned.queryChunks[0]).toBe(original.queryChunks[0]); // Column reference can be shared
	});

	test('clone with sql.join', ({ expect }) => {
		const parts = [
			sql`SELECT id`,
			sql`SELECT name`,
			sql`SELECT email`,
		];
		const original = sql.join(parts, sql`, `);
		const cloned = original.clone();

		// Modify clone
		cloned.append(sql` FROM users`);

		expect(cloned.queryChunks.length).toBeGreaterThan(original.queryChunks.length);
	});

	test('clone with params', ({ expect }) => {
		const userId = 123;
		const original = sql`SELECT * FROM users WHERE id = ${userId}`;
		const cloned = original.clone();

		expect(cloned.queryChunks.length).toBe(original.queryChunks.length);

		// Params can be shared since they're immutable
		expect(cloned.queryChunks[2]).toBe(original.queryChunks[2]);
	});

	test('deep clone with nested SQL in arrays', ({ expect }) => {
		const ids = [
			sql`1`,
			sql`2`,
			sql`3`,
		];
		const original = sql`SELECT * FROM users WHERE id IN ${ids}`;
		const cloned = original.clone();

		// Verify arrays are cloned
		const originalArray = original.queryChunks.find(chunk => Array.isArray(chunk));
		const clonedArray = cloned.queryChunks.find(chunk => Array.isArray(chunk));

		expect(originalArray).toBeDefined();
		expect(clonedArray).toBeDefined();
		expect(originalArray).not.toBe(clonedArray); // Different array instances
	});

	test('clone can be used for dynamic query building', ({ expect }) => {
		// Simulates the drizzle-cube use case
		const dimensionSql = usersTable.id;

		// Using the same dimension in multiple contexts
		const selectQuery = sql`SELECT ${dimensionSql.getSQL().clone()}`.append(sql` FROM users`);
		const whereQuery = sql`WHERE ${dimensionSql.getSQL().clone()}`.append(sql` > 100`);
		const groupByQuery = sql`GROUP BY ${dimensionSql.getSQL().clone()}`;

		// All should be independent
		expect(selectQuery.queryChunks.length).toBeGreaterThan(0);
		expect(whereQuery.queryChunks.length).toBeGreaterThan(0);
		expect(groupByQuery.queryChunks.length).toBeGreaterThan(0);
	});

	test('clone with SQL.Aliased', ({ expect }) => {
		const original = sql`SELECT name`.as('user_name');
		const cloned = original.clone();

		expect(cloned).not.toBe(original);
		expect(cloned.fieldAlias).toBe(original.fieldAlias);
	});

	test('chaining clone and append', ({ expect }) => {
		const base = sql`SELECT * FROM users`;

		// Verify method chaining works
		const result = base.clone().append(sql` WHERE active = true`).append(sql` LIMIT 10`);

		expect(result.queryChunks.length).toBeGreaterThan(base.queryChunks.length);
		expect(base.queryChunks.length).toBe(1); // Original unchanged
	});
});
