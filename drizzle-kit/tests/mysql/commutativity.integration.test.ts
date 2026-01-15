import { sql } from 'drizzle-orm';
import { check, index, mysqlTable, primaryKey, unique } from 'drizzle-orm/mysql-core';
import { describe, expect, test } from 'vitest';
import { conflictsFromSchema } from './mocks';

describe('conflict rule coverage (statement pairs)', () => {
	test('column: create vs drop (same-resource-different-op)', async () => {
		const parent = {
			t: mysqlTable('t', (t) => ({
				c: t.varchar({ length: 255 }),
			})),
		};

		const child1 = {
			t: mysqlTable('t', (t) => ({
				c: t.varchar({ length: 255 }),
				d: t.varchar({ length: 255 }),
			})),
		};

		const child2 = {
			t: mysqlTable('t', (t) => ({})),
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
			t: mysqlTable('t', (t) => ({
				c: t.varchar({ length: 255 }),
			})),
		};

		const child1 = {
			t: mysqlTable('t', (t) => ({
				c: t.varchar({ length: 255 }).notNull(),
			})),
		};

		const child2 = {
			t: mysqlTable('t', (t) => ({
				c: t.int(),
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
			t: mysqlTable('t', (t) => ({
				c: t.varchar({ length: 255 }),
			})),
		};

		const child1 = {};

		const child2 = {
			t: mysqlTable('t', (t) => ({
				c: t.varchar({ length: 255 }),
			}), (table) => [index('test_idx').on(table.c)]),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test('pk: alter vs drop', async () => {
		const parent = {
			t: mysqlTable('t', (t) => ({
				id: t.int().primaryKey(),
				c: t.varchar({ length: 255 }),
			})),
		};

		const child1 = {
			t: mysqlTable('t', (t) => ({
				id: t.int(),
				c: t.varchar({ length: 255 }),
			}), (table) => [primaryKey({ columns: [table.id, table.c] })]),
		};

		const child2 = {
			t: mysqlTable('t', (t) => ({
				id: t.int(),
				c: t.varchar({ length: 255 }),
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
			t: mysqlTable('t', (t) => ({
				c: t.varchar({ length: 255 }).unique(),
			})),
		};

		const child1 = {
			t: mysqlTable('t', (t) => ({
				c: t.varchar({ length: 255 }).unique(),
				d: t.varchar({ length: 255 }).unique(),
			})),
		};

		const child2 = {
			t: mysqlTable('t', (t) => ({
				c: t.varchar({ length: 255 }),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test.skipIf(Date.now() < +new Date('2026-01-20'))('fk: recreate vs drop', async () => {
		const p = mysqlTable('p', (t) => ({
			id: t.int().primaryKey(),
		}));

		const parent = {
			p,
			t: mysqlTable('t', (t) => ({
				id: t.int().primaryKey(),
				pId: t.int().references(() => p.id),
			})),
		};

		const child1 = {
			p,
			t: mysqlTable('t', (t) => ({
				id: t.int().primaryKey(),
				pId: t.int().references(() => p.id, { onDelete: 'cascade' }),
			})),
		};

		const child2 = {
			p,
			t: mysqlTable('t', (t) => ({
				id: t.int().primaryKey(),
				pId: t.int(),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test.skipIf(Date.now() < +new Date('2026-01-20'))('check: alter vs drop', async () => {
		const parent = {
			t: mysqlTable('t', (t) => ({
				c: t.int(),
			}), (table) => [check('chk', sql`${table.c} > 0`)]),
		};

		const child1 = {
			t: mysqlTable('t', (t) => ({
				c: t.int(),
			}), (table) => [check('chk', sql`${table.c} > 5`)]),
		};

		const child2 = {
			t: mysqlTable('t', (t) => ({
				c: t.int(),
			})),
		};

		const conflicts = await conflictsFromSchema({
			parent: { id: '1', schema: parent },
			child1: { id: '2', prevId: '1', schema: child1 },
			child2: { id: '3', prevId: '1', schema: child2 },
		});

		expect(conflicts).not.toBeUndefined();
	});

	test.skipIf(Date.now() < +new Date('2026-01-20'))(
		'explainConflicts returns reason for table drop vs column alter',
		async () => {
			const parent = {
				c: mysqlTable('t', (t) => ({
					c: t.varchar({ length: 255 }),
				})),
			};

			const child1 = {};
			const child2 = {
				c: mysqlTable('t', (t) => ({
					c: t.varchar({ length: 255 }).notNull(),
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
		},
	);
});
