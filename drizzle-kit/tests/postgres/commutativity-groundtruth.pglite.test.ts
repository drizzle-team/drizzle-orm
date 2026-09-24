import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { postgresCommutativity } from 'src/dialects/postgres/commutativity';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import type { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type { DB } from 'src/utils';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mutations, PAIRS, parent } from './commutativity-fixtures';
import { diff, drizzleToDDL, prepareTestDatabase } from './mocks';

// ---------------------------------------------------------------------------
// Ground truth for commutativity, from a real database.
//
// Both models — the facet footprints and the structural deltas — are theories
// about which branches commute. This asks postgres instead.
//
// Two branches both author their SQL against the fork, exactly as two developers
// would. A database then applies both. They commute if and only if BOTH orders
// succeed AND land on the same schema. Anything else — an error in either order,
// or two different final schemas — means they do not.
//
// That is the definition the facet model is written against ("replaying the
// reference in the wrong order fails"), so it is the right oracle for it.
// ---------------------------------------------------------------------------

type Outcome = { ok: true; hash: string } | { ok: false; error: string };

let db: DB;
let clear: () => Promise<void>;

const ddlOf = (schema: any) => drizzleToDDL(schema).ddl.entities.list();

const introspectHash = async (): Promise<string> => {
	const filter = prepareEntityFilter('postgresql', {
		tables: [],
		schemas: ['public', 'archive'],
		entities: undefined,
		extensions: [],
	}, []);
	const schema = await fromDatabaseForDrizzle(db, filter, () => true, {
		schema: 'drizzle',
		table: '__drizzle_migrations',
	});
	const { ddl } = interimToDDL(schema);
	// Canonical text of the introspected entities: order- and key-order-independent.
	return JSON.stringify(
		ddl.entities.list().map((e: any) =>
			JSON.stringify(Object.fromEntries(Object.entries(e).sort(([a], [b]) => a.localeCompare(b))))
		).sort(),
	);
};

/** Apply `first` then `second`, both authored against the fork, and report where we land. */
const applyBoth = async (parentSql: string[], first: string[], second: string[]): Promise<Outcome> => {
	await clear();
	try {
		for (const sql of [...parentSql, ...first, ...second]) await db.query(sql);
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message.split('\n')[0]! : String(e) };
	}
	return { ok: true, hash: await introspectHash() };
};

const sqlCache = new Map<string, string[]>();
const sqlFor = async (name: string): Promise<string[]> => {
	if (!sqlCache.has(name)) sqlCache.set(name, (await diff(parent, mutations[name], [])).sqlStatements);
	return sqlCache.get(name)!;
};

let parentSql: string[] = [];
const truth = new Map<string, { commutes: boolean; why: string }>();
const facet = new Map<string, boolean>();

beforeAll(async () => {
	const prepared = await prepareTestDatabase();
	db = prepared.db;
	clear = prepared.clear;

	parentSql = (await diff({}, parent, [])).sqlStatements;

	const parentSnapshot = {
		version: '8',
		dialect: 'postgres',
		id: 'p',
		prevIds: [],
		ddl: ddlOf(parent),
		renames: [],
	} as unknown as PostgresSnapshot;

	for (const { a, b, name } of PAIRS) {
		const [sa, sb] = [await sqlFor(a), await sqlFor(b)];

		const ab = await applyBoth(parentSql, sa, sb);
		const ba = await applyBoth(parentSql, sb, sa);

		let commutes: boolean;
		let why: string;
		if (!ab.ok || !ba.ok) {
			commutes = false;
			why = `sql failed: ${(!ab.ok ? ab.error : (ba as any).error)}`;
		} else if (ab.hash !== ba.hash) {
			commutes = false;
			why = 'both orders succeed but land on DIFFERENT schemas';
		} else {
			commutes = true;
			why = 'both orders succeed, same schema';
		}
		truth.set(name, { commutes, why });

		const stA = (await diff(parent, mutations[a], [])).statements;
		const stB = (await diff(parent, mutations[b], [])).statements;
		facet.set(name, !!(await postgresCommutativity.getReasonsFromStatements(stA, stB, parentSnapshot)));
	}
}, 600_000);

afterAll(async () => {
	await clear?.();
});

describe('facet model vs a real database', () => {
	test('report', () => {
		const rows = PAIRS.map(({ name }) => {
			const t = truth.get(name)!;
			const modelSaysConflict = facet.get(name)!;
			// The model reports conflicts; the database reports commutativity.
			const agree = modelSaysConflict === !t.commutes;
			return {
				name,
				agree,
				model: modelSaysConflict ? 'conflict' : 'commutes',
				db: t.commutes ? 'commutes' : 'conflict',
				why: t.why,
			};
		});

		const wrong = rows.filter((r) => !r.agree);
		const falseNegative = wrong.filter((r) => r.model === 'commutes'); // model says fine, db disagrees — DANGEROUS
		const falsePositive = wrong.filter((r) => r.model === 'conflict'); // model over-reports — merely annoying

		// eslint-disable-next-line no-console
		console.log(
			`\n@@ ${PAIRS.length} pairs against real postgres\n`
				+ `@@   agree            : ${rows.length - wrong.length}\n`
				+ `@@   false NEGATIVES  : ${falseNegative.length}   (model says commutes, database disagrees)\n`
				+ `@@   false positives  : ${falsePositive.length}   (model over-reports)\n`
				+ falseNegative.map((r) => `@@     [FN] ${r.name.padEnd(46)} ${r.why}`).join('\n')
				+ (falseNegative.length ? '\n' : '')
				+ falsePositive.map((r) => `@@     [fp] ${r.name.padEnd(46)} ${r.why}`).join('\n')
				+ '\n',
		);
		expect(rows.length).toBe(PAIRS.length);
	});
});

describe('the squash false negative, against a real database', () => {
	// Branch A does and undoes: two migrations, so its fork->leaf diff is empty and
	// `detectNonCommutative` sees no statements at all. Branch B adds the same column.
	// Concatenating A's steps says conflict; the squashed fork->leaf diff says commute.
	const fork = { users: pgTable('users', { id: integer('id') }) };
	const addX = { users: pgTable('users', { id: integer('id'), x: varchar('x') }) };

	test('postgres rejects the order the squashed diff calls commutative', async () => {
		const forkSql = (await diff({}, fork, [])).sqlStatements;
		const a1 = (await diff(fork, addX, [])).sqlStatements; // add x
		const a2 = (await diff(addX, fork, [])).sqlStatements; // drop x
		const b = (await diff(fork, addX, [])).sqlStatements; // add x

		// order B -> A : B adds x, then A's first migration adds x again
		await clear();
		let error: string | null = null;
		try {
			for (const sql of [...forkSql, ...b, ...a1, ...a2]) await db.query(sql);
		} catch (e) {
			error = e instanceof Error ? e.message.split('\n')[0]! : String(e);
		}

		// eslint-disable-next-line no-console
		console.log(`\n@@ squash case — replaying B then A on postgres: ${error ?? 'SUCCEEDED (no conflict)'}\n`);
		expect(error, 'postgres must reject adding the same column twice').not.toBeNull();
	});
});
