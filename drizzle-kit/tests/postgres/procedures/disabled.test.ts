import { borrowPGlite, returnPGlite } from '@drizzle/test-utils/pglite';
import type { PGlite } from '@electric-sql/pglite';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { runWithCliContext } from 'src/cli/context';
import { HintsHandler } from 'src/cli/hints';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles, SchemaSource } from 'src/dialects/postgres/drizzle';
import { fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { proceduresEnabled } from 'src/dialects/postgres/procedures/model';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { prepareTestDatabase, type TestDatabase } from '../mocks';

// @vitest-environment-options {"max-concurrency":1}

// drizzle-kit ignores procedures in this release (`proceduresEnabled` is off). The first test says what that
// means. The rest say what has to stay true after procedures are turned on: they pass now because nothing
// touches procedures, and fail with the flag on until the problem each one names is solved.

const tmpDir = path.resolve('tests/postgres/tmp/procedures');
mkdirSync(tmpDir, { recursive: true });

let fileCounter = 0;
const schemaFile = (source: string) => {
	const file = path.join(tmpDir, `disabled_${process.pid}_${fileCounter++}.ts`);
	writeFileSync(file, source);
	return file;
};

const schema = `
import { bigint, numeric, pgTable, procedure } from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	balance: numeric('balance', { mode: 'number' }).notNull(),
});

export const deposit = procedure('deposit', { id: 'bigint', amount: 'numeric' }, ({ args, sql }) => {
	sql\`UPDATE \${accounts} SET \${accounts.balance} = \${accounts.balance} + \${args.amount} WHERE \${accounts.id} = \${args.id}\`;
});

export const legacy = procedure.unsupported(\`CREATE OR REPLACE PROCEDURE public.legacy(a integer) LANGUAGE sql AS $$ SELECT 1 $$\`);
`;

const pushCommand = async (client: PGlite, source: string) => {
	const { handle } = await import('src/cli/commands/push-postgres');
	return runWithCliContext({ output: 'json', interactive: false }, () =>
		handle(
			SchemaSource.fromFilenames([schemaFile(source)]),
			false,
			{ driver: 'pglite', client } as never,
			{ tables: [], schemas: [], entities: undefined, extensions: [] },
			true,
			false,
			{ table: '__drizzle_migrations', schema: 'drizzle' },
			new HintsHandler(),
		));
};

const procedureNames = async (client: PGlite) =>
	(await client.query<{ name: string }>(
		`SELECT proname AS name FROM pg_proc WHERE prokind = 'p' AND pronamespace = 'public'::regnamespace ORDER BY 1`,
	))
		.rows.map((it) => it.name);

const introspect = (db: TestDatabase['db']) =>
	fromDatabaseForDrizzle(
		db,
		prepareEntityFilter('postgresql', { tables: [], schemas: [], entities: undefined, extensions: [] }, []),
		() => {},
		{ schema: 'drizzle', table: '__drizzle_migrations' },
	);

let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test.skipIf(proceduresEnabled)('procedures are ignored: not in the schema, not read, not created', async () => {
	// declared in a schema file: no entity and no error
	const prepared = await prepareFromSchemaFiles([schemaFile(schema)]);
	const { schema: interim, errors } = fromDrizzleSchema(prepared, () => true);
	expect(errors).toStrictEqual([]);
	expect(interimToDDL(interim).ddl.procedures.list()).toStrictEqual([]);

	// in a database: not read
	await db.query(`CREATE PROCEDURE "native"(a integer) LANGUAGE sql AS $$ SELECT 1 $$`);
	const pulled = await introspect(db);
	expect(pulled.procedures).toStrictEqual([]);
	expect(pulled.unsupportedProcedures).toStrictEqual([]);

	// push creates the table and no procedure
	const client = await borrowPGlite();
	await pushCommand(client, schema);
	expect(await procedureNames(client)).toStrictEqual([]);
	expect((await client.query(`SELECT 1 FROM pg_class WHERE relname = 'accounts'`)).rows).toHaveLength(1);
	await returnPGlite(client);
});

// A database has procedures that no drizzle schema declares: the ones an extension installs (TimescaleDB,
// pg_partman), and the ones other tools or people created. Declaring one procedure must not make push drop them
test('push keeps the procedures a schema does not declare', async () => {
	const client = await borrowPGlite();
	await client.query(`CREATE PROCEDURE "native"(a integer) LANGUAGE sql AS $$ SELECT 1 $$`);
	await client.query(`CREATE PROCEDURE "maintenance"() LANGUAGE plpgsql AS $$ BEGIN END $$`);

	await pushCommand(client, schema);

	const names = await procedureNames(client);
	expect(names).toContain('native');
	expect(names).toContain('maintenance');
	await returnPGlite(client);
});

// Postgres finds an unqualified function through the search_path, so a schema listed there before pg_catalog can
// replace `pg_get_function_arguments` for every query of the connection. The queries of introspection are written
// with pg_catalog.fn() for that reason (see the rule at the top of introspect.ts), and the query that reads
// procedures has to follow it. Its operators are covered by the search_path test in ../pull.test.ts
test('introspection does not run functions of the search_path', async () => {
	const client = await borrowPGlite();
	await client.query(`CREATE TABLE "accounts" (id bigint)`);
	await client.query(`CREATE PROCEDURE "noop"() LANGUAGE plpgsql AS $$ BEGIN END $$`);
	await client.query(`CREATE SCHEMA "hijack"`);
	for (const fn of ['pg_get_function_arguments', 'pg_get_functiondef', 'pg_get_function_identity_arguments']) {
		await client.query(`
			CREATE FUNCTION "hijack".${fn}(oid) RETURNS text LANGUAGE plpgsql AS $$
			BEGIN
				RAISE EXCEPTION 'a function of the search_path was run instead of pg_catalog.${fn}';
			END $$
		`);
	}

	await client.query(`SET search_path = "hijack", pg_catalog, public`);
	const hijacked = {
		query: (sql: string, params?: any[]) =>
			client.query(sql, params).then((it) => it.rows as any[], (error: Error) => {
				throw new Error(`${error.message}\n\n${sql}`);
			}),
	} as TestDatabase['db'];
	const pulled = await introspect(hijacked).then((schema) => ({ schema }), (error: Error) => ({ error }));
	await client.query(`RESET search_path`);
	await returnPGlite(client);

	expect('error' in pulled ? pulled.error.message : undefined).toBeUndefined();
	expect('schema' in pulled && pulled.schema.tables.map((it) => it.name)).toStrictEqual(['accounts']);
});
