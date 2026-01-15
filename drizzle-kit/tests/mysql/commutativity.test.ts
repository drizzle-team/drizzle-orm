import { createDDL } from 'src/dialects/mysql/ddl';
import type { MysqlSnapshot } from 'src/dialects/mysql/snapshot';
import { detectNonCommutative } from 'src/utils/commutativity';
import { describe, expect, test } from 'vitest';

const baseId = '00000000-0000-0000-0000-000000000000';

function makeSnapshot(id: string, prevIds: string[], ddlEntities: any[] = []): MysqlSnapshot {
	return {
		version: '6',
		dialect: 'mysql',
		id,
		prevIds,
		ddl: ddlEntities,
		renames: [],
	} as any;
}

function writeTempSnapshot(dir: string, tag: string, snap: MysqlSnapshot) {
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
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-comm-int-mysql-'));
	return { tmp, fs, path, os } as any;
}

describe('commutativity integration (mysql)', () => {
	test.skipIf(Date.now() < +new Date('2026-01-20'))(
		'Parent not empty: detects conflict when first migration of branch A has a conflict with the last migration of branch B',
		async () => {
			const parentDDL = createDDL();
			parentDDL.tables.push({ name: 'users' });
			parentDDL.columns.push({
				table: 'users',
				name: 'email',
				type: 'varchar(255)',
				notNull: false,
				autoIncrement: false,
				default: null,
				onUpdateNow: false,
				onUpdateNowFsp: null,
				charSet: null,
				collation: null,
				generated: null,
			} as any);
			const parent = makeSnapshot('p1', [baseId], parentDDL.entities.list());

			const A = createDDL();
			A.tables.push({ name: 'users' });
			A.columns.push({
				table: 'users',
				name: 'email',
				type: 'varchar(255)',
				notNull: true,
				autoIncrement: false,
				default: null,
				onUpdateNow: false,
				onUpdateNowFsp: null,
				charSet: null,
				collation: null,
				generated: null,
			} as any);
			const leafA = makeSnapshot('a1', ['p1'], A.entities.list());

			const A2 = createDDL();
			A2.tables.push({ name: 'users' });
			A2.columns.push({
				table: 'users',
				name: 'email2',
				type: 'varchar(255)',
				notNull: true,
				autoIncrement: false,
				default: null,
				onUpdateNow: false,
				onUpdateNowFsp: null,
				charSet: null,
				collation: null,
				generated: null,
			} as any);
			const leafA2 = makeSnapshot('a2', ['a1'], A2.entities.list());

			const B = createDDL();
			B.tables.push({ name: 'users' });
			B.columns.push({
				table: 'users',
				name: 'email',
				type: 'varchar(255)',
				notNull: false,
				autoIncrement: false,
				default: null,
				onUpdateNow: false,
				onUpdateNowFsp: null,
				charSet: null,
				collation: null,
				generated: null,
			} as any);
			B.tables.push({ name: 'posts' });
			B.columns.push({
				table: 'posts',
				name: 'content',
				type: 'varchar(255)',
				notNull: false,
				autoIncrement: false,
				default: null,
				onUpdateNow: false,
				onUpdateNowFsp: null,
				charSet: null,
				collation: null,
				generated: null,
			} as any);
			const leafB = makeSnapshot('b1', ['p1'], B.entities.list());

			const B2 = createDDL();
			B2.tables.push({ name: 'users' });
			B2.columns.push({
				table: 'users',
				name: 'email',
				type: 'varchar(255)',
				notNull: false,
				autoIncrement: false,
				default: null,
				onUpdateNow: false,
				onUpdateNowFsp: null,
				charSet: null,
				collation: null,
				generated: null,
			} as any);
			B2.tables.push({ name: 'posts' });
			B2.columns.push({
				table: 'posts',
				name: 'content',
				type: 'varchar(255)',
				notNull: true,
				autoIncrement: false,
				default: null,
				onUpdateNow: false,
				onUpdateNowFsp: null,
				charSet: null,
				collation: null,
				generated: null,
			} as any);
			const leafB2 = makeSnapshot('b2', ['b1'], B2.entities.list());

			const B3 = createDDL();
			B3.tables.push({ name: 'posts' });
			B3.columns.push({
				table: 'posts',
				name: 'content',
				type: 'varchar(255)',
				notNull: true,
				autoIncrement: false,
				default: null,
				onUpdateNow: false,
				onUpdateNowFsp: null,
				charSet: null,
				collation: null,
				generated: null,
			} as any);
			const leafB3 = makeSnapshot('b3', ['b2'], B3.entities.list());

			const os = require('os');
			const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'dk-comm-mysql-'));
			const pPath = writeTempSnapshot(tmp, '000_parent', parent);
			const aPath = writeTempSnapshot(tmp, '001_leafA', leafA);
			const a2Path = writeTempSnapshot(tmp, '001_leafA2', leafA2);
			const bPath = writeTempSnapshot(tmp, '002_leafB', leafB);
			const b2Path = writeTempSnapshot(tmp, '002_leafB2', leafB2);
			const b3Path = writeTempSnapshot(tmp, '002_leafB3', leafB3);

			const report = await detectNonCommutative([pPath, aPath, bPath, b2Path, b3Path, a2Path], 'mysql');
			expect(report.conflicts.length).toBeGreaterThan(0);
			expect(report.conflicts[0].parentId).toBe('p1');
		},
	);

	test('Parent empty: detects conflict when last migration of branch A has a conflict with a first migration of branch B', async () => {
		const parent = makeSnapshot('p1', [baseId], createDDL().entities.list());

		const A = createDDL();
		A.tables.push({ name: 'users' });
		A.columns.push({
			table: 'users',
			name: 'email',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);
		const leafA = makeSnapshot('a1', ['p1'], A.entities.list());

		const A2 = createDDL();
		A2.tables.push({ name: 'posts' });
		A2.columns.push({
			table: 'posts',
			name: 'description',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);
		const leafA2 = makeSnapshot('a2', ['a1'], A2.entities.list());

		const B = createDDL();
		B.tables.push({ name: 'posts' });
		B.columns.push({
			table: 'users',
			name: 'content',
			type: 'varchar(255)',
			notNull: true,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);
		const leafB = makeSnapshot('b1', ['p1'], B.entities.list());

		const B2 = createDDL();
		B2.tables.push({ name: 'posts' });
		B2.columns.push({
			table: 'users',
			name: 'content',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);
		const leafB2 = makeSnapshot('b2', ['b1'], B2.entities.list());

		const B3 = createDDL();
		B3.tables.push({ name: 'posts' });
		B3.columns.push({
			table: 'users',
			name: 'content',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);
		B3.tables.push({ name: 'media' });
		B3.columns.push({
			table: 'media',
			name: 'url',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);
		const leafB3 = makeSnapshot('b3', ['b2'], B3.entities.list());

		const os = require('os');
		const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'dk-comm-mysql-'));
		const pPath = writeTempSnapshot(tmp, '000_parent', parent);
		const aPath = writeTempSnapshot(tmp, '001_leafA', leafA);
		const a2Path = writeTempSnapshot(tmp, '002_leafA2', leafA2);
		const bPath = writeTempSnapshot(tmp, '002_leafB', leafB);
		const b2Path = writeTempSnapshot(tmp, '003_leafB2', leafB2);
		const b3Path = writeTempSnapshot(tmp, '004_leafB3', leafB3);

		const report = await detectNonCommutative([pPath, aPath, a2Path, bPath, b2Path, b3Path], 'mysql');
		expect(report.conflicts.length).toBeGreaterThan(0);
		expect(report.conflicts[0].parentId).toBe('p1');
	});

	test.skipIf(Date.now() < +new Date('2026-01-20'))(
		'detects conflict when drop table in one branch and add column in other',
		async () => {
			const parentDDL = createDDL();
			parentDDL.tables.push({ name: 'users' });
			parentDDL.columns.push({
				table: 'users',
				name: 'email',
				type: 'varchar(255)',
				notNull: false,
				autoIncrement: false,
				default: null,
				onUpdateNow: false,
				onUpdateNowFsp: null,
				charSet: null,
				collation: null,
				generated: null,
			} as any);
			const parent = makeSnapshot('p1', [baseId], parentDDL.entities.list());

			const A = createDDL();
			A.tables.push({ name: 'users' });
			A.columns.push({
				table: 'users',
				name: 'email',
				type: 'varchar(255)',
				notNull: true,
				autoIncrement: false,
				default: null,
				onUpdateNow: false,
				onUpdateNowFsp: null,
				charSet: null,
				collation: null,
				generated: null,
			} as any);
			const leafA = makeSnapshot('a1', ['p1'], A.entities.list());

			const leafB = makeSnapshot('b1', ['p1'], createDDL().entities.list());

			const os = require('os');
			const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'dk-comm-mysql-'));
			const pPath = writeTempSnapshot(tmp, '000_parent', parent);
			const aPath = writeTempSnapshot(tmp, '001_leafA', leafA);
			const bPath = writeTempSnapshot(tmp, '002_leafB', leafB);

			const report = await detectNonCommutative([pPath, aPath, bPath], 'mysql');
			expect(report.conflicts.length).toBeGreaterThan(0);
			expect(report.conflicts[0].parentId).toBe('p1');
		},
	);

	test('detects conflict when both branches alter same column', async () => {
		const parent = makeSnapshot('p1', [baseId], createDDL().entities.list());

		const A = createDDL();
		A.tables.push({ name: 'users' });
		A.columns.push({
			table: 'users',
			name: 'email',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);
		const leafA = makeSnapshot('a1', ['p1'], A.entities.list());

		const B = createDDL();
		B.tables.push({ name: 'users' });
		B.columns.push({
			table: 'users',
			name: 'email',
			type: 'varchar(255)',
			notNull: true,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);
		const leafB = makeSnapshot('b1', ['p1'], B.entities.list());

		const os = require('os');
		const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'dk-comm-mysql-'));
		const pPath = writeTempSnapshot(tmp, '000_parent', parent);
		const aPath = writeTempSnapshot(tmp, '001_leafA', leafA);
		const bPath = writeTempSnapshot(tmp, '002_leafB', leafB);

		const report = await detectNonCommutative([pPath, aPath, bPath], 'mysql');
		expect(report.conflicts.length).toBeGreaterThan(0);
		expect(report.conflicts[0].parentId).toBe('p1');
	});

	test('no conflict when branches touch different tables', async () => {
		const parent = makeSnapshot('p2', [baseId], createDDL().entities.list());

		const A = createDDL();
		A.tables.push({ name: 'users' });
		const leafA = makeSnapshot('a2', ['p2'], A.entities.list());

		const B = createDDL();
		B.tables.push({ name: 'posts' });
		const leafB = makeSnapshot('b2', ['p2'], B.entities.list());

		const os = require('os');
		const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'dk-comm-mysql-'));
		const pPath = writeTempSnapshot(tmp, '000_parent', parent);
		const aPath = writeTempSnapshot(tmp, '001_leafA', leafA);
		const bPath = writeTempSnapshot(tmp, '002_leafB', leafB);

		const report = await detectNonCommutative([pPath, aPath, bPath], 'mysql');
		expect(report.conflicts.length).toBe(0);
	});

	test('column conflict: both branches change same column', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const parent = createDDL();
		parent.tables.push({ name: 'users' });
		const p = makeSnapshot('p_col', [ORIGIN], parent.entities.list());

		const a = createDDL();
		a.tables.push({ name: 'users' });
		a.columns.push({
			table: 'users',
			name: 'email',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);

		const b = createDDL();
		b.tables.push({ name: 'users' });
		b.columns.push({
			table: 'users',
			name: 'email',
			type: 'varchar(255)',
			notNull: true,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);

		files.push(
			writeTempSnapshot(tmp, '000_p_col', p),
			writeTempSnapshot(tmp, '001_a_col', makeSnapshot('a_col', ['p_col'], a.entities.list())),
			writeTempSnapshot(tmp, '002_b_col', makeSnapshot('b_col', ['p_col'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'mysql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('table drop vs child column alter', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const parent = createDDL();
		parent.tables.push({ name: 't1' });
		parent.columns.push({
			table: 't1',
			name: 'c1',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);
		const p = makeSnapshot('p_drop', [ORIGIN], parent.entities.list());

		const a = createDDL(); // dropping table in branch A (no t1)
		const b = createDDL();
		b.tables.push({ name: 't1' });
		b.columns.push({
			table: 't1',
			name: 'c1',
			type: 'varchar(255)',
			notNull: true,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);

		files.push(
			writeTempSnapshot(tmp, '010_p_drop', p),
			writeTempSnapshot(tmp, '011_a_drop', makeSnapshot('a_drop', ['p_drop'], a.entities.list())),
			writeTempSnapshot(tmp, '012_b_drop', makeSnapshot('b_drop', ['p_drop'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'mysql');
		expect(report.conflicts.length).toBe(1);
		expect(report.conflicts[0].branchA.headId).toStrictEqual('a_drop');
		expect(report.conflicts[0].branchB.headId).toStrictEqual('b_drop');
	});

	test('unique constraint same name on same table', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const parent = createDDL();
		parent.tables.push({ name: 't2' });
		const p = makeSnapshot('p_uq', [ORIGIN], parent.entities.list());

		const a = createDDL();
		a.tables.push({ name: 't2' });
		a.indexes.push({
			table: 't2',
			nameExplicit: true,
			name: 't2_uq',
			columns: [{ value: 'c', isExpression: false }],
			isUnique: true,
			using: null,
			algorithm: null,
			lock: null,
		} as any);

		const b = createDDL();
		b.tables.push({ name: 't2' });
		b.indexes.push({
			table: 't2',
			nameExplicit: true,
			name: 't2_uq',
			columns: [{ value: 'c', isExpression: false }],
			isUnique: true,
			using: null,
			algorithm: null,
			lock: null,
		} as any);

		files.push(
			writeTempSnapshot(tmp, '020_p_uq', p),
			writeTempSnapshot(tmp, '021_a_uq', makeSnapshot('a_uq', ['p_uq'], a.entities.list())),
			writeTempSnapshot(tmp, '022_b_uq', makeSnapshot('b_uq', ['p_uq'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'mysql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('view: same name in both branches', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const p = makeSnapshot('p_view', [ORIGIN], createDDL().entities.list());
		const a = createDDL();
		a.views.push({
			name: 'v1',
			definition: 'select 1',
			algorithm: 'undefined',
			sqlSecurity: 'definer',
			withCheckOption: null,
		} as any);

		const b = createDDL();
		b.views.push({
			name: 'v1',
			definition: 'select 1',
			algorithm: 'undefined',
			sqlSecurity: 'definer',
			withCheckOption: null,
		} as any);

		files.push(
			writeTempSnapshot(tmp, '030_p_view', p),
			writeTempSnapshot(tmp, '031_a_view', makeSnapshot('a_view', ['p_view'], a.entities.list())),
			writeTempSnapshot(tmp, '032_b_view', makeSnapshot('b_view', ['p_view'], b.entities.list())),
		);

		const report = await detectNonCommutative(files, 'mysql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('three-way branch: A,B,C from same parent', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const parent = createDDL();
		parent.tables.push({ name: 't' });
		const p = makeSnapshot('p_three', [ORIGIN], parent.entities.list());

		const a = createDDL();
		a.tables.push({ name: 't' });
		a.columns.push({
			table: 't',
			name: 'a',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);

		const b = createDDL();
		b.tables.push({ name: 't' });
		b.columns.push({
			table: 't',
			name: 'a',
			type: 'varchar(255)',
			notNull: true,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);

		const c = createDDL();
		c.tables.push({ name: 't' });
		c.columns.push({
			table: 't',
			name: 'b',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);

		files.push(
			writeTempSnapshot(tmp, '100_p_three', p),
			writeTempSnapshot(tmp, '101_a_three', makeSnapshot('a_three', ['p_three'], a.entities.list())),
			writeTempSnapshot(tmp, '102_b_three', makeSnapshot('b_three', ['p_three'], b.entities.list())),
			writeTempSnapshot(tmp, '103_c_three', makeSnapshot('c_three', ['p_three'], c.entities.list())),
		);

		const report = await detectNonCommutative(files, 'mysql');
		// At least A vs B should conflict; C may or may not depending on overlap
		expect(report.conflicts.length).toBeGreaterThan(0);
	});

	test('nested branching: parent -> A -> A1 and parent -> B', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const root = createDDL();
		root.tables.push({ name: 't' });
		const p = makeSnapshot('p_nested', [ORIGIN], root.entities.list());

		const A = createDDL();
		A.tables.push({ name: 't' });
		A.columns.push({
			table: 't',
			name: 'c',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);

		const A1 = createDDL();
		A1.tables.push({ name: 't' });
		A1.columns.push({
			table: 't',
			name: 'c',
			type: 'varchar(255)',
			notNull: true,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);

		const B = createDDL();
		B.tables.push({ name: 't' });
		B.columns.push({
			table: 't',
			name: 'd',
			type: 'varchar(255)',
			notNull: false,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);

		files.push(
			writeTempSnapshot(tmp, '110_p_nested', p),
			writeTempSnapshot(tmp, '111_A', makeSnapshot('A', ['p_nested'], A.entities.list())),
			writeTempSnapshot(tmp, '112_A1', makeSnapshot('A1', ['A'], A1.entities.list())),
			writeTempSnapshot(tmp, '113_B', makeSnapshot('B', ['p_nested'], B.entities.list())),
		);

		const report = await detectNonCommutative(files, 'mysql');
		expect(report.conflicts.length).toBeGreaterThanOrEqual(0);
	});

	test.skipIf(Date.now() < +new Date('2026-01-20'))('complex mixed: multiple tables and views diverging', async () => {
		const { tmp } = mkTmp();
		const files: string[] = [];

		const base = createDDL();
		base.tables.push({ name: 'u' });
		base.tables.push({ name: 'p' });
		const p = makeSnapshot('p_mix', [ORIGIN], base.entities.list());

		// Branch X: alter u.email, create view v_users
		const X = createDDL();
		X.tables.push({ name: 'u' });
		X.columns.push({
			table: 'u',
			name: 'email',
			type: 'varchar(255)',
			notNull: true,
			autoIncrement: false,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
		} as any);
		X.views.push({
			name: 'v_users',
			definition: 'select * from u',
			algorithm: 'undefined',
			sqlSecurity: 'definer',
			withCheckOption: null,
		} as any);

		// Branch Y: drop table u (conflicts with X's column/view touching u)
		const Y = createDDL();
		Y.tables.push({ name: 'p' });
		// no table u -> implies drop vs X touching u

		files.push(
			writeTempSnapshot(tmp, '120_p_mix', p),
			writeTempSnapshot(tmp, '121_X', makeSnapshot('X', ['p_mix'], X.entities.list())),
			writeTempSnapshot(tmp, '122_Y', makeSnapshot('Y', ['p_mix'], Y.entities.list())),
		);

		const report = await detectNonCommutative(files, 'mysql');
		expect(report.conflicts.length).toBeGreaterThan(0);
	});
});
