import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { runWithCliContext } from 'src/cli/context';
import { HintsHandler } from 'src/cli/hints';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { ddlDiffDry } from 'src/dialects/postgres/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles, SchemaSource } from 'src/dialects/postgres/drizzle';
import { fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { pullProcedure } from 'src/dialects/postgres/procedures/model';
import { ddlToTypeScript } from 'src/dialects/postgres/typescript';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { tsc } from 'tests/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, type TestDatabase } from '../mocks';

// @vitest-environment-options {"max-concurrency":1}

const tmpDir = path.resolve('tests/postgres/tmp/procedures');
mkdirSync(tmpDir, { recursive: true });

let fileCounter = 0;

/** Procedures compile from TypeScript source, so every schema here is a real file loaded like drizzle-kit loads it. */
const loadSchema = async (source: string) => {
	const file = path.join(tmpDir, `schema_${process.pid}_${fileCounter++}.ts`);
	writeFileSync(file, source);
	const prepared = await prepareFromSchemaFiles([file]);
	const { schema, errors } = fromDrizzleSchema(prepared, () => true);
	const { ddl, errors: ddlErrors } = interimToDDL(schema);
	return { ddl, errors: [...errors, ...ddlErrors] };
};

const schemaDDL = async (source: string) => {
	const { ddl, errors } = await loadSchema(source);
	expect(errors).toStrictEqual([]);
	return ddl;
};

const tables = `
import { bigint, numeric, pgTable, PgError, procedure, text } from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	balance: numeric('balance', { mode: 'number' }).notNull(),
});
`;

const transfer = (debitCheck: string) => `
export const transfer = procedure('transfer', { from: 'bigint', to: 'bigint', amount: 'numeric' }, ({ args, sql }) => {
	const debit = sql\`UPDATE \${accounts} SET \${accounts.balance} = \${accounts.balance} - \${args.amount} WHERE \${accounts.id} = \${args.from}${debitCheck}\`;
	if (debit.count === 0) {
		throw new PgError('P0001', 'insufficient funds');
	}
	sql\`UPDATE \${accounts} SET \${accounts.balance} = \${accounts.balance} + \${args.amount} WHERE \${accounts.id} = \${args.to}\`;
	const row = sql\`SELECT \${accounts.balance} FROM \${accounts} WHERE \${accounts.id} = \${args.from}\`.one<{ balance: numeric }>();
	return { newBalance: row.balance };
});
`;

const guarded = transfer(' AND ${accounts.balance} >= ${args.amount}');

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

test('create procedure', async () => {
	const { sqlStatements } = await diff({}, await schemaDDL(tables + guarded), []);

	expect(sqlStatements).toHaveLength(2);
	expect(sqlStatements[1]).toBe(
		[
			'CREATE OR REPLACE PROCEDURE "transfer"(p_from bigint, p_to bigint, p_amount numeric, INOUT "newBalance" numeric DEFAULT NULL)',
			'LANGUAGE plpgsql',
			'AS $$',
			'#variable_conflict use_column',
			'DECLARE',
			'  v_debit__count bigint;',
			'  v_row record;',
			'BEGIN',
			'  UPDATE "accounts" SET "balance" = "balance" - p_amount WHERE "id" = p_from AND "balance" >= p_amount;',
			'  GET DIAGNOSTICS v_debit__count = ROW_COUNT;',
			'  IF v_debit__count = 0 THEN',
			`    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'P0001';`,
			'  END IF;',
			'  UPDATE "accounts" SET "balance" = "balance" + p_amount WHERE "id" = p_to;',
			'  SELECT "balance" FROM "accounts" WHERE "id" = p_from INTO STRICT v_row;',
			'  "newBalance" := v_row.balance;',
			'  RETURN;',
			'END;',
			'$$;',
		].join('\n'),
	);
});

test('body change replaces in place', async () => {
	const from = await schemaDDL(tables + transfer(''));
	const to = await schemaDDL(tables + guarded);

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toHaveLength(1);
	expect(sqlStatements[0]).toMatch(/^CREATE OR REPLACE PROCEDURE "transfer"\(/);
});

test('signature change drops the old signature first', async () => {
	const from = await schemaDDL(tables + guarded);
	const to = await schemaDDL(tables + guarded.replace(`amount: 'numeric'`, `amount: 'int'`));

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements[0]).toBe('DROP PROCEDURE "transfer"(bigint, bigint, numeric, numeric);');
	expect(sqlStatements[1]).toMatch(
		/^CREATE OR REPLACE PROCEDURE "transfer"\(p_from bigint, p_to bigint, p_amount integer,/,
	);
});

test('removed procedure is dropped', async () => {
	const { sqlStatements } = await diff(await schemaDDL(tables + guarded), await schemaDDL(tables), []);

	expect(sqlStatements).toStrictEqual(['DROP PROCEDURE "transfer"(bigint, bigint, numeric, numeric);']);
});

test('only exported procedures are part of the schema', async () => {
	const ddl = await schemaDDL(tables + guarded.replace('export const transfer', 'const transfer'));

	expect(ddl.procedures.list()).toStrictEqual([]);
});

test('compile errors are schema errors', async () => {
	const { errors } = await loadSchema(`
import { procedure } from 'drizzle-orm/pg-core';

export const bad = procedure('bad', { id: 'bigint' }, ({ sql }) => {
	console.log('nope');
});
`);

	expect(errors).toHaveLength(1);
	expect(errors[0]).toMatchObject({ type: 'procedure_compile_error' });
	expect((errors[0] as { message: string }).message).toContain('console.log is not supported');
});

test('push: create, then a subsequent push is a no-op', async () => {
	// `push` re-introspects after applying and fails on any further statement: the compiled and the
	// introspected definitions must canonicalize identically.
	const { sqlStatements } = await push({ db, to: await schemaDDL(tables + guarded) });

	expect(sqlStatements).toHaveLength(2);
});

test('push: body change', async () => {
	await push({ db, to: await schemaDDL(tables + transfer('')) });
	const { sqlStatements } = await push({ db, to: await schemaDDL(tables + guarded) });

	expect(sqlStatements).toHaveLength(1);
	expect(sqlStatements[0]).toMatch(/^CREATE OR REPLACE PROCEDURE "transfer"\(/);
});

test('db.call: typed CALL returns the body record', async () => {
	await push({ db, to: await schemaDDL(tables + guarded) });
	await db.query(`INSERT INTO "accounts" VALUES (1, 100), (2, 0)`);

	const file = path.join(tmpDir, `schema_${process.pid}_${fileCounter++}.ts`);
	writeFileSync(file, tables + guarded);
	const { transfer: proc } = await import(file);
	const orm = drizzle({ client: _.client });

	const result = await orm.call(proc, { from: 1, to: 2, amount: 30 });

	// No codecs run on CALL results: numeric arrives as the driver's string.
	expect(result).toStrictEqual({ newBalance: '70' });
	// Drivers' errors arrive wrapped in DrizzleQueryError; the RAISE is its cause.
	await expect(orm.call(proc, { from: 1, to: 2, amount: 1000 })).rejects.toMatchObject({
		cause: { message: 'insufficient funds', code: 'P0001' },
	});
});

/** What `drizzle-kit pull` does: introspect, keep the procedures that decompile exactly, render TypeScript. */
const pull = async () => {
	const filter = prepareEntityFilter(
		'postgresql',
		{ tables: [], schemas: [], entities: undefined, extensions: [] },
		[],
	);
	const schema = await fromDatabaseForDrizzle(db, filter, () => {}, {
		schema: 'drizzle',
		table: '__drizzle_migrations',
	});
	schema.procedures = schema.procedures.filter((it) => pullProcedure(it).ok);
	const { ddl } = interimToDDL(schema);
	return { ddl, file: ddlToTypeScript(ddl, schema.viewColumns, 'camel').file };
};

test('pull: pulled procedures compile back to the same definitions', async () => {
	await push({ db, to: await schemaDDL(tables + guarded) });

	const pulled = await pull();
	expect(pulled.file).toContain(`export const transfer = procedure('transfer', {`);
	await tsc(pulled.file);

	const { sqlStatements } = await ddlDiffDry(pulled.ddl, await schemaDDL(pulled.file), 'push');
	expect(sqlStatements).toStrictEqual([]);
});

test('pull: procedures outside the DSL are left out', async () => {
	await db.query(`CREATE PROCEDURE "native"(a integer) LANGUAGE sql AS $$ SELECT 1 $$`);

	const pulled = await pull();

	expect(pulled.ddl.procedures.list()).toStrictEqual([]);
	expect(pullProcedure({ schema: 'public', name: 'native', params: 'a integer', body: ' SELECT 1 ', language: 'sql' }))
		.toMatchObject({ ok: false, reason: 'LANGUAGE sql — only plpgsql is supported' });
});

const pushCommand = async (client: PGlite, source: string) => {
	const file = path.join(tmpDir, `schema_${process.pid}_${fileCounter++}.ts`);
	writeFileSync(file, source);
	const { handle } = await import('src/cli/commands/push-postgres');
	return runWithCliContext({ output: 'json', interactive: false }, () =>
		handle(
			SchemaSource.fromFilenames([file]),
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

test('push command: database procedures are left alone while the schema declares none', async () => {
	const client = new PGlite();
	await client.query(`CREATE PROCEDURE "native"(a integer) LANGUAGE sql AS $$ SELECT 1 $$`);

	await pushCommand(client, tables);

	expect(await procedureNames(client)).toStrictEqual(['native']);
	await client.close();
});

test('push command: once the schema declares procedures, undeclared ones are dropped', async () => {
	const client = new PGlite();
	await client.query(`CREATE PROCEDURE "native"(a integer) LANGUAGE sql AS $$ SELECT 1 $$`);

	await pushCommand(client, tables + guarded);

	expect(await procedureNames(client)).toStrictEqual(['transfer']);
	await client.close();
});

const tenantSchema = `
import { bigint, pgSchema, type bigint_ } from 'drizzle-orm/pg-core';

export const tenant = pgSchema('tenant');

export const counters = tenant.table('counters', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	n: bigint('n', { mode: 'number' }).notNull(),
});

export const bump = tenant.procedure('bump', { id: 'bigint' }, ({ args, sql }) => {
	sql\`UPDATE \${counters} SET \${counters.n} = \${counters.n} + 1 WHERE \${counters.id} = \${args.id}\`;
	const row = sql\`SELECT \${counters.n} FROM \${counters} WHERE \${counters.id} = \${args.id}\`.one<{ n: bigint_ }>();
	return { n: row.n };
});
`;

test('schema procedure: created in its schema', async () => {
	const { sqlStatements } = await diff({}, await schemaDDL(tenantSchema), []);

	expect(sqlStatements[0]).toBe('CREATE SCHEMA "tenant";\n');
	expect(sqlStatements.at(-1)).toMatch(
		/^CREATE OR REPLACE PROCEDURE "tenant"\."bump"\(p_id bigint, INOUT "n" bigint DEFAULT NULL\)/,
	);
});

test('schema procedure: push, db.call and pull round trip', async () => {
	await push({ db, to: await schemaDDL(tenantSchema) });
	await db.query(`INSERT INTO "tenant"."counters" VALUES (1, 41)`);

	const file = path.join(tmpDir, `schema_${process.pid}_${fileCounter++}.ts`);
	writeFileSync(file, tenantSchema);
	const { bump } = await import(file);
	expect(await drizzle({ client: _.client }).call(bump, { id: 1 })).toStrictEqual({ n: 42 }); // raw driver value: PGlite parses int8 itself

	const pulled = await pull();
	expect(pulled.file).toContain(`export const bumpInTenant = tenant.procedure('bump', {`);
	await tsc(pulled.file);
	const { sqlStatements } = await ddlDiffDry(pulled.ddl, await schemaDDL(pulled.file), 'push');
	expect(sqlStatements).toStrictEqual([]);
});
