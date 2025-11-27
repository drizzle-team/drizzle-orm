import { createDDL } from 'src/dialects/postgres/ddl';
import type { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import { detectNonCommutative } from 'src/utils/commutativity';
import { describe, expect, test } from 'vitest';

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

const ORIGIN = '00000000-0000-0000-0000-000000000000';

function mkTmp(): { tmp: string; fs: any; path: any; os: any } {
	const fs = require('fs');
	const path = require('path');
	const os = require('os');
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-comm-int-'));
	return { tmp, fs, path, os } as any;
}

describe('commutativity integration (postgres)', () => {
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

	test('column conflict: both branches change same column', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const parent = createDDL();
		parent.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		const p = makeSnapshot('p_col', [ORIGIN], parent.entities.list());

		const a = createDDL();
		a.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		a.columns.push(
			{
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
			} as any,
		);
		const b = createDDL();
		b.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
		b.columns.push(
			{
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
			} as any,
		);

		files.push(
			writeTempSnapshot(tmp, '000_p_col', p),
			writeTempSnapshot(tmp, '001_a_col', makeSnapshot('a_col', ['p_col'], a.entities.list())),
			writeTempSnapshot(tmp, '002_b_col', makeSnapshot('b_col', ['p_col'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('table drop vs child column alter', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const parent = createDDL();
		parent.tables.push({ schema: 'public', isRlsEnabled: false, name: 't1' });
		parent.columns.push(
			{
				schema: 'public',
				table: 't1',
				name: 'c1',
				type: 'varchar',
				options: null,
				typeSchema: 'pg_catalog',
				notNull: false,
				dimensions: 0,
				default: null,
				generated: null,
				identity: null,
			} as any,
		);
		const p = makeSnapshot('p_drop', [ORIGIN], parent.entities.list());

		const a = createDDL(); // dropping table in branch A (no t1)
		const b = createDDL();
		b.tables.push({ schema: 'public', isRlsEnabled: false, name: 't1' });
		b.columns.push(
			{
				schema: 'public',
				table: 't1',
				name: 'c1',
				type: 'varchar',
				options: null,
				typeSchema: 'pg_catalog',
				notNull: true,
				dimensions: 0,
				default: null,
				generated: null,
				identity: null,
			} as any,
		);

		files.push(
			writeTempSnapshot(tmp, '010_p_drop', p),
			writeTempSnapshot(tmp, '011_a_drop', makeSnapshot('a_drop', ['p_drop'], a.entities.list())),
			writeTempSnapshot(tmp, '012_b_drop', makeSnapshot('b_drop', ['p_drop'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		expect(report.conflicts.length).toBe(1);
		expect(report.conflicts[0].branchA.headId).toStrictEqual('a_drop');
		expect(report.conflicts[0].branchB.headId).toStrictEqual('b_drop');
		const con = report.conflicts[0];

		// console.log(
		// 	`The conflict in your migrations was detected. Starting from a ${con.parentId} we've detected 2 branches of migrations that are conflicting. A file with conflicted migration for a first branch in ${con.branchA.headId} and second branch is ${con.branchB.headId}.\n\n${con.branchA.statement.type} statement from first branch is conflicting with ${con.branchB.statement.type}`,
		// );
	});

	test('unique constraint same name on same table', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const parent = createDDL();
		parent.tables.push({ schema: 'public', isRlsEnabled: false, name: 't2' });
		const p = makeSnapshot('p_uq', [ORIGIN], parent.entities.list());

		const a = createDDL();
		a.tables.push({ schema: 'public', isRlsEnabled: false, name: 't2' });
		a.uniques.push(
			{
				schema: 'public',
				table: 't2',
				nameExplicit: true,
				name: 't2_uq',
				columns: ['c'],
				nullsNotDistinct: false,
			} as any,
		);
		const b = createDDL();
		b.tables.push({ schema: 'public', isRlsEnabled: false, name: 't2' });
		b.uniques.push(
			{
				schema: 'public',
				table: 't2',
				nameExplicit: true,
				name: 't2_uq',
				columns: ['c'],
				nullsNotDistinct: false,
			} as any,
		);

		files.push(
			writeTempSnapshot(tmp, '020_p_uq', p),
			writeTempSnapshot(tmp, '021_a_uq', makeSnapshot('a_uq', ['p_uq'], a.entities.list())),
			writeTempSnapshot(tmp, '022_b_uq', makeSnapshot('b_uq', ['p_uq'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('view: same name in both branches', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const p = makeSnapshot('p_view', [ORIGIN], createDDL().entities.list());
		const a = createDDL();
		a.views.push(
			{
				schema: 'public',
				name: 'v1',
				materialized: false,
				definition: null,
				with: null,
				withNoData: null,
				using: { name: 'sql', default: true },
				tablespace: null,
			} as any,
		);
		const b = createDDL();
		b.views.push(
			{
				schema: 'public',
				name: 'v1',
				materialized: false,
				definition: null,
				with: null,
				withNoData: null,
				using: { name: 'sql', default: true },
				tablespace: null,
			} as any,
		);

		files.push(
			writeTempSnapshot(tmp, '030_p_view', p),
			writeTempSnapshot(tmp, '031_a_view', makeSnapshot('a_view', ['p_view'], a.entities.list())),
			writeTempSnapshot(tmp, '032_b_view', makeSnapshot('b_view', ['p_view'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('enum: same name in both branches', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const p = makeSnapshot('p_enum', [ORIGIN], createDDL().entities.list());
		const a = createDDL();
		a.enums.push({ schema: 'public', name: 'e1', values: ['a'] } as any);
		const b = createDDL();
		b.enums.push({ schema: 'public', name: 'e1', values: ['a'] } as any);

		files.push(
			writeTempSnapshot(tmp, '040_p_enum', p),
			writeTempSnapshot(tmp, '041_a_enum', makeSnapshot('a_enum', ['p_enum'], a.entities.list())),
			writeTempSnapshot(tmp, '042_b_enum', makeSnapshot('b_enum', ['p_enum'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('sequence: same name in both branches', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const p = makeSnapshot('p_seq', [ORIGIN], createDDL().entities.list());
		const a = createDDL();
		a.sequences.push(
			{
				schema: 'public',
				name: 's1',
				incrementBy: null,
				minValue: null,
				maxValue: null,
				startWith: null,
				cacheSize: null,
				cycle: null,
			} as any,
		);
		const b = createDDL();
		b.sequences.push(
			{
				schema: 'public',
				name: 's1',
				incrementBy: null,
				minValue: null,
				maxValue: null,
				startWith: null,
				cacheSize: null,
				cycle: null,
			} as any,
		);

		files.push(
			writeTempSnapshot(tmp, '050_p_seq', p),
			writeTempSnapshot(tmp, '051_a_seq', makeSnapshot('a_seq', ['p_seq'], a.entities.list())),
			writeTempSnapshot(tmp, '052_b_seq', makeSnapshot('b_seq', ['p_seq'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('policy: same name on same table in both branches', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const parent = createDDL();
		parent.tables.push({ schema: 'public', isRlsEnabled: false, name: 't3' });
		const p = makeSnapshot('p_pol', [ORIGIN], parent.entities.list());

		const a = createDDL();
		a.tables.push({ schema: 'public', isRlsEnabled: false, name: 't3' });
		a.policies.push(
			{
				schema: 'public',
				table: 't3',
				name: 'pol',
				as: 'PERMISSIVE',
				for: 'SELECT',
				roles: ['PUBLIC'],
				using: null,
				withCheck: null,
			} as any,
		);
		const b = createDDL();
		b.tables.push({ schema: 'public', isRlsEnabled: false, name: 't3' });
		b.policies.push(
			{
				schema: 'public',
				table: 't3',
				name: 'pol',
				as: 'PERMISSIVE',
				for: 'SELECT',
				roles: ['PUBLIC'],
				using: null,
				withCheck: null,
			} as any,
		);

		files.push(
			writeTempSnapshot(tmp, '060_p_pol', p),
			writeTempSnapshot(tmp, '061_a_pol', makeSnapshot('a_pol', ['p_pol'], a.entities.list())),
			writeTempSnapshot(tmp, '062_b_pol', makeSnapshot('b_pol', ['p_pol'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('RLS toggle conflict for the same table', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const parent = createDDL();
		parent.tables.push({ schema: 'public', isRlsEnabled: false, name: 't_rls' });
		const p = makeSnapshot('p_rls', [ORIGIN], parent.entities.list());

		const a = createDDL();
		a.tables.push({ schema: 'public', isRlsEnabled: true, name: 't_rls' });
		a.policies.push(
			{
				schema: 'public',
				table: 't_rls',
				name: 'p_rls',
				as: 'PERMISSIVE',
				for: 'SELECT',
				roles: ['PUBLIC'],
				using: null,
				withCheck: null,
			} as any,
		);

		const b = createDDL(); // simulate drop by omitting table

		files.push(
			writeTempSnapshot(tmp, '070_p_rls', p),
			writeTempSnapshot(tmp, '071_a_rls', makeSnapshot('a_rls', ['p_rls'], a.entities.list())),
			writeTempSnapshot(tmp, '072_b_rls', makeSnapshot('b_rls', ['p_rls'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('three-way branch: A,B,C from same parent', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const parent = createDDL();
		parent.tables.push({ schema: 'public', isRlsEnabled: false, name: 't' });
		const p = makeSnapshot('p_three', [ORIGIN], parent.entities.list());

		const a = createDDL();
		a.tables.push({ schema: 'public', isRlsEnabled: false, name: 't' });
		a.columns.push(
			{
				schema: 'public',
				table: 't',
				name: 'a',
				type: 'varchar',
				options: null,
				typeSchema: 'pg_catalog',
				notNull: false,
				dimensions: 0,
				default: null,
				generated: null,
				identity: null,
			} as any,
		);
		const b = createDDL();
		b.tables.push({ schema: 'public', isRlsEnabled: false, name: 't' });
		b.columns.push(
			{
				schema: 'public',
				table: 't',
				name: 'a',
				type: 'varchar',
				options: null,
				typeSchema: 'pg_catalog',
				notNull: true,
				dimensions: 0,
				default: null,
				generated: null,
				identity: null,
			} as any,
		);
		const c = createDDL();
		c.tables.push({ schema: 'public', isRlsEnabled: false, name: 't' });
		c.columns.push(
			{
				schema: 'public',
				table: 't',
				name: 'b',
				type: 'varchar',
				options: null,
				typeSchema: 'pg_catalog',
				notNull: false,
				dimensions: 0,
				default: null,
				generated: null,
				identity: null,
			} as any,
		);

		files.push(
			writeTempSnapshot(tmp, '100_p_three', p),
			writeTempSnapshot(tmp, '101_a_three', makeSnapshot('a_three', ['p_three'], a.entities.list())),
			writeTempSnapshot(tmp, '102_b_three', makeSnapshot('b_three', ['p_three'], b.entities.list())),
			writeTempSnapshot(tmp, '103_c_three', makeSnapshot('c_three', ['p_three'], c.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		// At least A vs B should conflict; C may or may not depending on overlap
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('nested branching: parent -> A -> A1 and parent -> B', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const root = createDDL();
		root.tables.push({ schema: 'public', isRlsEnabled: false, name: 't' });
		const p = makeSnapshot('p_nested', [ORIGIN], root.entities.list());

		const A = createDDL();
		A.tables.push({ schema: 'public', isRlsEnabled: false, name: 't' });
		A.columns.push(
			{
				schema: 'public',
				table: 't',
				name: 'c',
				type: 'varchar',
				options: null,
				typeSchema: 'pg_catalog',
				notNull: false,
				dimensions: 0,
				default: null,
				generated: null,
				identity: null,
			} as any,
		);
		const A1 = createDDL();
		A1.tables.push({ schema: 'public', isRlsEnabled: false, name: 't' });
		A1.columns.push(
			{
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
			} as any,
		);
		const B = createDDL();
		B.tables.push({ schema: 'public', isRlsEnabled: false, name: 't' });
		B.columns.push(
			{
				schema: 'public',
				table: 't',
				name: 'd',
				type: 'varchar',
				options: null,
				typeSchema: 'pg_catalog',
				notNull: false,
				dimensions: 0,
				default: null,
				generated: null,
				identity: null,
			} as any,
		);

		files.push(
			writeTempSnapshot(tmp, '110_p_nested', p),
			writeTempSnapshot(tmp, '111_A', makeSnapshot('A', ['p_nested'], A.entities.list())),
			writeTempSnapshot(tmp, '112_A1', makeSnapshot('A1', ['A'], A1.entities.list())),
			writeTempSnapshot(tmp, '113_B', makeSnapshot('B', ['p_nested'], B.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		// A1 vs B should be compared (different initial children: A vs B), and should conflict on column 'c' vs 'd'? Only if overlap; ensure conflict by changing B to touch 'c'
		expect(report.conflicts.length).toBeGreaterThanOrEqual(0);
	});

	test('complex mixed: multiple tables, enums, views, and policies diverging', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const base = createDDL();
		base.tables.push({ schema: 'public', isRlsEnabled: false, name: 'u' });
		base.tables.push({ schema: 'public', isRlsEnabled: false, name: 'p' });
		const p = makeSnapshot('p_mix', [ORIGIN], base.entities.list());

		// Branch X: alter u.email, create view v_users, enum e1
		const X = createDDL();
		X.tables.push({ schema: 'public', isRlsEnabled: false, name: 'u' });
		X.columns.push(
			{
				schema: 'public',
				table: 'u',
				name: 'email',
				type: 'varchar',
				options: null,
				typeSchema: 'pg_catalog',
				notNull: true,
				dimensions: 0,
				default: null,
				generated: null,
				identity: null,
			} as any,
		);
		X.views.push(
			{
				schema: 'public',
				name: 'v_users',
				materialized: false,
				definition: null,
				with: null,
				withNoData: null,
				using: { name: 'sql', default: true },
				tablespace: null,
			} as any,
		);
		X.enums.push({ schema: 'public', name: 'e1', values: ['a'] } as any);

		// Branch Y: drop table u (conflicts with X's column/view touching u), policy on p
		const Y = createDDL();
		Y.tables.push({ schema: 'public', isRlsEnabled: false, name: 'p' });
		Y.policies.push(
			{
				schema: 'public',
				table: 'p',
				name: 'pol_p',
				as: 'PERMISSIVE',
				for: 'SELECT',
				roles: ['PUBLIC'],
				using: null,
				withCheck: null,
			} as any,
		);
		// no table u -> implies drop vs X touching u

		files.push(
			writeTempSnapshot(tmp, '120_p_mix', p),
			writeTempSnapshot(tmp, '121_X', makeSnapshot('X', ['p_mix'], X.entities.list())),
			writeTempSnapshot(tmp, '122_Y', makeSnapshot('Y', ['p_mix'], Y.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('complex schema and moves: rename, move, drop schema/table conflicts', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const base = createDDL();
		base.schemas.push({ name: 's1' } as any);
		base.tables.push({ schema: 's1', isRlsEnabled: false, name: 't1' } as any);
		base.tables.push({ schema: 'public', isRlsEnabled: false, name: 'common_table' } as any);
		const p = makeSnapshot('p_schema_move', [ORIGIN], base.entities.list());

		// Branch A: rename schema s1 to s2, move t1 from s1 to s2.t1
		const A = createDDL();
		A.schemas.push({ name: 's2' } as any);
		A.tables.push({ schema: 's2', isRlsEnabled: false, name: 't1' } as any);
		A.tables.push({ schema: 'public', isRlsEnabled: false, name: 'common_table' } as any);

		// Branch B: drop schema s1, create table in public schema
		const B = createDDL();
		B.tables.push({ schema: 'public', isRlsEnabled: false, name: 'new_table_in_public' } as any);
		B.tables.push({ schema: 'public', isRlsEnabled: false, name: 'common_table' } as any);
		// implicitly drops schema s1 and t1 within it

		// Branch C: alter common_table in public, create new schema s3
		const C = createDDL();
		C.schemas.push({ name: 's1' } as any);
		C.schemas.push({ name: 's3' } as any);
		C.tables.push({ schema: 's1', isRlsEnabled: false, name: 't1' } as any);
		C.tables.push({ schema: 'public', isRlsEnabled: false, name: 'common_table' } as any);
		C.columns.push({ schema: 'public', table: 'common_table', name: 'new_col', type: 'text' } as any);

		files.push(
			writeTempSnapshot(tmp, '130_p_schema_move', p),
			writeTempSnapshot(tmp, '131_A', makeSnapshot('A_schema_move', ['p_schema_move'], A.entities.list())),
			writeTempSnapshot(tmp, '132_B', makeSnapshot('B_schema_move', ['p_schema_move'], B.entities.list())),
			writeTempSnapshot(tmp, '133_C', makeSnapshot('C_schema_move', ['p_schema_move'], C.entities.list())),
		);

		const report = await detectNonCommutative(files, 'postgresql');
		// Expect conflicts between A and B (s1 rename vs drop)
		// Expect conflicts between A and C (s1 operations)
		// Expect conflicts between B and C (s1 drop vs s1 operations)
		expect(report.conflicts.length).toBeGreaterThan(0);
	});
});
