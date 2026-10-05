import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { type Delta, delta } from 'src/dialects/dialect';
import { createDDL } from 'src/dialects/postgres/ddl';
import {
	type PostgresBaseSnapshot,
	type PostgresSnapshot,
	reconstruct,
	snapshotValidator,
	startingState,
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
});

const diff = (id: string, prevIds: string[], deltas: Delta[]): PostgresSnapshot => ({
	type: 'diff',
	version: '9',
	dialect: 'postgres',
	id,
	prevIds,
	deltas,
	statements: [],
});

const historyOf = (...snapshots: PostgresSnapshot[]) => new Map(snapshots.map((it) => [it.id, it]));

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

	test('in the combined state a create or a rename overwrites a taken key', () => {
		const history = historyOf(
			base('a', ddlOf('users', ['id'])),
			diff('b', ['a'], [
				{ op: 'create', row: { ...column('users', 'x'), type: 'text' } },
				{ op: 'rename', key: columnKey('users', 'id'), set: { name: 'key' } },
			]),
			diff('c', ['a'], [
				{ op: 'create', row: column('users', 'x') },
				{ op: 'create', row: { ...column('users', 'key'), notNull: true } },
			]),
			diff('d', ['c', 'b'], []),
		);
		const expected = ddlOf('users', ['key', 'x']);
		expected.columns.update({ set: { type: 'text' }, where: { name: 'x' } });

		expect(rows(reconstruct(history, 'd'))).toStrictEqual(rows(expected));
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
				for (const it of columns) {
					deltas.push({ op: 'relocate', key: columnKey(table, it.name), set: { table: renamed } });
				}
				tables.delete(table);
				tables.set(renamed, columns);
			}
			history.set(`s${idx}`, diff(`s${idx}`, [`s${idx - 1}`], deltas));
		}

		const started = performance.now();
		const rebuilt = reconstruct(history, 's999');
		const elapsed = performance.now() - started;

		expect(normalizeDDL(rebuilt.entities.list())).toStrictEqual(normalizeDDL(state()));
		console.info(`Rebuilt the last of 1000 snapshots in ${elapsed.toFixed(1)} ms`);
		expect(elapsed).toBeLessThan(1000);
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
			{ op: 'relocate', key: 'columns\0["public","users","id"]', set: { table: 'accounts' } },
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
		expect(valid(withDelta({ op: 'drop', key: 42 }))).toBe(false);
		expect(valid(withDelta({ op: 'drop', key: 'tables["public","users"]' }))).toBe(false);
		expect(valid(withDelta({ op: 'drop', key: 'widgets\0["public","users"]' }))).toBe(false);
		expect(valid(withDelta({ op: 'create', row: { entityType: 'tables', schema: 'public' } }))).toBe(false);
		expect(valid(withDelta({ op: 'alter', key: 'tables\0["public","users"]', set: { color: 'red' } }))).toBe(false);
		expect(valid(withDelta({ op: 'rename', key: 'tables\0["public","users"]' }))).toBe(false);
	});

	test('rejects a snapshot without statements, and a statement of an unknown kind', () => {
		const { statements: _, ...withoutStatements } = base('a', users);
		const renameTable = { type: 'rename_table', schema: 'public', from: 'users', to: 'accounts' };

		expect(valid(withoutStatements)).toBe(false);
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
