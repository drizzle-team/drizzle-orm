import { sql } from 'drizzle-orm';
import { check, index, pgSchema, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { describe, expect, test } from 'vitest';
import { conflictsFromSchema } from './mocks';

describe('conflict rule coverage (statement pairs)', () => {
	test('column: create vs drop (same-resource-different-op)', async () => {
		const parent = {
			t: pgTable('t', (t) => ({
				c: t.varchar(),
			})),
		};

		const child1 = {
			t: pgTable('t', (t) => ({
				c: t.varchar(),
				d: t.varchar(),
			})),
		};

		const child2 = {
			t: pgTable('t', (t) => ({})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).toBeUndefined();
	});

	test('column: alter vs alter (same-resource-same-op)', async () => {
		const parent = {
			t: pgTable('t', (t) => ({
				c: t.varchar(),
			})),
		};

		const child1 = {
			t: pgTable('t', (t) => ({
				c: t.varchar().notNull(),
			})),
		};

		const child2 = {
			t: pgTable('t', (t) => ({
				c: t.integer(),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test('table drop vs child index', async () => {
		const parent = {
			t: pgTable('t', (t) => ({
				c: t.varchar(),
			})),
		};

		const child1 = {};

		const child2 = {
			t: pgTable('t', (t) => ({
				c: t.varchar(),
			}), (table) => [index().on(table.c)]),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test('table drop vs new column on same table', async () => {
		const parent = {
			t: pgTable('t', (t) => ({
				c: t.varchar(),
			})),
		};

		const child1 = {};

		const child2 = {
			t: pgTable('t', (t) => ({
				c: t.varchar(),
				d: t.varchar(),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test('index: create vs create on different tables is commutative', async () => {
		const parent = {
			orders: pgTable('orders', (t) => ({
				customerId: t.varchar(),
			})),
			invoices: pgTable('invoices', (t) => ({
				accountId: t.varchar(),
			})),
		};

		const child1 = {
			orders: pgTable('orders', (t) => ({
				customerId: t.varchar(),
			}), (table) => [index().on(table.customerId)]),
			invoices: pgTable('invoices', (t) => ({
				accountId: t.varchar(),
			})),
		};

		const child2 = {
			orders: pgTable('orders', (t) => ({
				customerId: t.varchar(),
			})),
			invoices: pgTable('invoices', (t) => ({
				accountId: t.varchar(),
			}), (table) => [index().on(table.accountId)]),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).toBeUndefined();
	});

	test('pk: alter vs drop', async () => {
		const parent = {
			t: pgTable('t', (t) => ({
				id: t.integer().primaryKey(),
				c: t.varchar(),
			})),
		};

		const child1 = {
			t: pgTable('t', (t) => ({
				id: t.integer(),
				c: t.varchar(),
			}), (table) => [primaryKey({ columns: [table.id, table.c] })]),
		};

		const child2 = {
			t: pgTable('t', (t) => ({
				id: t.integer(),
				c: t.varchar(),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test('unique: create vs drop', async () => {
		const parent = {
			t: pgTable('t', (t) => ({
				c: t.varchar().unique(),
			})),
		};

		const child1 = {
			t: pgTable('t', (t) => ({
				c: t.varchar().unique(),
				d: t.varchar().unique(),
			})),
		};

		const child2 = {
			t: pgTable('t', (t) => ({
				c: t.varchar(),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test('fk: recreate vs drop', async () => {
		const p = pgTable('p', (t) => ({
			id: t.integer().primaryKey(),
		}));

		const parent = {
			p,
			t: pgTable('t', (t) => ({
				id: t.integer().primaryKey(),
				pId: t.integer().references(() => p.id),
			})),
		};

		const child1 = {
			p,
			t: pgTable('t', (t) => ({
				id: t.integer().primaryKey(),
				pId: t.integer().references(() => p.id, { onDelete: 'cascade' }),
			})),
		};

		const child2 = {
			p,
			t: pgTable('t', (t) => ({
				id: t.integer().primaryKey(),
				pId: t.integer(),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test('check: alter vs drop', async () => {
		const parent = {
			t: pgTable('t', (t) => ({
				c: t.integer(),
			}), (table) => [check('chk', sql`${table.c} > 0`)]),
		};

		const child1 = {
			t: pgTable('t', (t) => ({
				c: t.integer(),
			}), (table) => [check('chk', sql`${table.c} > 5`)]),
		};

		const child2 = {
			t: pgTable('t', (t) => ({
				c: t.integer(),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test('schema drop vs new table in same schema', async () => {
		const app = pgSchema('app');

		const parent = {
			app,
			users: app.table('users', (t) => ({
				id: t.integer(),
			})),
		};

		const child1 = {};

		const child2 = {
			app,
			users: app.table('users', (t) => ({
				id: t.integer(),
			})),
			profiles: app.table('profiles', (t) => ({
				id: t.integer(),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test('schema drop vs new enum in same schema', async () => {
		const app = pgSchema('app');

		const parent = {
			app,
			users: app.table('users', (t) => ({
				id: t.integer(),
			})),
		};

		const child1 = {};

		const child2 = {
			app,
			users: app.table('users', (t) => ({
				id: t.integer(),
			})),
			status: app.enum('status', ['pending', 'done']),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test('schema drop vs new table in different schema is commutative', async () => {
		const app = pgSchema('app');
		const analytics = pgSchema('analytics');

		const parent = {
			app,
			users: app.table('users', (t) => ({
				id: t.integer(),
			})),
		};

		const child1 = {};

		const child2 = {
			app,
			users: app.table('users', (t) => ({
				id: t.integer(),
			})),
			analytics,
			events: analytics.table('events', (t) => ({
				id: t.integer(),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).toBeUndefined();
	});

	test('explainConflicts returns reason for table drop vs column alter', async () => {
		const parent = {
			c: pgTable('t', (t) => ({
				c: t.varchar(),
			})),
		};

		const child1 = {};
		const child2 = {
			c: pgTable('t', (t) => ({
				c: t.varchar().notNull(),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
		expect(conflicts?.leftStatement.type).toBe('alter_column');
		expect(conflicts?.rightStatement.type).toBe('drop_table');
	});
});
