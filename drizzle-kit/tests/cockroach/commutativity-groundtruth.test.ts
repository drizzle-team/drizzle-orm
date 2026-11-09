import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool, type PoolClient } from 'pg';
import { cockroachCommutativity } from 'src/dialects/cockroach/commutativity';
import { fromJson } from 'src/dialects/cockroach/convertor';
import { interimToDDL } from 'src/dialects/cockroach/ddl';
import { fromDatabaseForDrizzle } from 'src/dialects/cockroach/introspect';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type { DB } from 'src/utils';
import { afterAll, beforeAll, expect, test } from 'vitest';
import matrixData from './cockroach-commutativity-matrix.json';
import { build, footprintsOfStatements, type NeededObject, rows } from './commutativity-catalog';
import { createCockroachFolderFlow, schemaObject } from './folder-flow';
import { drizzleToDDL } from './mocks';

// Verifies the cockroach footprint rules against a real cockroach server. A pair of branches commutes when the
// server runs their SQL in both orders and both orders end at the same schema. The tests run a fixed set of
// scenarios and, behind COCKROACH_GROUND_TRUTH_FULL=1, every cell of `cockroach-commutativity-matrix.json`. A cell
// where the rules and the server disagree must be in `knownExceptions`.
//
// The full matrix runs one cell at a time on six workers. Each worker names its objects with a prefix, so the
// workers share one database without colliding. The whole run uses one database and drops it at the end; the
// `db` fixture of `mocks.ts` creates a database per test and leaves it behind, which buries the server under
// thousands of databases and their schema-change jobs during a full run. A full run took 657 seconds (11 minutes)
// at full CPU on a fresh local server, so it stays behind the environment variable and CI runs only the fixed set.
// `COCKROACH_GROUND_TRUTH_CELLS="a x b,c x d"` checks only the named cells, so a triage needs no full run.

type Outcome = { ok: true; schema: string } | { ok: false; error: string };

const databaseName = 'groundtruth';
const workerDatabase = (idx: number) => `${databaseName}_w${idx}`;
let client: PoolClient;
let pool: Pool;
const workerClients: PoolClient[] = [];
const mergeClientName = `${databaseName}_merge`;
let mergeClient: PoolClient;

const query = async (sql: string, params?: any[]): Promise<any[]> => (await client.query(sql, params)).rows;

const queryOn = (client: PoolClient): DB => ({
	query: async <T = any>(sql: string, params?: any[]): Promise<T[]> => (await client.query(sql, params)).rows as T[],
});

beforeAll(async () => {
	const url = process.env.COCKROACH_CONNECTION_STRING;
	if (!url) throw new Error('COCKROACH_CONNECTION_STRING is not set.');
	// One connection for the admin work and one for each of the six workers. Each worker keeps its own session,
	// because a cocroach session selects its database with `USE`.
	pool = new Pool({ connectionString: url, max: 12 });
	client = await pool.connect();
	for (const name of [databaseName, mergeClientName, ...[0, 1, 2, 3, 4, 5].map(workerDatabase)]) {
		await client.query(`DROP DATABASE IF EXISTS ${name};`);
		await client.query(`CREATE DATABASE ${name};`);
	}
	await client.query(`USE ${databaseName};`);
	await client.query('SET CLUSTER SETTING feature.vector_index.enabled = true;');
	for (let idx = 0; idx < 6; idx++) {
		const worker = await pool.connect();
		await worker.query(`USE ${workerDatabase(idx)};`);
		workerClients.push(worker);
	}
	mergeClient = await pool.connect();
	await mergeClient.query(`USE ${mergeClientName};`);
});

afterAll(async () => {
	if (!client) return;
	await client.query('USE defaultdb;');
	for (const name of [databaseName, mergeClientName, ...[0, 1, 2, 3, 4, 5].map(workerDatabase)]) {
		await client.query(`DROP DATABASE IF EXISTS ${name};`);
	}
	const roles = await query(`SELECT rolname FROM pg_catalog.pg_roles WHERE rolname ~ '^w[0-9]+_r$' OR rolname = 'r'`);
	for (const { rolname } of roles) await query(`DROP ROLE IF EXISTS "${rolname}"`);
	const left = (await query('SHOW DATABASES')) as { database_name: string }[];
	const databases = left.map((it) => it.database_name).filter((name) =>
		name !== 'defaultdb' && name !== 'postgres' && name !== 'system'
	);
	expect(databases, 'databases that the ground truth run left behind').toEqual([]);
	for (const worker of workerClients) worker.release();
	mergeClient.release();
	client.release();
	await pool.end();
});

