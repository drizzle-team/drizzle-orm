import { createHash } from 'crypto';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { applyInPlace, create, type Delta, delta } from 'src/dialects/dialect';
import { createDDL, fromEntities } from 'src/dialects/postgres/ddl';
import {
	assertDeltasRebuildState,
	type PostgresBaseSnapshot,
	type PostgresSnapshot,
	reconstruct,
	snapshotValidator,
	startingState,
	stateHash,
} from 'src/dialects/postgres/snapshot';
import { originUUID } from 'src/utils';
import { describe, expect, test } from 'vitest';
import { columnRow } from './folder-flow';

const ddlOf = (table: string, columns: string[]) => {
	const ddl = createDDL();
	ddl.schemas.push({ name: 'public' });
	ddl.tables.push({ schema: 'public', name: table, isRlsEnabled: false });
	for (const name of columns) {
		ddl.columns.push({ schema: 'public', table, name, type: 'integer', notNull: false, dimensions: 0 });
	}
	return ddl;
};
const rows = (ddl: ReturnType<typeof createDDL>) => normalizeDDL(ddl.entities.list());
const column = (table: string, name: string) => ddlOf(table, [name]).columns.list()[0];
const columnKey = (table: string, name: string) => `columns\0${JSON.stringify(['public', table, name])}`;

const base = (id: string, ddl: ReturnType<typeof createDDL>): PostgresBaseSnapshot => ({
	type: 'base',
	version: '9',
	dialect: 'postgres',
	id,
	prevIds: [originUUID],
	ddl: ddl.entities.list(),
	statements: [],
	stateHash: stateHash(ddl),
});

const diff = (id: string, prevIds: string[], deltas: Delta[]): PostgresSnapshot => ({
	type: 'diff',
	version: '9',
	dialect: 'postgres',
	id,
	prevIds,
	deltas,
	statements: [],
	stateHash: '',
});

// Gives every diff snapshot the hash of the state that it rebuilds to, as generate does. The snapshots must
// come after their parents. A snapshot that does not rebuild keeps its empty hash.
const historyOf = (...snapshots: PostgresSnapshot[]) => {
	const history = new Map<string, PostgresSnapshot>();
	for (const it of snapshots) {
		history.set(it.id, it);
		if (it.type !== 'diff') continue;
		try {
			history.set(it.id, { ...it, stateHash: stateHash(applyInPlace(startingState(history, it.prevIds), it.deltas)) });
		} catch {}
	}
	return history;
};

