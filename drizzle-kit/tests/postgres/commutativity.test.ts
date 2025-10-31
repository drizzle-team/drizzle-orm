import { check, index, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { diff } from 'src/dialects/dialect';
import { createDDL, interimToDDL } from 'src/dialects/postgres/ddl';
import { fromDrizzleSchema } from 'src/dialects/postgres/drizzle';
import { type PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { detectNonCommutative, getReasonsFromStatements } from 'src/utils/commutativity';
import { describe, expect, test } from 'vitest';
import { conflictsFromSchema } from './mocks';

const baseId = '00000000-0000-0000-0000-000000000000';

function makeSnapshot(id: string, prevIds: string[], ddlEntities: any[] = []): PostgresSnapshot {
	return {
		version: '8',
		dialect: 'postgres',
		id,
		prevIds,
		ddl: ddlEntities,
		renames: [],
	} as any;
}

function writeTempSnapshot(dir: string, tag: string, snap: PostgresSnapshot) {
	const fs = require('fs');
	const path = require('path');
	const folder = path.join(dir, tag);
	fs.mkdirSync(folder, { recursive: true });
	fs.writeFileSync(path.join(folder, 'snapshot.json'), JSON.stringify(snap, null, 2));
	return path.join(folder, 'snapshot.json');
}

describe('commutativity detector (postgres)', () => {
	test('Parent not empty: detects conflict when first migration of branch A has a conflict with the last migration of branch B', async () => {
		const parentDDL = createDDL();
		parentDDL.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		parentDDL.columns.push({
			schema: 'public',
			table: 'users',
			name: 'email',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const parent = makeSnapshot('p1', [baseId], parentDDL.entities.list());

		const A = createDDL();
		A.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		A.columns.push({
			schema: 'public',
			table: 'users',
			name: 'email',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: true,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafA = makeSnapshot('a1', ['p1'], A.entities.list());

		const A2 = createDDL();
		A2.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		A2.columns.push({
			schema: 'public',
			table: 'users',
			name: 'email2',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: true,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafA2 = makeSnapshot('a2', ['a1'], A2.entities.list());

		const B = createDDL();
		B.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		B.columns.push({
			schema: 'public',
			table: 'users',
			name: 'email',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		B.tables.push({ schema: 'public', isRlsEnabled: false, name: 'posts' });
		B.columns.push({
			schema: 'public',
			table: 'posts',
			name: 'content',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafB = makeSnapshot('b1', ['p1'], B.entities.list());

		const B2 = createDDL();
		B2.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		B2.columns.push({
			schema: 'public',
			table: 'users',
			name: 'email',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		B2.tables.push({ schema: 'public', isRlsEnabled: false, name: 'posts' });
		B2.columns.push({
			schema: 'public',
			table: 'posts',
			name: 'content',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: true,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafB2 = makeSnapshot('b2', ['b1'], B2.entities.list());

		const B3 = createDDL();
		B3.tables.push({ schema: 'public', isRlsEnabled: false, name: 'posts' });
		B3.columns.push({
			schema: 'public',
			table: 'posts',
			name: 'content',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: true,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafB3 = makeSnapshot('b3', ['b2'], B3.entities.list());

		const os = require('os');
		const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'dk-comm-'));
		const pPath = writeTempSnapshot(tmp, '000_parent', parent);
		const aPath = writeTempSnapshot(tmp, '001_leafA', leafA);
		const a2Path = writeTempSnapshot(tmp, '001_leafA2', leafA2);
		const bPath = writeTempSnapshot(tmp, '002_leafB', leafB);
		const b2Path = writeTempSnapshot(tmp, '002_leafB2', leafB2);
		const b3Path = writeTempSnapshot(tmp, '002_leafB3', leafB3);

		const report = await detectNonCommutative([pPath, aPath, bPath, b2Path, b3Path, a2Path], 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
		expect(report.conflicts[0].parentId).toBe('p1');
	});

	test('Parent empty: detects conflict when last migration of branch A has a conflict with a first migration of branch B', async () => {
		const parent = makeSnapshot('p1', [baseId], createDDL().entities.list());

		const A = createDDL();
		A.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		A.columns.push({
			schema: 'public',
			table: 'users',
			name: 'email',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafA = makeSnapshot('a1', ['p1'], A.entities.list());

		const A2 = createDDL();
		A2.tables.push({ schema: 'public', isRlsEnabled: false, name: 'posts' });
		A2.columns.push({
			schema: 'public',
			table: 'posts',
			name: 'description',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafA2 = makeSnapshot('a2', ['a1'], A2.entities.list());

		const B = createDDL();
		B.tables.push({ schema: 'public', isRlsEnabled: false, name: 'posts' });
		B.columns.push({
			schema: 'public',
			table: 'users',
			name: 'content',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: true,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafB = makeSnapshot('b1', ['p1'], B.entities.list());

		const B2 = createDDL();
		B2.tables.push({ schema: 'public', isRlsEnabled: false, name: 'posts' });
		B2.columns.push({
			schema: 'public',
			table: 'users',
			name: 'content',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafB2 = makeSnapshot('b2', ['b1'], B2.entities.list());

		const B3 = createDDL();
		B3.tables.push({ schema: 'public', isRlsEnabled: false, name: 'posts' });
		B3.columns.push({
			schema: 'public',
			table: 'users',
			name: 'content',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		B3.tables.push({ schema: 'public', isRlsEnabled: false, name: 'media' });
		B3.columns.push({
			schema: 'public',
			table: 'media',
			name: 'url',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafB3 = makeSnapshot('b3', ['b2'], B3.entities.list());

		const os = require('os');
		const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'dk-comm-'));
		const pPath = writeTempSnapshot(tmp, '000_parent', parent);
		const aPath = writeTempSnapshot(tmp, '001_leafA', leafA);
		const a2Path = writeTempSnapshot(tmp, '002_leafA2', leafA2);
		const bPath = writeTempSnapshot(tmp, '002_leafB', leafB);
		const b2Path = writeTempSnapshot(tmp, '003_leafB2', leafB2);
		const b3Path = writeTempSnapshot(tmp, '004_leafB3', leafB3);

		const report = await detectNonCommutative([pPath, aPath, a2Path, bPath, b2Path, b3Path], 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
		expect(report.conflicts[0].parentId).toBe('p1');
	});

	test('detects conflict when drop table in one branch and add column in other', async () => {
		const parentDDL = createDDL();
		parentDDL.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		parentDDL.columns.push({
			schema: 'public',
			table: 'users',
			name: 'email',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const parent = makeSnapshot('p1', [baseId], parentDDL.entities.list());

		const A = createDDL();
		A.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		A.columns.push({
			schema: 'public',
			table: 'users',
			name: 'email',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: true,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafA = makeSnapshot('a1', ['p1'], A.entities.list());

		const leafB = makeSnapshot('b1', ['p1'], createDDL().entities.list());

		const os = require('os');
		const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'dk-comm-'));
		const pPath = writeTempSnapshot(tmp, '000_parent', parent);
		const aPath = writeTempSnapshot(tmp, '001_leafA', leafA);
		const bPath = writeTempSnapshot(tmp, '002_leafB', leafB);

		const report = await detectNonCommutative([pPath, aPath, bPath], 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
		expect(report.conflicts[0].parentId).toBe('p1');
	});

	test('detects conflict when both branches alter same column', async () => {
		const parent = makeSnapshot('p1', [baseId], createDDL().entities.list());

		const A = createDDL();
		A.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		A.columns.push({
			schema: 'public',
			table: 'users',
			name: 'email',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafA = makeSnapshot('a1', ['p1'], A.entities.list());

		const B = createDDL();
		B.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		B.columns.push({
			schema: 'public',
			table: 'users',
			name: 'email',
			type: 'varchar',
			options: null,
			typeSchema: 'pg_catalog',
			notNull: true,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any);
		const leafB = makeSnapshot('b1', ['p1'], B.entities.list());

		const os = require('os');
		const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'dk-comm-'));
		const pPath = writeTempSnapshot(tmp, '000_parent', parent);
		const aPath = writeTempSnapshot(tmp, '001_leafA', leafA);
		const bPath = writeTempSnapshot(tmp, '002_leafB', leafB);

		const report = await detectNonCommutative([pPath, aPath, bPath], 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
		expect(report.conflicts[0].parentId).toBe('p1');
	});

	test('no conflict when branches touch different tables', async () => {
		const parent = makeSnapshot('p2', [baseId], createDDL().entities.list());

		const A = createDDL();
		A.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		const leafA = makeSnapshot('a2', ['p2'], A.entities.list());

		const B = createDDL();
		B.tables.push({ schema: 'public', isRlsEnabled: false, name: 'posts' });
		const leafB = makeSnapshot('b2', ['p2'], B.entities.list());

		const os = require('os');
		const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'dk-comm-'));
		const pPath = writeTempSnapshot(tmp, '000_parent', parent);
		const aPath = writeTempSnapshot(tmp, '001_leafA', leafA);
		const bPath = writeTempSnapshot(tmp, '002_leafB', leafB);

		const report = await detectNonCommutative([pPath, aPath, bPath], 'postgresql');
		expect(report.conflicts.length).toBe(0);
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
});