const named = (prefix: string, name: string) => `${prefix}${name}`;

const sqlOf = (type: string, prefix = ''): string[] | null => {
	try {
		return fromJson([build(type, prefix)]).sqlStatements;
	} catch {
		// No convertor exists for this statement, because the diff never writes it.
		return null;
	}
};

const baseObjects = (prefix: string): Record<NeededObject, string[]> => {
	const schema = named(prefix, 's');
	const targetSchema = named(prefix, 's_new');
	const table = named(prefix, 't');
	const column = named(prefix, 'c1');
	const referencedTable = named(prefix, 't2');
	const referencedColumn = named(prefix, 'c2');
	const index = named(prefix, 'ix');
	const enumName = named(prefix, 'e');
	const enumColumn = named(prefix, 'ce');
	const sequence = named(prefix, 'sq');
	const view = named(prefix, 'vw');
	const policy = named(prefix, 'pol');
	const role = named(prefix, 'r');
	return {
		schema: [`CREATE SCHEMA IF NOT EXISTS "${schema}";`],
		targetSchema: [`CREATE SCHEMA IF NOT EXISTS "${targetSchema}";`],
		table: [`CREATE TABLE "${schema}"."${table}" ("id" varchar);`],
		column: [`ALTER TABLE "${schema}"."${table}" ADD COLUMN "${column}" varchar;`],
		notNullColumn: [
			`ALTER TABLE "${schema}"."${table}" ADD COLUMN "${column}" varchar;`,
			`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" SET NOT NULL;`,
		],
		referencedTable: [`CREATE TABLE "${schema}"."${referencedTable}" ("${referencedColumn}" varchar PRIMARY KEY);`],
		index: [`CREATE INDEX "${index}" ON "${schema}"."${table}" ("${column}");`],
		pk: [
			`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" SET NOT NULL;`,
			`ALTER TABLE "${schema}"."${table}" ADD CONSTRAINT "${named(prefix, 'pk')}" PRIMARY KEY ("${column}");`,
		],
		fk: [
			`ALTER TABLE "${schema}"."${table}" ADD CONSTRAINT "${named(prefix, 'fk')}" FOREIGN KEY ("${column}") `
			+ `REFERENCES "${schema}"."${referencedTable}"("${referencedColumn}");`,
		],
		check: [
			`ALTER TABLE "${schema}"."${table}" ADD CONSTRAINT "${named(prefix, 'ck')}" CHECK ("${column}" <> '');`,
		],
		enum: [`CREATE TYPE "${schema}"."${enumName}" AS ENUM ('a','b');`],
		enumColumn: [`ALTER TABLE "${schema}"."${table}" ADD COLUMN "${enumColumn}" "${schema}"."${enumName}";`],
		sequence: [`CREATE SEQUENCE "${schema}"."${sequence}";`],
		view: [`CREATE VIEW "${schema}"."${view}" AS SELECT 1 AS id;`],
		policy: [`CREATE POLICY "${policy}" ON "${schema}"."${table}" AS PERMISSIVE FOR ALL TO public;`],
		role: [`CREATE ROLE "${role}";`],
	};
};

const catalogByPrefix = new Map<string, ReturnType<typeof rows>>();

// The catalog holds one row for each type; `needs` says which base objects its SQL needs. `prefix` names the
// objects of the worker, because a full run shares one database.
const baseFor = (prefix: string, ...types: string[]): string[] => {
	const objects = baseObjects(prefix);
	if (!catalogByPrefix.has(prefix)) catalogByPrefix.set(prefix, rows(prefix));
	const catalogOf = (type: string) => catalogByPrefix.get(prefix)![type]!;
	return [
		...new Set(
			(Object.keys(objects) as NeededObject[]).filter((object) =>
				types.some((type) => catalogOf(type).needs.includes(object))
			),
		),
	].flatMap((object) => objects[object]);
};

