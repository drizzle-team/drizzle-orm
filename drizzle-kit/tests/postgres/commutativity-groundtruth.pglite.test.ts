import { sql } from 'drizzle-orm';
import { integer, pgEnum, pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import { postgresCommutativity } from 'src/dialects/postgres/commutativity';
import { fromJson, toSnapshotStatements } from 'src/dialects/postgres/convertor';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type { DB } from 'src/utils';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mutations, PAIRS, parent } from './commutativity-fixtures';
import matrixData from './commutativity-matrix.json';
import { build } from './commutativity-statements';
import { diff, prepareTestDatabase } from './mocks';

// Two branches commute only if postgres applies them in both orders and both
// orders end at the same schema.

type Outcome = { ok: true; hash: string } | { ok: false; error: string };

let db: DB;
let clear: () => Promise<void>;

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
		facet.set(
			name,
			!!(await postgresCommutativity.getReasonsFromStatements(toSnapshotStatements(stA), toSnapshotStatements(stB))),
		);
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
		expect(falseNegative.map((r) => r.name), 'pairs that the rules call commutative and postgres rejects').toEqual([]);
	});
});

describe('the same change on two branches, against a real database', () => {
	const t = (id: any) => ({ t: pgTable('t', { id }) });
	// Each of these changes of one column fails on the second run, so the rules must report the same change
	// on two branches as a conflict.
	const cases = {
		'an identity is added': [t(integer().notNull()), t(integer().generatedAlwaysAsIdentity())],
		'an identity is dropped': [t(integer().generatedAlwaysAsIdentity()), t(integer().notNull())],
		'a generated expression is dropped': [t(integer().generatedAlwaysAs(sql`1`)), t(integer())],
		'an integer becomes a serial': [t(integer().notNull()), t(serial())],
		'a serial becomes an integer': [t(serial()), t(integer().notNull())],
	};

	test.each(Object.entries(cases))('%s: the SQL fails on the second run, and the rules report a conflict', async (
		_,
		[from, to],
	) => {
		const base = (await diff({}, from, [])).sqlStatements;
		const { sqlStatements, statements } = await diff(from, to, []);
		const stored = toSnapshotStatements(statements);

		expect(stored.map((it) => it.type)).toStrictEqual(['alter_column']);
		expect(await applyBoth(base, sqlStatements, [])).toMatchObject({ ok: true });
		expect(await applyBoth(base, sqlStatements, sqlStatements)).toMatchObject({ ok: false });
		expect(await postgresCommutativity.getReasonsFromStatements(stored, structuredClone(stored))).toBeDefined();
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

// Two branches change one column each. The statements and the SQL come from the real diff.
describe('changes of one column on two branches vs a real database', () => {
	const mood = pgEnum('mood', ['ok', 'sad']);
	const feeling = pgEnum('feeling', ['ok', 'sad']);
	// The diff drops an enum and creates it again when a value is removed.
	const moodWithoutSad = pgEnum('mood', ['ok']);
	const t = (column: Record<string, any>, extra: Record<string, unknown> = {}) => ({
		...extra,
		t: pgTable('t', column),
	});
	const expression = sql`'x'`;
	const renameMood = ['public.mood->public.feeling'];

	// `rules` and `postgres` say whether the two changes commute.
	const cases: {
		name: string;
		base: Record<string, unknown>;
		a: Record<string, unknown>;
		b: Record<string, unknown>;
		renames?: string[];
		rules: boolean;
		postgres: boolean;
	}[] = [
		{
			name: 'NOT NULL and the default',
			base: t({ c: varchar() }),
			a: t({ c: varchar().notNull() }),
			b: t({ c: varchar().default('x') }),
			rules: true,
			postgres: true,
		},
		{
			name: 'NOT NULL and the type',
			base: t({ c: varchar() }),
			a: t({ c: varchar().notNull() }),
			b: t({ c: text() }),
			rules: true,
			postgres: true,
		},
		{
			name: 'two values of the default',
			base: t({ c: varchar() }),
			a: t({ c: varchar().default('x') }),
			b: t({ c: varchar().default('y') }),
			rules: false,
			postgres: false,
		},
		{
			name: 'the default and the type',
			base: t({ c: varchar() }),
			a: t({ c: varchar().default('5') }),
			b: t({ c: integer() }),
			rules: false,
			postgres: false,
		},
		{
			name: 'NOT NULL and the identity',
			base: t({ n: integer().notNull() }),
			a: t({ n: integer() }),
			b: t({ n: integer().generatedAlwaysAsIdentity() }),
			rules: false,
			postgres: false,
		},
		{
			name: 'the default and the identity',
			base: t({ n: integer().notNull() }),
			a: t({ n: integer().notNull().default(1) }),
			b: t({ n: integer().generatedAlwaysAsIdentity() }),
			rules: false,
			postgres: false,
		},
		{
			name: 'the type and the identity',
			base: t({ n: integer().notNull() }),
			a: t({ n: text().notNull() }),
			b: t({ n: integer().generatedAlwaysAsIdentity() }),
			rules: false,
			postgres: false,
		},
		{
			name: 'NOT NULL and a dropped generation expression',
			base: t({ g: varchar().notNull().generatedAlwaysAs(expression) }),
			a: t({ g: varchar().generatedAlwaysAs(expression) }),
			b: t({ g: varchar().notNull() }),
			rules: true,
			postgres: true,
		},
		{
			name: 'NOT NULL on a column of an enum type and a rename of the enum',
			base: t({ c: mood() }, { mood }),
			a: t({ c: mood().notNull() }, { mood }),
			b: t({ c: feeling() }, { feeling }),
			renames: renameMood,
			rules: true,
			postgres: true,
		},
		{
			name: 'the default of a column of an enum type and a rename of the enum',
			base: t({ c: mood() }, { mood }),
			a: t({ c: mood().default('ok') }, { mood }),
			b: t({ c: feeling() }, { feeling }),
			renames: renameMood,
			rules: false,
			postgres: false,
		},
		{
			name: 'a type change to an enum type and a rename of the enum',
			base: t({ c: varchar() }, { mood }),
			a: t({ c: mood() }, { mood }),
			b: t({ c: varchar() }, { feeling }),
			renames: renameMood,
			rules: false,
			postgres: false,
		},
		{
			name: 'NOT NULL on a column of an enum type and a removed value of the enum',
			base: t({ c: mood() }, { mood }),
			a: t({ c: mood().notNull() }, { mood }),
			b: t({ c: moodWithoutSad() }, { mood: moodWithoutSad }),
			rules: true,
			postgres: true,
		},
		{
			name: 'a type change from an enum type to another enum type and a removed value of the first enum',
			base: t({ c: mood() }, { mood }),
			a: t({ c: feeling() }, { mood, feeling }),
			b: t({ c: moodWithoutSad() }, { mood: moodWithoutSad }),
			rules: false,
			postgres: false,
		},
		{
			name: 'a type change from an enum type to text and a removed value of the enum',
			base: t({ c: mood() }, { mood }),
			a: t({ c: text() }, { mood }),
			b: t({ c: moodWithoutSad() }, { mood: moodWithoutSad }),
			rules: false,
			postgres: false,
		},
	];

	test.each(cases)('$name', async ({ base, a, b, renames = [], rules, postgres }) => {
		const baseSql = (await diff({}, base, [])).sqlStatements;
		const left = await diff(base, a, []);
		const right = await diff(base, b, renames);

		const ab = await applyBoth(baseSql, left.sqlStatements, right.sqlStatements);
		const ba = await applyBoth(baseSql, right.sqlStatements, left.sqlStatements);
		const found = await postgresCommutativity.getReasonsFromStatements(
			toSnapshotStatements(left.statements),
			toSnapshotStatements(right.statements),
		);

		expect({ rules: !found, postgres: ab.ok && ba.ok && ab.hash === ba.hash }).toStrictEqual({ rules, postgres });
	});
});

// One statement pair per matrix cell. Each cell runs the SQL that the convertor emits
// for the statements that the matrix is built from. The shared base of a pair holds
// the objects that either statement needs.
const sqlOf = (type: string) => fromJson([build(type)]).sqlStatements;

const baseObjects = {
	schema: sqlOf('create_schema'),
	targetSchema: [`CREATE SCHEMA "s_new";`],
	table: sqlOf('create_table'),
	rls: sqlOf('alter_rls'),
	column: sqlOf('add_column'),
	referencedTable: [`CREATE TABLE "s"."t2" ("c2" varchar PRIMARY KEY);`],
	index: sqlOf('create_index'),
	pk: sqlOf('add_pk'),
	fk: sqlOf('create_fk'),
	unique: sqlOf('add_unique'),
	check: sqlOf('add_check'),
	enum: sqlOf('create_enum'),
	enumColumn: sqlOf('add_column:enum'),
	sequence: sqlOf('create_sequence'),
	view: sqlOf('create_view'),
	policy: sqlOf('create_policy'),
	role: sqlOf('create_role'),
	privilege: sqlOf('grant_privilege'),
};
type BaseObject = keyof typeof baseObjects;

const onTable = ['schema', 'table'] as const;
const onColumn = [...onTable, 'column'] as const;

const needs: Record<string, readonly BaseObject[]> = {
	create_table: ['schema'],
	'create_table:enum': ['schema', 'enum'],
	'create_table:ix': ['schema'],
	drop_table: onTable,
	rename_table: onTable,
	move_table: [...onTable, 'targetSchema'],
	add_column: onTable,
	'add_column:enum': [...onTable, 'enum'],
	drop_column: onColumn,
	alter_column: onColumn,
	'alter_column:default': onColumn,
	'alter_column:type': onColumn,
	'alter_column:enum_not_null': [...onTable, 'enum', 'enumColumn'],
	'alter_column:enum_default': [...onTable, 'enum', 'enumColumn'],
	recreate_column: onColumn,
	rename_column: onColumn,
	create_index: onColumn,
	drop_index: [...onColumn, 'index'],
	rename_index: [...onColumn, 'index'],
	recreate_index: [...onColumn, 'index'],
	add_pk: onColumn,
	drop_pk: [...onColumn, 'pk'],
	'drop_pk:target': ['schema', 'referencedTable'],
	alter_pk: [...onColumn, 'pk'],
	create_fk: [...onColumn, 'referencedTable'],
	drop_fk: [...onColumn, 'referencedTable', 'fk'],
	recreate_fk: [...onColumn, 'referencedTable', 'fk'],
	add_unique: onColumn,
	drop_unique: [...onColumn, 'unique'],
	alter_unique: [...onColumn, 'unique'],
	add_check: onColumn,
	'add_check:uq': onColumn,
	drop_check: [...onColumn, 'check'],
	alter_check: [...onColumn, 'check'],
	'rename_constraint:pks': [...onColumn, 'pk'],
	'rename_constraint:uniques': [...onColumn, 'unique'],
	'rename_constraint:checks': [...onColumn, 'check'],
	'rename_constraint:fks': [...onColumn, 'referencedTable', 'fk'],
	create_enum: ['schema'],
	drop_enum: ['schema', 'enum'],
	rename_enum: ['schema', 'enum'],
	alter_enum: ['schema', 'enum'],
	recreate_enum: ['schema', 'enum'],
	'recreate_enum:column': [...onTable, 'enum', 'enumColumn'],
	move_enum: ['schema', 'targetSchema', 'enum'],
	create_schema: [],
	drop_schema: ['schema'],
	rename_schema: ['schema'],
	create_sequence: ['schema'],
	drop_sequence: ['schema', 'sequence'],
	rename_sequence: ['schema', 'sequence'],
	alter_sequence: ['schema', 'sequence'],
	move_sequence: ['schema', 'targetSchema', 'sequence'],
	create_view: ['schema'],
	drop_view: ['schema', 'view'],
	rename_view: ['schema', 'view'],
	alter_view: ['schema', 'view'],
	move_view: ['schema', 'targetSchema', 'view'],
	create_policy: onTable,
	'create_policy:role': [...onTable, 'role'],
	drop_policy: [...onTable, 'policy'],
	rename_policy: [...onTable, 'policy'],
	alter_policy: [...onTable, 'policy'],
	recreate_policy: [...onTable, 'policy'],
	alter_rls: onTable,
	'alter_rls:disable': [...onTable, 'rls'],
	create_role: [],
	drop_role: ['role'],
	rename_role: ['role'],
	alter_role: ['role'],
	grant_privilege: [...onTable, 'role'],
	'grant_privilege:insert': [...onTable, 'role'],
	revoke_privilege: [...onTable, 'role', 'privilege'],
	regrant_privilege: [...onTable, 'role', 'privilege'],
};

const unenforcedPolicy =
	'both orders give a policy on a table without row level security, so postgres does not enforce the policy';
// Cells where the rules report a conflict that postgres accepts. Keys are `row x column` in matrix order.
const knownExceptions: Record<string, string> = {
	'alter_column:default x alter_column:type':
		'a type change converts the default, and the rules do not know that the conversion from varchar to text keeps it',
	'create_policy x alter_rls:disable': unenforcedPolicy,
	'create_policy:role x alter_rls:disable': unenforcedPolicy,
};

// Everything a pair can change, as sorted text. Column order is left out, because
// two branches that add columns in a different order still hold the same schema.
const fingerprint = async (): Promise<string> => {
	const [{ facts }] = await db.query<{ facts: string }>(`
		WITH ns AS (SELECT oid, nspname FROM pg_namespace WHERE nspname IN ('s', 's_new'))
		SELECT coalesce(json_agg(fact ORDER BY fact), '[]')::text AS facts FROM (
			SELECT 'schema ' || nspname FROM ns
			UNION ALL
			SELECT format('relation %s.%s kind=%s rls=%s acl=%s options=%s', ns.nspname, c.relname, c.relkind,
				c.relrowsecurity, c.relacl, c.reloptions)
			FROM pg_class c JOIN ns ON ns.oid = c.relnamespace
			UNION ALL
			SELECT format('column %s.%s.%s %s notnull=%s default=%s', ns.nspname, c.relname, a.attname,
				format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid))
			FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN ns ON ns.oid = c.relnamespace
			LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
			WHERE a.attnum > 0 AND NOT a.attisdropped
			UNION ALL
			SELECT format('constraint %s.%s %s', ns.nspname, co.conname, pg_get_constraintdef(co.oid))
			FROM pg_constraint co JOIN ns ON ns.oid = co.connamespace
			UNION ALL
			SELECT 'index ' || pg_get_indexdef(i.indexrelid)
			FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN ns ON ns.oid = c.relnamespace
			UNION ALL
			SELECT format('enum %s.%s %s', ns.nspname, t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder))
			FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN ns ON ns.oid = t.typnamespace
			GROUP BY ns.nspname, t.typname
			UNION ALL
			SELECT format('view %s.%s %s', ns.nspname, c.relname, pg_get_viewdef(c.oid))
			FROM pg_class c JOIN ns ON ns.oid = c.relnamespace WHERE c.relkind = 'v'
			UNION ALL
			SELECT format('sequence %s.%s %s %s %s %s', ns.nspname, c.relname, sq.seqincrement, sq.seqstart, sq.seqmin, sq.seqmax)
			FROM pg_sequence sq JOIN pg_class c ON c.oid = sq.seqrelid JOIN ns ON ns.oid = c.relnamespace
			UNION ALL
			SELECT format('policy %s.%s.%s %s %s %s %s %s', schemaname, tablename, policyname, permissive, roles, cmd, qual,
				with_check)
			FROM pg_policies WHERE schemaname IN ('s', 's_new')
			UNION ALL
			SELECT format('role %s createdb=%s', rolname, rolcreatedb) FROM pg_roles WHERE rolname IN ('r', 'r_new')
		) AS facts(fact)`);
	return facts;
};

type Run = { ok: true; schema: string } | { ok: false; error: string };

const run = async (sql: string[]): Promise<Run> => {
	await clear();
	try {
		for (const statement of sql) await db.query(statement);
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message.split('\n').filter(Boolean).at(-1)! : String(e) };
	}
	return { ok: true, schema: await fingerprint() };
};

const baseFor = (...types: string[]) =>
	(Object.keys(baseObjects) as BaseObject[])
		.filter((object) => types.some((type) => needs[type]!.includes(object)))
		.flatMap((object) => baseObjects[object]);

describe('matrix cells vs a real database', () => {
	const { types, matrix, impossible } = matrixData;

	test('every matrix statement applies to its own base', async () => {
		expect(Object.keys(needs).sort()).toEqual([...types].sort());
		const failed: string[] = [];
		for (const type of types) {
			const result = await run([...baseFor(type), ...sqlOf(type)]);
			if (!result.ok) failed.push(`${type}: ${result.error}`);
		}
		expect(failed).toEqual([]);
	});

	test('rules agree with postgres on every possible cell', async () => {
		const mismatches: Record<string, string> = {};
		for (let i = 0; i < types.length; i++) {
			for (let j = i; j < types.length; j++) {
				if (impossible[i]![j] || impossible[j]![i]) continue;
				const [a, b] = [types[i]!, types[j]!];
				const base = baseFor(a, b);
				const ab = await run([...base, ...sqlOf(a), ...sqlOf(b)]);
				const ba = await run([...base, ...sqlOf(b), ...sqlOf(a)]);

				const why = !ab.ok
					? `${a} then ${b} fails: ${ab.error}`
					: !ba.ok
					? `${b} then ${a} fails: ${ba.error}`
					: ab.schema !== ba.schema
					? 'both orders succeed with different schemas'
					: 'both orders succeed with the same schema';
				const postgresCommutes = ab.ok && ba.ok && ab.schema === ba.schema;
				const rulesCommute = !matrix[i]![j] && !matrix[j]![i];
				if (postgresCommutes === rulesCommute) continue;
				// The shared base holds what both statements need. When one statement fails on it without the
				// other, no real folder has this pair. An example is a drop of an enum that a column of the
				// other statement uses.
				if (rulesCommute && !((await run([...base, ...sqlOf(a)])).ok && (await run([...base, ...sqlOf(b)])).ok)) {
					continue;
				}
				mismatches[`${a} x ${b}`] = `rules say ${rulesCommute ? 'commute' : 'conflict'}, postgres: ${why}`;
			}
		}

		const unexpected = Object.entries(mismatches).filter(([cell]) => !knownExceptions[cell]).map(([cell, why]) =>
			`${cell}: ${why}`
		);
		const stale = Object.keys(knownExceptions).filter((cell) => !mismatches[cell]);
		expect(unexpected, 'cells where postgres and the rules disagree').toEqual([]);
		expect(stale, 'known exceptions that postgres and the rules now agree on').toEqual([]);
	}, 300_000);
});