describe('reconstruct', () => {
	test('replays every diff from the base', () => {
		const s0 = ddlOf('users', ['id']);
		const s1 = ddlOf('users', ['id', 'email']);
		const s2 = ddlOf('users', ['id', 'email', 'age']);
		const history = historyOf(base('a', s0), diff('b', ['a'], delta(s0, s1)), diff('c', ['b'], delta(s1, s2)));

		expect(rows(reconstruct(history, 'a'))).toStrictEqual(rows(s0));
		expect(rows(reconstruct(history, 'b'))).toStrictEqual(rows(s1));
		expect(rows(reconstruct(history, 'c'))).toStrictEqual(rows(s2));
		expect(rows(reconstruct(history, 'a'))).toStrictEqual(rows(s0));
	});

	test('a merge replays the other branches on top of its first parent', () => {
		const s0 = ddlOf('users', ['id']);
		const left = ddlOf('users', ['id', 'left']);
		const right = ddlOf('users', ['id', 'right']);
		const combined = ddlOf('users', ['id', 'left', 'right']);
		const merged = ddlOf('users', ['id', 'left', 'right', 'own']);
		const history = historyOf(
			base('a', s0),
			diff('b', ['a'], delta(s0, left)),
			diff('c', ['a'], delta(s0, right)),
			diff('d', ['c', 'b'], delta(combined, merged)),
		);

		expect(rows(startingState(history, ['c', 'b']))).toStrictEqual(rows(combined));
		expect(rows(reconstruct(history, 'd'))).toStrictEqual(rows(merged));
	});

	test('a merge replays a nested merge with only its own deltas', () => {
		const history = historyOf(
			base('a', ddlOf('users', ['id'])),
			diff('b', ['a'], [{ op: 'create', row: column('users', 'x') }]),
			diff('c', ['a'], [{ op: 'create', row: column('users', 'y') }]),
			diff('d', ['c', 'b'], [{ op: 'create', row: column('users', 'm') }]),
			diff('e', ['a'], [{ op: 'create', row: column('users', 'z') }]),
			diff('f', ['e', 'd'], [{ op: 'create', row: column('users', 'n') }]),
		);

		expect(rows(reconstruct(history, 'f'))).toStrictEqual(rows(ddlOf('users', ['id', 'z', 'x', 'y', 'm', 'n'])));
	});

	test('a merge replays the other branches in folder order', () => {
		const history = historyOf(
			base('a', ddlOf('users', ['id'])),
			diff('b', ['a'], [{ op: 'alter', key: columnKey('users', 'id'), set: { type: 'text' } }]),
			diff('c', ['a'], [{ op: 'alter', key: columnKey('users', 'id'), set: { type: 'bigint' } }]),
			diff('d', ['a'], [{ op: 'create', row: column('users', 'z') }]),
			diff('e', ['d', 'c', 'b'], []),
		);

		expect(reconstruct(history, 'e').columns.one({ name: 'id' })?.type).toBe('bigint');
	});

	test('the combined state skips a drop, an alter or a rename of a missing row', () => {
		const history = historyOf(
			base('a', ddlOf('users', ['id', 'email', 'phone'])),
			diff('b', ['a'], [
				{ op: 'alter', key: columnKey('users', 'email'), set: { notNull: true } },
				{ op: 'drop', key: columnKey('users', 'email') },
				{ op: 'rename', key: columnKey('users', 'phone'), set: { name: 'mobile' } },
			]),
			diff('c', ['a'], [
				{ op: 'drop', key: columnKey('users', 'email') },
				{ op: 'drop', key: columnKey('users', 'phone') },
			]),
			diff('d', ['c', 'b'], []),
		);

		expect(rows(reconstruct(history, 'd'))).toStrictEqual(rows(ddlOf('users', ['id'])));
	});

	test('in the combined state a create overwrites a taken key, and a rename onto a taken key throws', () => {
		const created = { op: 'create', row: { ...column('users', 'x'), type: 'text' } } as const;
		const renamed = { op: 'rename', key: columnKey('users', 'id'), set: { name: 'key' } } as const;
		const historyWith = (deltas: Delta[]) =>
			historyOf(
				base('a', ddlOf('users', ['id'])),
				diff('b', ['a'], deltas),
				diff('c', ['a'], [
					{ op: 'create', row: column('users', 'x') },
					{ op: 'create', row: { ...column('users', 'key'), notNull: true } },
				]),
				diff('d', ['c', 'b'], []),
			);
		const expected = ddlOf('users', ['id', 'key', 'x']);
		expected.columns.update({ set: { type: 'text' }, where: { name: 'x' } });
		expected.columns.update({ set: { notNull: true }, where: { name: 'key' } });

		expect(rows(startingState(historyWith([created]), ['c', 'b']))).toStrictEqual(rows(expected));
		expect(() => startingState(historyWith([created, renamed]), ['c', 'b'])).toThrow(
			'The rename delta moves columns ["public","users","id"] to ["public","users","key"], and another row of '
				+ 'columns already has the key ["public","users","key"]',
		);
	});

	// Branch b renames column x, and branch c renames column z and the key. Each rename has an instruction
	// for the column list of the key, so the key gets both new column names with either first parent.
	test('a merge runs the instructions of the other branches on the rows that it has at that moment', () => {
		const start = ddlOf('t', ['x', 'z']);
		start.pks.push({ schema: 'public', table: 't', name: 't_pk', nameExplicit: true, columns: ['x', 'z'] });
		const inT = { schema: 'public', table: 't' };
		const columnRename = (from: string, to: string): Delta[] => [
			{ op: 'rename', key: columnKey('t', from), set: { name: to } },
			{ op: 'replace_in_list', type: 'pks', where: inT, field: 'columns', from, to },
		];
		const history = historyOf(
			base('a', start),
			diff('b', ['a'], columnRename('x', 'y')),
			diff('c', ['a'], [
				...columnRename('z', 'w'),
				{ op: 'rename', key: 'pks\0["public","t","t_pk"]', set: { name: 't_pk2' } },
			]),
		);

		for (const prevIds of [['c', 'b'], ['b', 'c']]) {
			const state = startingState(history, prevIds);
			expect(state.pks.list()).toMatchObject([{ name: 't_pk2', columns: ['y', 'w'] }]);
			expect(state.columns.list().map((it) => it.name).sort()).toStrictEqual(['w', 'y']);
		}
	});

	// Branch c drops the table. The instruction of branch b for its columns then matches no row, and the
	// keyed deltas of branch b for the dropped rows are skipped.
	test('a merge skips a keyed delta whose key is missing, and an instruction that matches no row', () => {
		const start = ddlOf('users', ['id']);
		start.tables.push({ schema: 'public', name: 'posts', isRlsEnabled: false });
		const history = historyOf(
			base('a', start),
			diff('b', ['a'], [
				{ op: 'rename', key: 'tables\0["public","users"]', set: { name: 'accounts' } },
				{ op: 'update', type: 'columns', where: { schema: 'public', table: 'users' }, set: { table: 'accounts' } },
				{ op: 'alter', key: columnKey('accounts', 'id'), set: { notNull: true } },
				{ op: 'drop', key: columnKey('accounts', 'id') },
			]),
			diff('c', ['a'], [
				{ op: 'drop', key: columnKey('users', 'id') },
				{ op: 'drop', key: 'tables\0["public","users"]' },
			]),
		);

		const state = startingState(history, ['c', 'b']);
		expect(state.tables.list().map((it) => it.name)).toStrictEqual(['posts']);
		expect(state.columns.list()).toStrictEqual([]);
	});

	test('two branches that each started from an empty folder merge', () => {
		const expected = ddlOf('users', ['id']);
		expected.tables.push({ schema: 'public', name: 'posts', isRlsEnabled: false });
		expected.columns.push(column('posts', 'id'));
		const history = historyOf(
			base('a', ddlOf('users', ['id'])),
			base('b', ddlOf('posts', ['id'])),
			diff('c', ['b', 'a'], []),
		);

		expect(rows(reconstruct(history, 'c'))).toStrictEqual(rows(expected));
	});

	test('a missing parent throws', () => {
		const history = historyOf(diff('b', ['a'], []));

		expect(() => reconstruct(history, 'b')).toThrow(
			'Cannot rebuild snapshot b: snapshot a is missing from the migrations folder.',
		);
	});

	test('a delta that targets a missing entity throws', () => {
		const s0 = ddlOf('users', ['id']);
		const s1 = ddlOf('users', ['id', 'email']);
		const history = historyOf(base('a', s0), diff('b', ['a'], delta(s1, s0)));

		expect(() => reconstruct(history, 'b')).toThrow(/missing entity/);
	});

	test('rebuilds the last of 1000 snapshots over 5500 rows in under one second', () => {
		const tables = new Map<string, { name: string; notNull: boolean }[]>();
		for (let idx = 0; idx < 500; idx++) {
			tables.set(
				`t${idx}`,
				['id', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'].map((name) => ({ name, notNull: false })),
			);
		}
		const state = () => [
			{ entityType: 'schemas' as const, name: 'public' },
			...[...tables].flatMap(([table, columns]) => [
				{ entityType: 'tables' as const, schema: 'public', name: table, isRlsEnabled: false },
				...columns.map((it) => columnRow(table, it.name, 'integer', it.notNull)),
			]),
		];

		const first: PostgresBaseSnapshot = {
			type: 'base',
			version: '9',
			dialect: 'postgres',
			id: 's0',
			prevIds: [originUUID],
			ddl: state(),
			statements: [],
			stateHash: stateHash(fromEntities(state())),
		};
		expect(first.ddl).toHaveLength(5501);
		const history = historyOf(first);
		for (let idx = 1; idx < 1000; idx++) {
			const table = [...tables.keys()][idx % tables.size];
			const columns = tables.get(table)!;
			const deltas: Delta[] = [];
			if (idx % 4 === 0) {
				columns.push({ name: `added${idx}`, notNull: false });
				deltas.push({ op: 'create', row: columnRow(table, `added${idx}`) });
			} else if (idx % 4 === 1) {
				columns[1].notNull = !columns[1].notNull;
				deltas.push({ op: 'alter', key: columnKey(table, columns[1].name), set: { notNull: columns[1].notNull } });
			} else if (idx % 4 === 2) {
				deltas.push({ op: 'rename', key: columnKey(table, columns[2].name), set: { name: `renamed${idx}` } });
				columns[2].name = `renamed${idx}`;
			} else {
				const renamed = `${table}_${idx}`;
				deltas.push({ op: 'rename', key: `tables\0${JSON.stringify(['public', table])}`, set: { name: renamed } });
				deltas.push({ op: 'update', type: 'columns', where: { schema: 'public', table }, set: { table: renamed } });
				tables.delete(table);
				tables.set(renamed, columns);
			}
			history.set(`s${idx}`, diff(`s${idx}`, [`s${idx - 1}`], deltas));
		}
		// Only the requested snapshot has a hash here. The rebuild compares one hash, and not one for every
		// snapshot of the history.
		history.set('s999', { ...history.get('s999')!, stateHash: stateHash(fromEntities(state())) });

		const started = performance.now();
		const rebuilt = reconstruct(history, 's999');
		const elapsed = performance.now() - started;

		expect(normalizeDDL(rebuilt.entities.list())).toStrictEqual(normalizeDDL(state()));
		console.info(`Rebuilt the last of 1000 snapshots in ${elapsed.toFixed(1)} ms`);
		expect(elapsed).toBeLessThan(1000);
	});
});

describe('stateHash', () => {
	test('a state rebuilt from other deltas has the same hash, and another state has another hash', () => {
		const s0 = ddlOf('users', ['id']);
		const s1 = ddlOf('users', ['id', 'email']);
		const s2 = ddlOf('users', ['id', 'email', 'age']);
		const history = historyOf(base('a', s0), diff('b', ['a'], delta(s0, s1)), diff('c', ['b'], delta(s1, s2)));

		expect(stateHash(reconstruct(history, 'c'))).toBe(stateHash(s2));
		expect(stateHash(fromEntities([...s2.entities.list()].reverse()))).toBe(stateHash(s2));
		expect(stateHash(s1)).not.toBe(stateHash(s2));
		expect(stateHash(s2)).toMatch(/^[0-9a-f]{64}$/);
	});

	test('a field that is null is not part of the hash, so a new optional field keeps old hashes', () => {
		const identity = { items: (row: Record<string, unknown>) => JSON.stringify([row.name]) };
		const before = create({ items: { name: 'string', size: 'number' } }, { identity });
		const after = create({ items: { name: 'string', size: 'number', note: 'string?' } }, { identity });
		before.items.push({ name: 'a', size: 1 });
		after.items.push({ name: 'a', size: 1 });
		const changed = create({ items: { name: 'string', size: 'number', note: 'string?' } }, { identity });
		changed.items.push({ name: 'a', size: 1, note: 'x' });

		expect(stateHash(after)).toBe(stateHash(before));
		expect(stateHash(changed)).not.toBe(stateHash(before));
	});

	// A hash is stored in every snapshot, so the canonical form must never change: rows in the order of
	// their keys and fields in the order of their names, both by code unit, and no null fields. A locale-aware
	// order would put "ä" before "B".
	test('the canonical form of a state is fixed', () => {
		const identity = { items: (row: Record<string, unknown>) => JSON.stringify([row.name]) };
		const state = create({ items: { name: 'string', Zeta: 'number', alpha: 'string?' } }, { identity });
		for (const name of ['a', 'ä', 'B']) state.items.push({ name, Zeta: 1 });

		expect(stateHash(state)).toBe(
			createHash('sha256')
				.update('{"Zeta":1,"entityType":"items","name":"B"}\n')
				.update('{"Zeta":1,"entityType":"items","name":"a"}\n')
				.update('{"Zeta":1,"entityType":"items","name":"ä"}\n')
				.digest('hex'),
		);
	});
});

describe('reconstruct with state hashes', () => {
	const s0 = ddlOf('users', ['id']);
	const s1 = ddlOf('users', ['id', 'email']);
	const s2 = ddlOf('users', ['id', 'email', 'age']);

	test('a snapshot that rebuilds to another state than it recorded throws and is named', () => {
		const history = historyOf(base('a', s0), diff('b', ['a'], delta(s0, s1)), diff('c', ['b'], delta(s1, s2)));
		history.set('b', { ...history.get('b')!, deltas: [] } as PostgresSnapshot);

		expect(() => reconstruct(history, 'b')).toThrow(
			'Cannot rebuild snapshot b: the rebuilt state differs from the state that the snapshot recorded.',
		);
		expect(() => reconstruct(history, 'c')).toThrow('Cannot rebuild snapshot c: the rebuilt state differs');
	});

	test('a base snapshot with edited rows throws', () => {
		const edited = { ...base('a', s0), ddl: s1.entities.list() };

		expect(() => reconstruct(historyOf(edited), 'a')).toThrow('Cannot rebuild snapshot a: the rebuilt state differs');
	});

	test('a merge checks the state of its first parent before it replays the other branches', () => {
		const left = ddlOf('users', ['id', 'left']);
		const right = ddlOf('users', ['id', 'right']);
		const history = historyOf(
			base('a', s0),
			diff('b', ['a'], delta(s0, left)),
			diff('c', ['a'], delta(s0, right)),
			diff('d', ['c', 'b'], []),
		);
		// With the delta of c removed, the combined state loses the column `right`, and d stores the old hash.
		history.set('c', { ...history.get('c')!, deltas: [] } as PostgresSnapshot);

		expect(() => reconstruct(history, 'd')).toThrow('Cannot rebuild snapshot c: the rebuilt state differs');
	});
});

describe('assertDeltasRebuildState', () => {
	// generate runs this check before it writes a snapshot. It fails only when the diff returns deltas that
	// do not match its own result, which is a bug in drizzle-kit. No schema reproduces that, so the test passes
	// a wrong delta list to the check.
	test('throws when the deltas do not rebuild the state that the diff used', () => {
		const from = ddlOf('users', ['id']);
		const to = ddlOf('users', ['id', 'email', 'age']);
		const deltas = delta(from, to);

		expect(() => assertDeltasRebuildState(from, deltas, to)).not.toThrow();
		expect(() => assertDeltasRebuildState(from, deltas.slice(1), to)).toThrow(
			'The deltas of the new migration do not rebuild the schema: columns public.users.email differs. '
				+ 'Nothing was written. This is a bug in drizzle-kit.',
		);
		expect(rows(from)).toStrictEqual(rows(ddlOf('users', ['id'])));
	});
});

describe('snapshotValidator', () => {
	const valid = (it: unknown) => snapshotValidator.parse(it).success;
	const users = ddlOf('users', ['id']);

	test('accepts base and diff snapshots', () => {
		const deltas: Delta[] = [
			{ op: 'create', row: users.columns.list()[0] },
			{ op: 'drop', key: 'columns\0["public","users","id"]' },
			{ op: 'alter', key: 'columns\0["public","users","id"]', set: { notNull: true } },
			{ op: 'rename', key: 'tables\0["public","users"]', set: { name: 'accounts' } },
			{ op: 'update', type: 'columns', where: { schema: 'public', table: 'users' }, set: { table: 'accounts' } },
			{ op: 'replace_in_list', type: 'pks', where: { table: 'users' }, field: 'columns', from: 'id', to: 'key' },
			{
				op: 'update_list_items',
				type: 'indexes',
				where: {},
				field: 'columns',
				match: { value: 'id', isExpression: false },
				set: { value: 'key' },
			},
		];

		expect(valid(base('a', users))).toBe(true);
		expect(valid(diff('c', ['b'], deltas))).toBe(true);
	});

	test('rejects a checkpoint, and a base that has a parent', () => {
		expect(valid({ ...base('b', users), type: 'checkpoint', prevIds: ['a'] })).toBe(false);
		expect(snapshotValidator.parse({ ...base('b', users), prevIds: ['a'] })).toStrictEqual({
			success: false,
			data: null,
			errors: ["Field 'prevIds' of a base snapshot must not list a parent"],
		});
	});

	test('rejects malformed deltas', () => {
		const withDelta = (it: unknown) => ({ ...diff('b', ['a'], []), deltas: [it] });

		expect(valid(withDelta({ op: 'move', key: 'tables\0["public","users"]', set: {} }))).toBe(false);
		expect(valid(withDelta({ op: 'relocate', key: 'columns\0["public","users","id"]', set: { table: 'x' } }))).toBe(
			false,
		);
		expect(valid(withDelta({ op: 'drop', key: 42 }))).toBe(false);
		expect(valid(withDelta({ op: 'drop', key: 'tables["public","users"]' }))).toBe(false);
		expect(valid(withDelta({ op: 'drop', key: 'widgets\0["public","users"]' }))).toBe(false);
		expect(valid(withDelta({ op: 'create', row: { entityType: 'tables', schema: 'public' } }))).toBe(false);
		expect(valid(withDelta({ op: 'alter', key: 'tables\0["public","users"]', set: { color: 'red' } }))).toBe(false);
		expect(valid(withDelta({ op: 'rename', key: 'tables\0["public","users"]' }))).toBe(false);
	});

	test('rejects an instruction with an unknown entity type or field', () => {
		const withDelta = (it: unknown) => ({ ...diff('b', ['a'], []), deltas: [it] });

		const update = { op: 'update', type: 'columns', where: { table: 'users' }, set: { table: 'accounts' } };
		expect(valid(withDelta(update))).toBe(true);
		expect(valid(withDelta({ ...update, type: 'rows' }))).toBe(false);
		expect(valid(withDelta({ ...update, where: { tableName: 'users' } }))).toBe(false);
		expect(valid(withDelta({ ...update, where: { table: ['users'] } }))).toBe(false);
		expect(valid(withDelta({ ...update, set: {} }))).toBe(false);
		expect(valid(withDelta({ ...update, set: { tableName: 'accounts' } }))).toBe(false);

		const replace = { op: 'replace_in_list', type: 'pks', where: {}, field: 'columns', from: 'id', to: 'key' };
		expect(valid(withDelta(replace))).toBe(true);
		expect(valid(withDelta({ ...replace, field: 'name' }))).toBe(false);
		expect(valid(withDelta({ ...replace, field: 'cols' }))).toBe(false);
		expect(valid(withDelta({ ...replace, to: 1 }))).toBe(false);
		expect(valid(withDelta({ ...replace, type: 'indexes' }))).toBe(false);

		const items = {
			op: 'update_list_items',
			type: 'indexes',
			where: {},
			field: 'columns',
			match: { value: 'id', isExpression: false },
			set: { value: 'key' },
		};
		expect(valid(withDelta(items))).toBe(true);
		expect(valid(withDelta({ ...items, type: 'pks' }))).toBe(false);
		expect(valid(withDelta({ ...items, match: { name: 'id' } }))).toBe(false);
		expect(valid(withDelta({ ...items, set: { name: 'key' } }))).toBe(false);
		expect(valid(withDelta({ ...items, set: {} }))).toBe(false);
	});

	test('rejects a snapshot without statements, and a statement of an unknown kind', () => {
		const { statements: _, ...withoutStatements } = base('a', users);
		const renameTable = { type: 'rename_table', schema: 'public', from: 'users', to: 'accounts' };

		expect(valid(withoutStatements)).toBe(false);
		expect(valid({ ...base('a', users), stateHash: undefined })).toBe(false);
		expect(valid({ ...diff('b', ['a'], []), stateHash: 42 })).toBe(false);
		expect(valid({ ...diff('b', ['a'], []), statements: undefined })).toBe(false);
		expect(valid({ ...diff('b', ['a'], []), statements: [renameTable] })).toBe(true);
		expect(valid({ ...diff('b', ['a'], []), statements: [{ ...renameTable, type: 'paint_table' }] })).toBe(false);
		expect(valid({ ...diff('b', ['a'], []), statements: ['rename_table'] })).toBe(false);
	});

	test('rejects a diff with no parent', () => {
		expect(snapshotValidator.parse(diff('b', [], []))).toStrictEqual({
			success: false,
			data: null,
			errors: ["Field 'prevIds' of a diff snapshot must list at least one parent"],
		});
	});

	test('rejects a base with an invalid entity', () => {
		expect(valid({ ...base('a', users), ddl: [{ entityType: 'tables', name: 1 }] })).toBe(false);
	});
});