// Removes the objects of the scenario from one worker's namespace. A role is cluster-wide and only a few rows
// use one, so the reset drops the role only for those rows.
const reset = async (worker: Worker, types: string[] = []) => {
	for (const schema of worker.schemas) await worker.db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
	const touchesRole = types.some((type) =>
		['create_role', 'drop_role', 'alter_role'].includes(type)
		|| catalogByPrefix.get(worker.prefix)?.[type]?.needs.includes('role')
	);
	if (touchesRole) {
		await worker.db.query(`DROP ROLE IF EXISTS "${worker.role}";`);
	}
};

// The schema of the test objects as canonical text, so that the two orders can be compared. The show statements
// are much faster than a full introspection, which matters for the full matrix run.
const schemaHash = async (db: DB, schemas: string[], role: string): Promise<string> => {
	const list = schemas.map((it) => `'${it}'`).join(',');
	// `SHOW CREATE ALL TABLES` can fail while another worker runs a schema change, with a missing column in its
	// own virtual table. A short retry sees the schema after that change.
	const read = async <T>(fn: () => Promise<T>, attempts = 6): Promise<T> => {
		for (let attempt = 1;; attempt++) {
			try {
				return await fn();
			} catch (e) {
				if (attempt >= attempts) throw e;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}
	};
	const [tables, schemaRows, types, policies, rls, roles] = await read(() =>
		Promise.all([
			db.query<{ create_statement: string }>('SHOW CREATE ALL TABLES'),
			db.query<{ create_statement: string }>('SHOW CREATE ALL SCHEMAS'),
			db.query<{ create_statement: string }>('SHOW CREATE ALL TYPES'),
			db.query(
				`SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
			 FROM pg_catalog.pg_policies WHERE schemaname IN (${list})`,
			),
			db.query(
				`SELECT n.nspname, c.relname, c.relrowsecurity FROM pg_catalog.pg_class c
			 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
			 WHERE n.nspname IN (${list}) AND c.relkind = 'r'`,
			),
			db.query(`SELECT rolname, rolcreatedb, rolcreaterole FROM pg_catalog.pg_roles WHERE rolname = '${role}'`),
		])
	);
	// Each worker uses a database of its own, so the show statements see only its objects.
	const statements = (items: { create_statement: string }[]) => items.map((it) => it.create_statement).sort();
	return JSON.stringify({
		tables: statements(tables),
		schemas: statements(schemaRows),
		types: statements(types),
		policies: policies.map((it) => JSON.stringify(it)).sort(),
		rls: rls.map((it) => JSON.stringify(it)).sort(),
		roles: roles.map((it) => JSON.stringify(it)).sort(),
	});
};

type Worker = { prefix: string; db: DB; schemas: string[]; role: string };

// `index` picks the worker session. The fixed pairs use session 0.
const workerFor = (prefix: string, index = 0): Worker => {
	const schemas = [`${prefix}s`, `${prefix}s_new`];
	return {
		prefix,
		db: queryOn(workerClients[index]!),
		schemas,
		role: `${prefix}r`,
	};
};

const run = async (worker: Worker, sql: string[], types: string[] = []): Promise<Outcome> => {
	await reset(worker, types);
	try {
		for (const statement of sql) await worker.db.query(statement);
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message.split('\n').filter(Boolean).at(-1)! : String(e) };
	}
	return { ok: true, schema: await schemaHash(worker.db, worker.schemas, worker.role) };
};

const commutes = (a: Outcome, b: Outcome) => a.ok && b.ok && a.schema === b.schema;

const verdict = (typeA: string, typeB: string, prefix = '') =>
	!!cockroachCommutativity.findConflict(
		footprintsOfStatements([build(typeA, prefix)]),
		footprintsOfStatements([build(typeB, prefix)]),
	);

// The fixed pairs that every run checks. They cover the cases that a schema change on a real server decides:
// renames against dependents, drops against changes, index names that two tables share, and uniqueness.
// Cockroach refuses to drop the last primary key of a table outside a transaction that adds the next one, so the
// SQL of these rows cannot run on its own. The rules still cover them.
const unrunnable = new Set(['drop_pk', 'recreate_pk']);

