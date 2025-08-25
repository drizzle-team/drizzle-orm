import { createDDL } from 'src/dialects/postgres/ddl';
import { type PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { detectNonCommutative, explainConflicts } from 'src/utils/commutativity';
import { describe, expect, test } from 'vitest';

const baseId = '00000000-0000-0000-0000-000000000000';

function makeSnapshot(id: string, prevId: string, ddlEntities: any[] = []): PostgresSnapshot {
	return {
		version: '8',
		dialect: 'postgres',
		id,
		prevId,
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
		const parent = makeSnapshot('p1', baseId, parentDDL.entities.list());

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
		const leafA = makeSnapshot('a1', 'p1', A.entities.list());

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
		const leafA2 = makeSnapshot('a2', 'a1', A2.entities.list());

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
		const leafB = makeSnapshot('b1', 'p1', B.entities.list());

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
		const leafB2 = makeSnapshot('b2', 'b1', B2.entities.list());

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
		const leafB3 = makeSnapshot('b3', 'b2', B3.entities.list());

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
		const parent = makeSnapshot('p1', baseId, createDDL().entities.list());

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
		const leafA = makeSnapshot('a1', 'p1', A.entities.list());

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
		const leafA2 = makeSnapshot('a2', 'a1', A2.entities.list());

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
		const leafB = makeSnapshot('b1', 'p1', B.entities.list());

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
		const leafB2 = makeSnapshot('b2', 'b1', B2.entities.list());

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
		const leafB3 = makeSnapshot('b3', 'b2', B3.entities.list());

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
		const parent = makeSnapshot('p1', baseId, parentDDL.entities.list());

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
		const leafA = makeSnapshot('a1', 'p1', A.entities.list());

		const leafB = makeSnapshot('b1', 'p1', createDDL().entities.list());

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
		const parent = makeSnapshot('p1', baseId, createDDL().entities.list());

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
		const leafA = makeSnapshot('a1', 'p1', A.entities.list());

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
		const leafB = makeSnapshot('b1', 'p1', B.entities.list());

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
		const parent = makeSnapshot('p2', baseId, createDDL().entities.list());

		const A = createDDL();
		A.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		const leafA = makeSnapshot('a2', 'p2', A.entities.list());

		const B = createDDL();
		B.tables.push({ schema: 'public', isRlsEnabled: false, name: 'posts' });
		const leafB = makeSnapshot('b2', 'p2', B.entities.list());

		const os = require('os');
		const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'dk-comm-'));
		const pPath = writeTempSnapshot(tmp, '000_parent', parent);
		const aPath = writeTempSnapshot(tmp, '001_leafA', leafA);
		const bPath = writeTempSnapshot(tmp, '002_leafB', leafB);

		const report = await detectNonCommutative([pPath, aPath, bPath], 'postgresql');
		expect(report.conflicts.length).toBe(0);
	});

	test('explainConflicts returns reason for table drop vs column alter', async () => {
		// Craft minimal statements
		const dropTable: JsonStatement = {
			type: 'drop_table',
			table: { schema: 'public', isRlsEnabled: false, name: 't', entityType: 'tables' } as any,
			key: '"public"."t"',
		} as any;

		const alterColumn: JsonStatement = {
			type: 'alter_column',
			to: {
				schema: 'public',
				table: 't',
				name: 'c',
				type: 'varchar',
				options: null,
				typeSchema: 'pg_catalog',
				notNull: true,
				dimensions: 0,
				default: null,
				generated: null,
				identity: null,
				entityType: 'columns',
			} as any,
			wasEnum: false,
			isEnum: false,
			diff: {} as any,
		} as any;

		const reasons = explainConflicts([dropTable], [alterColumn]);
		expect(reasons.some((r) => r.includes('Dropping a table conflicts'))).toBe(true);
	});
});

