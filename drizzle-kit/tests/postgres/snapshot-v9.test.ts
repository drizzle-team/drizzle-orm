import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { delta } from 'src/dialects/dialect';
import { createDDL } from 'src/dialects/postgres/ddl';
import { forkPoint, type PostgresSnapshotFile, reconstruct } from 'src/dialects/postgres/snapshot-v9';
import { describe, expect, test } from 'vitest';

// Build a minimal pg DDL: `public` schema + one table with the given columns.
const ddlOf = (table: string, cols: string[]) => {
	const d = createDDL();
	d.schemas.push({ name: 'public' });
	d.tables.push({ schema: 'public', name: table, isRlsEnabled: false });
	for (const c of cols) {
		d.columns.push({ schema: 'public', table, name: c, type: 'integer', notNull: false, dimensions: 0 });
	}
	return d;
};
// Canonical rows, for exact state comparison (no hashing).
const rows = (d: ReturnType<typeof createDDL>) => normalizeDDL(d.entities.list());

const base = (id: string, prevIds: string[], d: ReturnType<typeof createDDL>): PostgresSnapshotFile => ({
	type: 'base',
	version: '9',
	dialect: 'postgres',
	id,
	prevIds,
	ddl: d.entities.list(),
});

// The anchor is derived from prevIds (forkPoint), so a diff no longer stores `basedOn`.
// `statements` are irrelevant to reconstruct (state comes from deltas), so [] here.
const diff = (
	id: string,
	prevIds: string[],
	from: ReturnType<typeof createDDL>,
	to: ReturnType<typeof createDDL>,
): PostgresSnapshotFile => ({
	type: 'diff',
	version: '9',
	dialect: 'postgres',
	id,
	prevIds,
	deltas: delta(from, to),
	statements: [],
});

describe('v9 reconstruct', () => {
	test('walks base -> diff -> diff and reproduces each state', () => {
		const s0 = ddlOf('users', ['id']);
		const s1 = ddlOf('users', ['id', 'email']);
		const s2 = ddlOf('users', ['id', 'email', 'age']);

		const files = new Map<string, PostgresSnapshotFile>([
			['a', base('a', [], s0)],
			['b', diff('b', ['a'], s0, s1)],
			['c', diff('c', ['b'], s1, s2)],
		]);

		expect(reconstruct(files, 'a')).not.toBe(undefined);
		expect(normalizeDDL(reconstruct(files, 'a').entities.list())).toStrictEqual(rows(s0));
		expect(normalizeDDL(reconstruct(files, 'b').entities.list())).toStrictEqual(rows(s1));
		expect(normalizeDDL(reconstruct(files, 'c').entities.list())).toStrictEqual(rows(s2));
	});

	test('memoizes without corrupting shared ancestors', () => {
		const s0 = ddlOf('users', ['id']);
		const s1 = ddlOf('users', ['id', 'x']);
		const s2 = ddlOf('users', ['id', 'y']);
		// two children off the same base
		const files = new Map<string, PostgresSnapshotFile>([
			['a', base('a', [], s0)],
			['b', diff('b', ['a'], s0, s1)],
			['c', diff('c', ['a'], s0, s2)],
		]);
		const memo = new Map();
		expect(normalizeDDL(reconstruct(files, 'b', memo).entities.list())).toStrictEqual(rows(s1));
		expect(normalizeDDL(reconstruct(files, 'c', memo).entities.list())).toStrictEqual(rows(s2));
		// base still intact after both children reconstructed from the memoized copy
		expect(normalizeDDL(reconstruct(files, 'a', memo).entities.list())).toStrictEqual(rows(s0));
	});

	test('a torn delta (missing target) fails loudly via apply', () => {
		// a diff that drops a column the base does not have -> apply throws
		const s0 = ddlOf('users', ['id']);
		const s1 = ddlOf('users', ['id', 'email']);
		const torn = diff('b', ['a'], s1, s0); // deltas expect `email` to exist...
		const files = new Map<string, PostgresSnapshotFile>([['a', base('a', [], s0)], ['b', torn]]); // ...but base 'a' has no email
		expect(() => reconstruct(files, 'b')).toThrow(/missing entity/);
	});

	test('a diff with a broken basedOn chain fails loudly', () => {
		const s0 = ddlOf('users', ['id']);
		const s1 = ddlOf('users', ['id', 'email']);
		const files = new Map<string, PostgresSnapshotFile>([['b', diff('b', ['a'], s0, s1)]]); // no 'a'
		expect(() => reconstruct(files, 'b')).toThrow(/no reconstructable anchor/);
	});
});

describe('v9 forkPoint (merge anchor)', () => {
	test('diamond returns the lowest common ancestor', () => {
		//   a → b ↘
		//         d
		//   a → c ↗
		const byId = new Map<string, { prevIds: string[] }>([
			['a', { prevIds: [] }],
			['b', { prevIds: ['a'] }],
			['c', { prevIds: ['a'] }],
			['d', { prevIds: ['b', 'c'] }],
		]);
		expect(forkPoint(byId, ['b', 'c'])).toBe('a');
	});

	test('null when parents share no real ancestor', () => {
		const byId = new Map<string, { prevIds: string[] }>([
			['a', { prevIds: [] }],
			['b', { prevIds: [] }],
		]);
		expect(forkPoint(byId, ['a', 'b'])).toBeNull();
	});
});
