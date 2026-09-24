import { index, integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { postgresCommutativity } from 'src/dialects/postgres/commutativity';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { drySnapshot, type PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type { DB } from 'src/utils';
import { beforeAll, describe, expect, test } from 'vitest';
import { diff, prepareTestDatabase } from './mocks';

// ---------------------------------------------------------------------------
// The facet model's rename handling, against a real database.
//
// This is the part of buildFacetPaths that has never run. `diffSnapshots` calls
// `ddlDiffDry`, which hands every resolver an EMPTY rename set, so no rename ever
// reaches the model — every rename arrives as drop+create. The `rename_*` and
// `move_*` cases, and the whole `n|` (name) vs `e|` (existence) distinction that
// makes the model exact rather than conservative, are unreachable today.
//
// Persisting statements makes them live. So: do they agree with postgres?
//
// The claim under test is that a rename differs from drop+create for exactly one
// class of neighbour — cascade dependents, which survive a rename but die with a
// drop. Every scenario below is run BOTH ways so the difference is visible.
// ---------------------------------------------------------------------------

const RENAME = 'public.users.email->public.users.mail';

const fork = {
	users: pgTable('users', { id: integer('id'), email: varchar('email') }, (t) => [index('users_email_ix').on(t.email)]),
};
const renamed = {
	users: pgTable('users', { id: integer('id'), mail: varchar('mail') }, (t) => [index('users_email_ix').on(t.mail)]),
};

/** Branch B options, each authored against the fork (so each still says "email"). */
const others: Record<string, any> = {
	'drop index on email': {
		users: pgTable('users', { id: integer('id'), email: varchar('email') }),
	},
	'alter email notNull': {
		users: pgTable('users', { id: integer('id'), email: varchar('email').notNull() }, (t) => [
			index('users_email_ix').on(t.email),
		]),
	},
	'add index on email': {
		users: pgTable('users', { id: integer('id'), email: varchar('email') }, (t) => [
			index('users_email_ix').on(t.email),
			index('users_email_ix2').on(t.email),
		]),
	},
	'add unrelated col': {
		users: pgTable('users', { id: integer('id'), email: varchar('email'), age: integer('age') }, (t) => [
			index('users_email_ix').on(t.email),
		]),
	},
};

let db: DB;
let clear: () => Promise<void>;

const introspectHash = async (): Promise<string> => {
	const filter = prepareEntityFilter('postgresql', {
		tables: [],
		schemas: ['public'],
		entities: undefined,
		extensions: [],
	}, []);
	const schema = await fromDatabaseForDrizzle(db, filter, () => true, {
		schema: 'drizzle',
		table: '__drizzle_migrations',
	});
	const { ddl } = interimToDDL(schema);
	return JSON.stringify(
		ddl.entities.list().map((e: any) =>
			JSON.stringify(Object.fromEntries(Object.entries(e).sort(([a], [b]) => a.localeCompare(b))))
		).sort(),
	);
};

const run = async (setup: string[], first: string[], second: string[]) => {
	await clear();
	try {
		for (const sql of [...setup, ...first, ...second]) await db.query(sql);
	} catch (e) {
		return { ok: false as const, error: e instanceof Error ? e.message.split('\n')[0]! : String(e) };
	}
	return { ok: true as const, hash: await introspectHash() };
};

type Row = { name: string; asRename: string; asDropCreate: string; dbRename: string; dbDropCreate: string };
const rows: Row[] = [];

beforeAll(async () => {
	const prepared = await prepareTestDatabase();
	db = prepared.db;
	clear = prepared.clear;

	const setup = (await diff({}, fork, [])).sqlStatements;
	const forkSnapshot = {
		version: '8',
		dialect: 'postgres',
		id: 'p',
		prevIds: [],
		ddl: [],
		renames: [],
	} as unknown as PostgresSnapshot;

	// Branch A, two ways of expressing the same intent.
	const asRename = await diff(fork, renamed, [RENAME]); // rename answered  -> rename_column
	const asDropCreate = await diff(fork, renamed, []); // rename set empty -> drop+create

	for (const [name, other] of Object.entries(others)) {
		const B = await diff(fork, other, []);

		const verdict = async (A: { statements: any[] }) =>
			!!(await postgresCommutativity.getReasonsFromStatements(A.statements, B.statements, forkSnapshot ?? drySnapshot));

		const truth = async (A: { sqlStatements: string[] }) => {
			const ab = await run(setup, A.sqlStatements, B.sqlStatements);
			const ba = await run(setup, B.sqlStatements, A.sqlStatements);
			if (!ab.ok) return `conflict (A→B failed: ${ab.error.slice(0, 44)})`;
			if (!ba.ok) return `conflict (B→A failed: ${ba.error.slice(0, 44)})`;
			return ab.hash === ba.hash ? 'commutes' : 'conflict (different schemas)';
		};

		rows.push({
			name,
			asRename: (await verdict(asRename)) ? 'conflict' : 'commutes',
			asDropCreate: (await verdict(asDropCreate)) ? 'conflict' : 'commutes',
			dbRename: await truth(asRename),
			dbDropCreate: await truth(asDropCreate),
		});
	}
}, 600_000);

describe('rename facets vs a real database', () => {
	test('report', () => {
		const line = (r: Row) =>
			`@@   ${r.name.padEnd(22)} | rename: model=${r.asRename.padEnd(9)} db=${r.dbRename.padEnd(46)}`
			+ `| drop+create: model=${r.asDropCreate.padEnd(9)} db=${r.dbDropCreate}`;
		// eslint-disable-next-line no-console
		console.log('\n' + rows.map(line).join('\n') + '\n');
		expect(rows.length).toBe(Object.keys(others).length);
	});

	test('the model never says commutes where postgres disagrees', () => {
		// Only the rename side is assertable. The drop+create side is contaminated: the
		// migration drizzle generates for it is INVALID on its own — `drop_column`
		// cascades the index away and then `recreate_index` issues a `DROP INDEX` for
		// an index that is already gone. So every drop+create pair "conflicts" with
		// everything, including branches it never touches, and that says nothing about
		// commutativity. See `recreate_index emits DROP INDEX after drop_column`.
		const bad = rows.filter((r) => r.asRename === 'commutes' && r.dbRename !== 'commutes')
			.map((r) => `rename ∥ ${r.name}: ${r.dbRename}`);
		expect(bad, 'false negatives — model says commutes, database disagrees').toStrictEqual([]);
	});

	test('a rename commutes with dropping an index on the renamed column; drop+create does not', () => {
		// The `n|` vs `e|` distinction, which has never executed in production because
		// `ddlDiffDry` empties the rename set. Postgres follows a rename for an index
		// but cascades it away on a drop, which is exactly what the model claims.
		const row = rows.find((r) => r.name === 'drop index on email')!;
		expect(row.asRename).toBe('commutes');
		expect(row.dbRename).toBe('commutes');
		expect(row.asDropCreate).toBe('conflict');
	});
});
