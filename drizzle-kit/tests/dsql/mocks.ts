import 'dotenv/config';
import { preparePostgresDB } from 'src/cli/connections';
import { runWithCliContext } from 'src/cli/context';
import { HintsHandler } from 'src/cli/hints';
import { createDDL, interimToDDL } from 'src/dialects/postgres/ddl';
import { ddlDiff } from 'src/dialects/postgres/diff';
import { fromDrizzleSchema, fromExports, SchemaSource } from 'src/dialects/postgres/drizzle';
import {
	assertNoInvalidDsqlObjects,
	dsqlEntityFilter,
	runDsqlStatements,
	toDsql,
	withDsqlOccRetry,
} from 'src/dialects/postgres/dsql';
import { fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type { DB } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';
import { expect } from 'vitest';

export const dsqlUrl = () => {
	const url = process.env['DSQL_CONNECTION_STRING'];
	if (!url) {
		throw new Error(
			'DSQL_CONNECTION_STRING is not set. Point it at an Aurora DSQL cluster: postgresql://admin@<cluster>.dsql.<region>.on.aws:5432/postgres, with AWS credentials for it in the environment (for example AWS_PROFILE)',
		);
	}
	return url;
};

export const credentials = () => ({ driver: 'dsql' as const, url: dsqlUrl() });

// Every object a run creates lives in these schemas or has this role prefix, so runs on a shared cluster
// don't collide. DSQL allows 10 schemas per cluster, and a run uses at most 3.
export const runId = `dsql_kit_${Date.now().toString(36)}`;
export const runSchemas = [runId, `${runId}_2`, `${runId}_3`];

// A connection without OCC retries, for tests that watch a conflict happen.
export const connectRaw = async () => preparePostgresDB(credentials());

// The test's own queries retry OCC conflicts like kit does, so a run isn't flaky on a busy cluster.
export const connect = async () => withDsqlOccRetry(await connectRaw());

export type DsqlDB = Awaited<ReturnType<typeof connect>>;

export const migrations = { schema: 'drizzle', table: '__drizzle_migrations' };

export const roleFilter = (roles: string[]) => (roles.length > 0 ? { roles: { include: roles } } : undefined);

const filterFor = (roles: string[]) =>
	dsqlEntityFilter(
		prepareEntityFilter('postgresql', {
			tables: undefined,
			schemas: runSchemas,
			entities: roleFilter(roles),
			extensions: undefined,
		} as never, []),
	);

export const introspectDDL = async (db: DB, roles: string[] = []) => {
	const schema = await fromDatabaseForDrizzle(db, filterFor(roles), () => {}, migrations);
	const { ddl, errors } = interimToDDL(schema);
	expect(errors).toStrictEqual([]);
	return ddl;
};

export const toDDL = (schema: Record<string, unknown>, roles: string[] = []) => {
	const { schema: interim, errors } = fromDrizzleSchema(fromExports(schema), filterFor(roles));
	expect(errors).toStrictEqual([]);
	const { ddl, errors: ddlErrors } = interimToDDL(interim);
	expect(ddlErrors).toStrictEqual([]);
	return ddl;
};

// What push does with driver 'dsql', with renames from the test instead of hints, so the case table's
// rename cases can run. `push` below runs the real command.
export const pushTo = async (
	db: DB,
	to: Record<string, unknown>,
	opts: { renames?: string[]; roles?: string[] } = {},
) => {
	const roles = opts.roles ?? [];
	await assertNoInvalidDsqlObjects(db, filterFor(roles), migrations);
	const from = await introspectDDL(db, roles);
	const target = toDDL(to, roles);
	const renames = new Set(opts.renames ?? []);
	const result = await ddlDiff(
		from,
		target,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'push',
	);
	const { sqlStatements } = toDsql(result, target);
	await runDsqlStatements(db, sqlStatements);
	return sqlStatements;
};

// Pushes `to` and checks that a second push finds nothing to change, so introspection reads back what kit
// wrote.
export const pushAndSettle = async (
	db: DB,
	to: Record<string, unknown>,
	opts: { renames?: string[]; roles?: string[] } = {},
) => {
	const sql = await pushTo(db, to, opts);
	const again = await pushTo(db, to, { roles: opts.roles });
	expect(again, 'a second push changes nothing').toStrictEqual([]);
	return sql;
};

// The real `drizzle-kit push` with driver 'dsql', in JSON mode.
export const push = async (
	to: Record<string, unknown>,
	opts: { roles?: string[]; migrations?: { schema: string; table: string }; explain?: boolean } = {},
) => {
	const { handle } = await import('src/cli/commands/push-postgres');
	return runWithCliContext({ output: 'json', interactive: false }, () =>
		handle(
			SchemaSource.fromSchema(fromExports(to)),
			false,
			credentials(),
			{
				tables: undefined,
				schemas: runSchemas,
				entities: roleFilter(opts.roles ?? []),
				extensions: undefined,
			} as never,
			false,
			opts.explain ?? false,
			opts.migrations ?? migrations,
			new HintsHandler(),
		));
};

export const dropRun = async (db: DB, roles: string[] = []) => {
	for (const schema of runSchemas) await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
	for (const role of roles) await db.query(`DROP ROLE IF EXISTS "${role}";`);
};

export const assertNothingLeft = async (db: DB) => {
	const schemas = await db.query<{ nspname: string }>(
		`SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname LIKE 'dsql\\_kit\\_%'`,
	);
	const roles = await db.query<{ rolname: string }>(
		`SELECT rolname FROM pg_catalog.pg_roles WHERE rolname LIKE 'dsql\\_kit\\_%'`,
	);
	expect(schemas.map((it) => it.nspname).filter((it) => it.startsWith(runId))).toStrictEqual([]);
	expect(roles.map((it) => it.rolname).filter((it) => it.startsWith(runId))).toStrictEqual([]);
};

export const sqlstateOf = (error: unknown): string | undefined => {
	let it = error as { code?: unknown; cause?: unknown } | undefined;
	for (let depth = 0; depth < 8 && it; depth++) {
		if (typeof it.code === 'string' && /^[0-9A-Z]{5}$/.test(it.code)) return it.code;
		it = it.cause as typeof it;
	}
	return undefined;
};

export const isValidIndex = async (db: DB, schema: string, name: string) => {
	const rows = await db.query<{ indisvalid: boolean }>(
		`SELECT i.indisvalid FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2`,
		[schema, name],
	);
	return rows.length === 0 ? null : rows[0]!.indisvalid;
};

export const constraintState = async (db: DB, schema: string, name: string) => {
	const rows = await db.query<{ convalidated: boolean }>(
		`SELECT con.convalidated FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_namespace n ON n.oid = con.connamespace WHERE n.nspname = $1 AND con.conname = $2`,
		[schema, name],
	);
	return rows.length === 0 ? null : rows[0]!.convalidated;
};

export { createDDL };