const fixedPairs: [string, string][] = [
	['rename_column', 'create_index'],
	['rename_column', 'rename_index'],
	['rename_table', 'drop_index'],
	['rename_table', 'rename_index'],
	['move_table', 'create_index'],
	['drop_column', 'create_index'],
	['drop_column', 'rename_column'],
	['drop_table', 'add_column'],
	['create_index', 'create_index'],
	['create_index', 'drop_index'],
	['alter_column', 'alter_add_column_not_null'],
	['alter_column', 'alter_column'],
	['alter_column', 'alter_column:type'],
	['create_fk', 'drop_index'],
	['create_policy', 'alter_rls'],
	['create_role', 'create_policy'],
	['alter_check', 'alter_check'],
	['create_sequence', 'alter_sequence'],
];

// The mismatches that the matrix test accepts: cells where the rules report a conflict and the server accepts
// both orders. Keys are `row x column` in matrix order.
const knownExceptions: Record<string, string> = {
	'alter_column x alter_column:type':
		'a type change converts the default, and the rules do not know that the conversion from varchar to text '
		+ 'keeps it; the rules report a conflict because both statements write the default of the column',
	'create_policy x alter_rls':
		'both orders give a policy on a table without row level security, so cockroach does not enforce the policy; '
		+ 'the rules report a conflict because the DISABLE writes the RLS node that the policy reads',
	'alter_drop_column_not_null x recreate_column':
		'the rules report a conflict because the DROP NOT NULL reads the name of the column (n|col|s.t.c1) and the '
		+ 'recreate writes it; on the server the recreate resets the column to nullable in both orders',
	'alter_policy x recreate_policy':
		'the rules report a conflict because both statements write the policy (s|pol|s.t.pol); the recreate writes '
		+ 'the same policy that the ALTER changes, so both orders end at the same policy',
};

// `COCKROACH_GROUND_TRUTH_CELLS="a x b,c x d"` runs only the named cells, so a triage does not need a full run.
const selectedCells = process.env.COCKROACH_GROUND_TRUTH_CELLS
	?.split(',')
	.map((it) => it.trim().split(' x '))
	.filter((it): it is [string, string] => it.length === 2);

test('the rules agree with a real server on the fixed pairs', async () => {
	const worker = workerFor('');
	const mismatches: Record<string, string> = {};
	const pairs = selectedCells ?? fixedPairs;
	for (const [a, b] of pairs) {
		const [sqlA, sqlB] = [sqlOf(a), sqlOf(b)];
		if (!sqlA || !sqlB || unrunnable.has(a) || unrunnable.has(b)) continue;
		const base = baseFor('', a, b);
		const ab = await run(worker, [...base, ...sqlA, ...sqlB], [a, b]);
		const ba = await run(worker, [...base, ...sqlB, ...sqlA], [a, b]);
		const rulesCommute = !verdict(a, b);
		if (rulesCommute === commutes(ab, ba)) continue;
		mismatches[`${a} x ${b}`] = `${rulesCommute ? 'commute' : 'conflict'}: ${
			ab.ok
				? (ba.ok ? 'both orders ran' : `the second order failed: ${ba.error}`)
				: `the first order failed: ${ab.error}`
		}`;
	}

	const unexpected = Object.entries(mismatches).filter(([cell]) => !knownExceptions[cell]).map(([cell, why]) =>
		`${cell}: ${why}`
	);
	expect(unexpected, 'cells where the server and the rules disagree').toEqual([]);
	// Only the checked cells can prove an exception stale.
	const checked = new Set(pairs.flatMap(([a, b]) => [`${a} x ${b}`, `${b} x ${a}`]));
	const stale = Object.keys(knownExceptions).filter((cell) => checked.has(cell) && !mismatches[cell]);
	expect(stale, 'known exceptions that the server and the rules now agree on').toEqual([]);
}, 600_000);

const isSet = (grid: string[], i: number, j: number) => grid[i]![j] === '1';

