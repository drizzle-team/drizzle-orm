import { index, int, sqliteTable, sqliteView, text } from 'drizzle-orm/sqlite-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sqliteCommutativity } from 'src/dialects/sqlite/commutativity';
import type { SqliteSnapshot } from 'src/dialects/sqlite/snapshot';
import { describe, expect, test } from 'vitest';
import { drizzleToDDL, type SqliteSchema } from './mocks';

const ORIGIN = '00000000-0000-0000-0000-000000000000';

function makeSnapshot(
	id: string,
	prevIds: string[],
	schema: SqliteSchema,
): SqliteSnapshot {
	return {
		version: '7',
		dialect: 'sqlite',
		id,
		prevIds,
		ddl: drizzleToDDL(schema).ddl.entities.list(),
		renames: [],
	};
}

function writeSnapshot(dir: string, tag: string, snap: SqliteSnapshot) {
	const folder = join(dir, tag);
	mkdirSync(folder, { recursive: true });
	const path = join(folder, 'snapshot.json');
	writeFileSync(path, JSON.stringify(snap, null, 2));
	return path;
}

function mkTmp(): string {
	return mkdtempSync(join(tmpdir(), 'dk-comm-int-sqlite-'));
}

describe('commutativity (sqlite)', () => {
	test('detects conflict when both branches alter the same column', async () => {
		const parent: SqliteSchema = {
			users: sqliteTable('users', { email: text('email') }),
		};
		const branchA: SqliteSchema = {
			users: sqliteTable('users', { email: text('email').notNull() }),
		};
		const branchB: SqliteSchema = {
			users: sqliteTable('users', { email: int('email') }),
		};

		const tmp = mkTmp();
		const files = [
			writeSnapshot(tmp, '000_parent', makeSnapshot('p1', [ORIGIN], parent)),
			writeSnapshot(tmp, '001_a', makeSnapshot('a1', ['p1'], branchA)),
			writeSnapshot(tmp, '002_b', makeSnapshot('b1', ['p1'], branchB)),
		];

		const report = await sqliteCommutativity.detectNonCommutative(files);
		expect(report.conflicts.length).toBeGreaterThan(0);
		expect(report.conflicts[0].parentId).toBe('p1');
	});

	test('no conflict when branches touch different tables', async () => {
		const parent: SqliteSchema = {};
		const branchA: SqliteSchema = {
			users: sqliteTable('users', { id: int('id') }),
		};
		const branchB: SqliteSchema = {
			posts: sqliteTable('posts', { id: int('id') }),
		};

		const tmp = mkTmp();
		const files = [
			writeSnapshot(tmp, '000_parent', makeSnapshot('p1', [ORIGIN], parent)),
			writeSnapshot(tmp, '001_a', makeSnapshot('a1', ['p1'], branchA)),
			writeSnapshot(tmp, '002_b', makeSnapshot('b1', ['p1'], branchB)),
		];

		const report = await sqliteCommutativity.detectNonCommutative(files);
		expect(report.conflicts).toStrictEqual([]);
		expect(report.commutativeBranches?.length).toBe(1);
	});

	test('drop_table in one branch conflicts with add_column in the other', async () => {
		const parent: SqliteSchema = {
			users: sqliteTable('users', { id: int('id') }),
		};
		const branchA: SqliteSchema = {}; // drops users
		const branchB: SqliteSchema = {
			users: sqliteTable('users', {
				id: int('id'),
				email: text('email'),
			}),
		};

		const tmp = mkTmp();
		const files = [
			writeSnapshot(tmp, '000_parent', makeSnapshot('p1', [ORIGIN], parent)),
			writeSnapshot(tmp, '001_a', makeSnapshot('a1', ['p1'], branchA)),
			writeSnapshot(tmp, '002_b', makeSnapshot('b1', ['p1'], branchB)),
		];

		const report = await sqliteCommutativity.detectNonCommutative(files);
		expect(report.conflicts.length).toBe(1);
	});

	test('two create_table for the same table on different branches conflict', async () => {
		const parent: SqliteSchema = {};
		const branchA: SqliteSchema = {
			users: sqliteTable('users', { id: int('id') }),
		};
		const branchB: SqliteSchema = {
			users: sqliteTable('users', { email: text('email') }),
		};

		const tmp = mkTmp();
		const files = [
			writeSnapshot(tmp, '000_parent', makeSnapshot('p1', [ORIGIN], parent)),
			writeSnapshot(tmp, '001_a', makeSnapshot('a1', ['p1'], branchA)),
			writeSnapshot(tmp, '002_b', makeSnapshot('b1', ['p1'], branchB)),
		];

		const report = await sqliteCommutativity.detectNonCommutative(files);
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('create_index on same table do not conflict when on different columns', async () => {
		const parent: SqliteSchema = {
			orders: sqliteTable('orders', {
				customerId: int('customer_id'),
				status: text('status'),
			}),
		};
		const branchA: SqliteSchema = {
			orders: sqliteTable(
				'orders',
				{
					customerId: int('customer_id'),
					status: text('status'),
				},
				(t) => [index('orders_customer_id_idx').on(t.customerId)],
			),
		};
		const branchB: SqliteSchema = {
			orders: sqliteTable(
				'orders',
				{
					customerId: int('customer_id'),
					status: text('status'),
				},
				(t) => [index('orders_status_idx').on(t.status)],
			),
		};

		const tmp = mkTmp();
		const files = [
			writeSnapshot(tmp, '000_parent', makeSnapshot('p1', [ORIGIN], parent)),
			writeSnapshot(tmp, '001_a', makeSnapshot('a1', ['p1'], branchA)),
			writeSnapshot(tmp, '002_b', makeSnapshot('b1', ['p1'], branchB)),
		];

		const report = await sqliteCommutativity.detectNonCommutative(files);
		expect(report.conflicts).toStrictEqual([]);
	});

	test('view rename on both branches collide', async () => {
		// Parent has view `v`. Branch A renames it to `v_a`, branch B renames
		// it to `v_b`. SQLite cannot rename views, so each branch produces a
		// drop_view(v) — and those two drop_view statements conflict on `v`.
		const t = sqliteTable('t', { id: int('id') });
		const parent: SqliteSchema = {
			t,
			v: sqliteView('v').as((qb) => qb.select().from(t)),
		};
		const branchA: SqliteSchema = {
			t,
			v_a: sqliteView('v_a').as((qb) => qb.select().from(t)),
		};
		const branchB: SqliteSchema = {
			t,
			v_b: sqliteView('v_b').as((qb) => qb.select().from(t)),
		};

		const tmp = mkTmp();
		const files = [
			writeSnapshot(tmp, '000_parent', makeSnapshot('p1', [ORIGIN], parent)),
			writeSnapshot(tmp, '001_a', makeSnapshot('a1', ['p1'], branchA)),
			writeSnapshot(tmp, '002_b', makeSnapshot('b1', ['p1'], branchB)),
		];

		const report = await sqliteCommutativity.detectNonCommutative(files);
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('reports commutativeBranches when forks are independent', async () => {
		const parent: SqliteSchema = {
			users: sqliteTable('users', { id: int('id') }),
		};
		const branchA: SqliteSchema = {
			users: sqliteTable('users', { id: int('id') }),
			likes: sqliteTable('likes', { id: int('id') }),
		};
		const branchB: SqliteSchema = {
			users: sqliteTable('users', { id: int('id') }),
			groups: sqliteTable('groups', { id: int('id') }),
		};

		const tmp = mkTmp();
		const files = [
			writeSnapshot(tmp, '000_parent', makeSnapshot('p1', [ORIGIN], parent)),
			writeSnapshot(tmp, '001_a', makeSnapshot('a1', ['p1'], branchA)),
			writeSnapshot(tmp, '002_b', makeSnapshot('b1', ['p1'], branchB)),
		];

		const report = await sqliteCommutativity.detectNonCommutative(files);
		expect(report.conflicts).toStrictEqual([]);
		expect(report.commutativeBranches).toBeDefined();
		expect(report.commutativeBranches!.length).toBe(1);
		expect(report.commutativeBranches![0].parentId).toBe('p1');
		expect(
			report.commutativeBranches![0].leafs.map((l) => l.id).sort(),
		).toStrictEqual(['a1', 'b1']);
	});
});