describe('conflict rule coverage (statement pairs)', () => {
	test('column: create vs drop (same-resource-different-op)', () => {
		const createCol: JsonStatement = {
			type: 'add_column',
			column: { schema: 'public', table: 't', name: 'c' } as any,
			isPK: false,
		} as any;
		const dropCol: JsonStatement = {
			type: 'drop_column',
			column: { schema: 'public', table: 't', name: 'c' } as any,
		} as any;
		const reasons = explainConflicts([createCol], [dropCol]);
		expect(reasons.some((r) => r.includes('not commutative'))).toBe(true);
	});

	test('column: alter vs alter (same-resource-same-op)', () => {
		const alter1: JsonStatement = {
			type: 'alter_column',
			to: { schema: 'public', table: 't', name: 'c' } as any,
			wasEnum: false,
			isEnum: false,
			diff: {} as any,
		} as any;
		const alter2: JsonStatement = {
			type: 'alter_column',
			to: { schema: 'public', table: 't', name: 'c' } as any,
			wasEnum: false,
			isEnum: false,
			diff: {} as any,
		} as any;
		const reasons = explainConflicts([alter1], [alter2]);
		expect(reasons.some((r) => r.includes('identical operations'))).toBe(true);
	});

	test('table drop vs child index', () => {
		const dropTable: JsonStatement = {
			type: 'drop_table',
			table: { schema: 'public', name: 't' } as any,
			key: '"public"."t"',
		} as any;
		const createIdx: JsonStatement = {
			type: 'create_index',
			index: { schema: 'public', table: 't', name: 'ix_t_c' } as any,
		} as any;
		const reasons = explainConflicts([dropTable], [createIdx]);
		expect(reasons.some((r) => r.includes('Dropping a table conflicts'))).toBe(true);
	});

	test('index: rename vs create (schema+name)', () => {
		const renameIdx: JsonStatement = { type: 'rename_index', schema: 'public', from: 'ix_old', to: 'ix_new' } as any;
		const createIdx: JsonStatement = {
			type: 'create_index',
			index: { schema: 'public', table: 't', name: 'ix_new' } as any,
		} as any;
		const reasons = explainConflicts([renameIdx], [createIdx]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('pk: alter vs drop', () => {
		const alterPk: JsonStatement = {
			type: 'alter_pk',
			pk: { schema: 'public', table: 't', name: 't_pkey', columns: ['id'] } as any,
			diff: {} as any,
		} as any;
		const dropPk: JsonStatement = {
			type: 'drop_pk',
			pk: { schema: 'public', table: 't', name: 't_pkey', columns: ['id'] } as any,
		} as any;
		const reasons = explainConflicts([alterPk], [dropPk]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('unique: create vs drop', () => {
		const addUq: JsonStatement = {
			type: 'add_unique',
			unique: { schema: 'public', table: 't', name: 't_uq', columns: ['c'] } as any,
		} as any;
		const dropUq: JsonStatement = {
			type: 'drop_unique',
			unique: { schema: 'public', table: 't', name: 't_uq', columns: ['c'] } as any,
		} as any;
		const reasons = explainConflicts([addUq], [dropUq]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('fk: recreate vs drop', () => {
		const recFk: JsonStatement = {
			type: 'recreate_fk',
			fk: { schema: 'public', table: 't', name: 't_fk', tableTo: 'p' } as any,
		} as any;
		const dropFk: JsonStatement = {
			type: 'drop_fk',
			fk: { schema: 'public', table: 't', name: 't_fk', tableTo: 'p' } as any,
		} as any;
		const reasons = explainConflicts([recFk], [dropFk]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('check: alter vs drop', () => {
		const alterCheck: JsonStatement = {
			type: 'alter_check',
			check: { schema: 'public', table: 't', name: 't_chk' } as any,
		} as any;
		const dropCheck: JsonStatement = {
			type: 'drop_check',
			check: { schema: 'public', table: 't', name: 't_chk' } as any,
		} as any;
		const reasons = explainConflicts([alterCheck], [dropCheck]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('view: alter vs recreate', () => {
		const alterView: JsonStatement = {
			type: 'alter_view',
			view: { schema: 'public', name: 'v' } as any,
			diff: {} as any,
		} as any;
		const recreateView: JsonStatement = {
			type: 'recreate_view',
			from: { schema: 'public', name: 'v' } as any,
			to: { schema: 'public', name: 'v' } as any,
		} as any;
		const reasons = explainConflicts([alterView], [recreateView]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('enum: alter vs recreate', () => {
		const alterEnum: JsonStatement = {
			type: 'alter_enum',
			enum: { schema: 'public', name: 'e', values: [] } as any,
			diff: [],
		} as any;
		const recreateEnum: JsonStatement = {
			type: 'recreate_enum',
			to: { schema: 'public', name: 'e', values: [] } as any,
			columns: [] as any,
		} as any;
		const reasons = explainConflicts([alterEnum], [recreateEnum]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('sequence: rename vs alter', () => {
		const renameSeq: JsonStatement = {
			type: 'rename_sequence',
			from: { schema: 'public', name: 's' } as any,
			to: { schema: 'public', name: 's2' } as any,
		} as any;
		const alterSeq: JsonStatement = {
			type: 'alter_sequence',
			sequence: { schema: 'public', name: 's2' } as any,
			diff: {} as any,
		} as any;
		const reasons = explainConflicts([renameSeq], [alterSeq]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('policy: rename vs alter', () => {
		const renamePolicy: JsonStatement = {
			type: 'rename_policy',
			from: { schema: 'public', table: 't', name: 'p' } as any,
			to: { schema: 'public', table: 't', name: 'p2' } as any,
		} as any;
		const alterPolicy: JsonStatement = {
			type: 'alter_policy',
			policy: { schema: 'public', table: 't', name: 'p2' } as any,
			diff: {} as any,
		} as any;
		const reasons = explainConflicts([renamePolicy], [alterPolicy]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('schema: rename vs create', () => {
		const renameSchema: JsonStatement = {
			type: 'rename_schema',
			from: { name: 's' } as any,
			to: { name: 's2' } as any,
		} as any;
		const createSchema: JsonStatement = { type: 'create_schema', name: 's2' } as any;
		const reasons = explainConflicts([renameSchema], [createSchema]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('role: drop vs alter', () => {
		const dropRole: JsonStatement = { type: 'drop_role', role: { name: 'r' } as any } as any;
		const alterRole: JsonStatement = { type: 'alter_role', role: { name: 'r' } as any, diff: {} as any } as any;
		const reasons = explainConflicts([dropRole], [alterRole]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('privilege: grant vs revoke (coarse key)', () => {
		const grant: JsonStatement = {
			type: 'grant_privilege',
			privilege: { schema: 'public', table: 't', grantee: 'x', type: 'SELECT' } as any,
		} as any;
		const revoke: JsonStatement = {
			type: 'revoke_privilege',
			privilege: { schema: 'public', table: 't', grantee: 'x', type: 'SELECT' } as any,
		} as any;
		const reasons = explainConflicts([grant], [revoke]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('rls: alter vs alter (same-resource-same-op)', () => {
		const rls1: JsonStatement = { type: 'alter_rls', schema: 'public', name: 't', isRlsEnabled: true } as any;
		const rls2: JsonStatement = { type: 'alter_rls', schema: 'public', name: 't', isRlsEnabled: false } as any;
		const reasons = explainConflicts([rls1], [rls2]);
		expect(reasons.some((r) => r.includes('identical operations'))).toBe(true);
	});

	test('schema: drop vs create (same schema name)', () => {
		const dropSchema: JsonStatement = { type: 'drop_schema', name: 's1' } as any;
		const createSchema: JsonStatement = { type: 'create_schema', name: 's1' } as any;
		const reasons = explainConflicts([dropSchema], [createSchema]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('schema: drop vs alter entity in schema', () => {
		const dropSchema: JsonStatement = { type: 'drop_schema', name: 's1' } as any;
		const alterTableInSchema: JsonStatement = {
			type: 'create_table',
			table: { schema: 's1', isRlsEnabled: false, name: 't1', entityType: 'tables' } as any,
		} as any;
		const reasons = explainConflicts([dropSchema], [alterTableInSchema]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('schema: rename vs create (old name/new name collision)', () => {
		const renameSchema: JsonStatement = { type: 'rename_schema', from: { name: 'old_s' } as any, to: { name: 'new_s' } as any } as any;
		const createSchema: JsonStatement = { type: 'create_schema', name: 'old_s' } as any;
		const reasons = explainConflicts([renameSchema], [createSchema]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('table: move vs alter', () => {
		const moveTable: JsonStatement = {
			type: 'move_table',
			name: 't1',
			from: 's1',
			to: 's2',
		} as any;
		const alterTable: JsonStatement = {
			type: 'alter_column',
			to: { schema: 's1', table: 't1', name: 'c1' } as any,
			wasEnum: false,
			isEnum: false,
			diff: {} as any,
		} as any;
		const reasons = explainConflicts([moveTable], [alterTable]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('view: move vs alter', () => {
		const moveView: JsonStatement = {
			type: 'move_view',
			fromSchema: 's1',
			toSchema: 's2',
			view: { schema: 's2', name: 'v1' } as any,
		} as any;
		const alterView: JsonStatement = {
			type: 'alter_view',
			view: { schema: 's1', name: 'v1' } as any,
			diff: {} as any,
		} as any;
		const reasons = explainConflicts([moveView], [alterView]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('enum: move vs alter', () => {
		const moveEnum: JsonStatement = {
			type: 'move_enum',
			from: { schema: 's1', name: 'e1' },
			to: { schema: 's2', name: 'e1' },
		} as any;
		const alterEnum: JsonStatement = {
			type: 'alter_enum',
			enum: { schema: 's1', name: 'e1', values: [] } as any,
			diff: [],
		} as any;
		const reasons = explainConflicts([moveEnum], [alterEnum]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('sequence: move vs alter', () => {
		const moveSeq: JsonStatement = {
			type: 'move_sequence',
			from: { schema: 's1', name: 'sq1' },
			to: { schema: 's2', name: 'sq1' },
		} as any;
		const alterSeq: JsonStatement = {
			type: 'alter_sequence',
			sequence: { schema: 's1', name: 'sq1' } as any,
			diff: {} as any,
		} as any;
		const reasons = explainConflicts([moveSeq], [alterSeq]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('pk: rename vs alter', () => {
		const renamePk: JsonStatement = {
			type: 'rename_constraint',
			schema: 'public',
			table: 't',
			from: 'old_pk',
			to: 'new_pk',
		} as any;
		const alterPk: JsonStatement = {
			type: 'alter_pk',
			pk: { schema: 'public', table: 't', name: 'new_pk', columns: ['id'] } as any,
			diff: {} as any,
		} as any;
		const reasons = explainConflicts([renamePk], [alterPk]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('pk: rename vs drop', () => {
		const renamePk: JsonStatement = {
			type: 'rename_constraint',
			schema: 'public',
			table: 't',
			from: 'old_pk',
			to: 'new_pk',
		} as any;
		const dropPk: JsonStatement = {
			type: 'drop_pk',
			pk: { schema: 'public', table: 't', name: 'new_pk', columns: ['id'] } as any,
		} as any;
		const reasons = explainConflicts([renamePk], [dropPk]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('unique: rename vs alter', () => {
		const renameUq: JsonStatement = {
			type: 'rename_constraint',
			schema: 'public',
			table: 't',
			from: 'old_uq',
			to: 'new_uq',
		} as any;
		const alterUq: JsonStatement = {
			type: 'alter_unique',
			diff: { schema: 'public', table: 't', name: 'new_uq' } as any,
		} as any;
		const reasons = explainConflicts([renameUq], [alterUq]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('unique: rename vs drop', () => {
		const renameUq: JsonStatement = {
			type: 'rename_constraint',
			schema: 'public',
			table: 't',
			from: 'old_uq',
			to: 'new_uq',
		} as any;
		const dropUq: JsonStatement = {
			type: 'drop_unique',
			unique: { schema: 'public', table: 't', name: 'new_uq', columns: ['c'] } as any,
		} as any;
		const reasons = explainConflicts([renameUq], [dropUq]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('fk: rename vs alter', () => {
		const renameFk: JsonStatement = {
			type: 'rename_constraint',
			schema: 'public',
			table: 't',
			from: 'old_fk',
			to: 'new_fk',
		} as any;
		const recreateFk: JsonStatement = {
			type: 'recreate_fk',
			fk: { schema: 'public', table: 't', name: 'new_fk', tableTo: 'p' } as any,
		} as any;
		const reasons = explainConflicts([renameFk], [recreateFk]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('fk: rename vs drop', () => {
		const renameFk: JsonStatement = {
			type: 'rename_constraint',
			schema: 'public',
			table: 't',
			from: 'old_fk',
			to: 'new_fk',
		} as any;
		const dropFk: JsonStatement = {
			type: 'drop_fk',
			fk: { schema: 'public', table: 't', name: 'new_fk', tableTo: 'p' } as any,
		} as any;
		const reasons = explainConflicts([renameFk], [dropFk]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('check: rename vs alter', () => {
		const renameCheck: JsonStatement = {
			type: 'rename_constraint',
			schema: 'public',
			table: 't',
			from: 'old_check',
			to: 'new_check',
		} as any;
		const alterCheck: JsonStatement = {
			type: 'alter_check',
			check: { schema: 'public', table: 't', name: 'new_check' } as any,
		} as any;
		const reasons = explainConflicts([renameCheck], [alterCheck]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('check: rename vs drop', () => {
		const renameCheck: JsonStatement = {
			type: 'rename_constraint',
			schema: 'public',
			table: 't',
			from: 'old_check',
			to: 'new_check',
		} as any;
		const dropCheck: JsonStatement = {
			type: 'drop_check',
			check: { schema: 'public', table: 't', name: 'new_check' } as any,
		} as any;
		const reasons = explainConflicts([renameCheck], [dropCheck]);
		expect(reasons.length).toBeGreaterThan(0);
	});

	test('privilege: grant vs revoke (different grantees)', () => {
		const grant: JsonStatement = {
			type: 'grant_privilege',
			privilege: { schema: 'public', table: 't', grantee: 'user1', type: 'SELECT' } as any,
		} as any;
		const revoke: JsonStatement = {
			type: 'revoke_privilege',
			privilege: { schema: 'public', table: 't', grantee: 'user2', type: 'SELECT' } as any,
		} as any;
		const reasons = explainConflicts([grant], [revoke]);
		expect(reasons.length).toBe(0); // Should not conflict if grantees are different
	});
});