test.runIf(process.env.COCKROACH_GROUND_TRUTH_FULL)(
	'the rules agree with a real server on every possible matrix cell',
	async () => {
		const { types, matrix, impossible } = matrixData;
		const cells: [number, number][] = [];
		for (let i = 0; i < types.length; i++) {
			for (let j = i; j < types.length; j++) {
				if (isSet(impossible, i, j) || isSet(impossible, j, i)) continue;
				const [a, b] = [types[i]!, types[j]!];
				if (!sqlOf(a) || !sqlOf(b) || unrunnable.has(a) || unrunnable.has(b)) continue;
				cells.push([i, j]);
			}
		}

		const workers = [0, 1, 2, 3, 4, 5].map((idx) => workerFor(`w${idx}_`, idx));
		let cursor = 0;
		const found = await Promise.all(workers.map(async (worker) => {
			const mismatches: Record<string, string> = {};
			while (true) {
				const idx = cursor++;
				if (idx >= cells.length) break;
				const [i, j] = cells[idx]!;
				const [a, b] = [types[i]!, types[j]!];
				const [sqlA, sqlB] = [sqlOf(a, worker.prefix), sqlOf(b, worker.prefix)];
				if (!sqlA || !sqlB) continue;
				const base = baseFor(worker.prefix, a, b);
				const ab = await run(worker, [...base, ...sqlA, ...sqlB], [a, b]);
				const ba = await run(worker, [...base, ...sqlB, ...sqlA], [a, b]);
				const rulesCommute = !isSet(matrix, i, j) && !isSet(matrix, j, i);
				if (rulesCommute === commutes(ab, ba)) continue;
				// A cell is a real disagreement only when both statements can run alone on the base. Otherwise the
				// base does not hold the objects that the pair needs, and no fork point can produce it.
				if (
					!(await run(worker, [...base, ...sqlA], [a, b])).ok || !(await run(worker, [...base, ...sqlB], [a, b])).ok
				) {
					continue;
				}
				mismatches[`${a} x ${b}`] = rulesCommute
					? `rules say commute, the server rejects an order: ${
						ab.ok ? (ba.ok ? 'both orders ran' : ba.error) : ab.error
					}`
					: 'rules say conflict, the server runs both orders to the same schema';
			}
			return mismatches;
		}));

		const mismatches = Object.assign({}, ...found);
		const unexpected = Object.entries(mismatches).filter(([cell]) => !knownExceptions[cell]).map(([cell, why]) =>
			`${cell}: ${why}`
		);
		const stale = Object.keys(knownExceptions).filter((cell) => !mismatches[cell]);
		expect(unexpected).toEqual([]);
		expect(stale).toEqual([]);
	},
	3_600_000,
);

// Runs every migration of the folder in order.
const applyFolder = async (flow: ReturnType<typeof createCockroachFolderFlow>, branch: string) => {
	for (const folder of flow.folders(branch)) {
		const text = readFileSync(join(flow.dirOf(branch), folder, 'migration.sql'), 'utf8');
		for (const statement of text.split('--> statement-breakpoint')) {
			const trimmed = statement.trim();
			if (trimmed) await mergeClient.query(trimmed);
		}
	}
};

const introspected = async (db: DB) => {
	const filter = prepareEntityFilter('cockroach', {
		tables: [],
		schemas: ['public'],
		entities: undefined,
		extensions: [],
	}, []);
	const schema = await fromDatabaseForDrizzle(db, filter, () => {}, {
		schema: 'drizzle',
		table: '__drizzle_migrations',
	});
	return normalizeDDL(interimToDDL(schema).ddl.entities.list());
};

test('the merged schema of a fork applies to a real server', async () => {
	const flow = createCockroachFolderFlow();
	await flow.generate('main', { columns: ['id', 'name'] });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { columns: ['id', 'name', 'a'] });
	await flow.generate('b', { columns: ['id', 'name', 'b'] });
	flow.merge('main', 'a', 'b');

	const merged = { columns: ['id', 'name', 'a', 'b', 'c'] } as const;
	await flow.generate('main', merged, { fixConflicts: true });
	await applyFolder(flow, 'main');

	// The introspection marks the stored name of a primary key as explicit; the schema builder leaves that field
	// to the diff, so the comparison ignores it.
	const canonical = (rowsOf: string[]) =>
		rowsOf
			.map((row) => {
				const parsed = JSON.parse(row);
				delete parsed.nameExplicit;
				return JSON.stringify(Object.fromEntries(Object.entries(parsed).sort()));
			})
			.sort();
	expect(canonical(await introspected(queryOn(mergeClient)))).toStrictEqual(
		canonical(normalizeDDL(drizzleToDDL(schemaObject(merged)).ddl.entities.list())),
	);
}, 600_000);
