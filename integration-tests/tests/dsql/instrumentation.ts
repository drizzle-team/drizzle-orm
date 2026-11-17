import { AuroraDSQLClient } from '@aws/aurora-dsql-node-postgres-connector';
import { auroraDSQLPostgres } from '@aws/aurora-dsql-postgresjs-connector';
import { createProvider } from '@drizzle/test-utils';
import {
	type AnyRelationsBuilderConfig,
	defineRelations,
	type ExtractTablesFromSchema,
	type ExtractTablesWithRelations,
	type RelationsBuilder,
	type RelationsBuilderConfig,
} from 'drizzle-orm';
import { drizzle as drizzleNodePgDsql } from 'drizzle-orm/node-postgres/dsql';
import type {
	PgEnum,
	PgEnumObject,
	PgMaterializedView,
	PgPolicy,
	PgRole,
	PgSchema,
	PgSequence,
	PgTable,
	PgView,
} from 'drizzle-orm/pg-core';
import type { DsqlAsyncDatabase } from 'drizzle-orm/pg-core/async/dsql';
import { drizzle as drizzlePostgresJsDsql } from 'drizzle-orm/postgres-js/dsql';
import type { Sql } from 'postgres';
import { test as base } from 'vitest';
import { relations } from '../pg/relations';
import { dsqlUrl } from './connection';
import { retryOcc } from './occ';

export type PostgresSchema = Record<
	string,
	| PgTable<any>
	| PgEnum<any>
	| PgEnumObject<any>
	| PgSchema
	| PgSequence
	| PgView
	| PgMaterializedView
	| PgRole
	| PgPolicy
	| unknown
>;

export const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
	log?: 'statements',
) => {
	const { diff } = await import('../../../drizzle-kit/tests/postgres/mocks' as string);

	const res = await diff({}, schema, []);

	for (const s of res.sqlStatements) {
		if (log === 'statements') console.log(s);
		await retryOcc(() => query(s, [])).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

const resetSchemas = async (run: (sql: string) => Promise<any[]>) => {
	const tables = await run(
		`select schemaname, tablename from pg_tables where schemaname not in ('information_schema', 'sys') and schemaname !~ '^pg_'`,
	);
	for (const table of tables) {
		await run(`drop table if exists ${quote(table['schemaname'])}.${quote(table['tablename'])} cascade`);
	}

	const views = await run(
		`select schemaname, viewname from pg_views where schemaname not in ('information_schema', 'sys') and schemaname !~ '^pg_'`,
	);
	for (const view of views) {
		await run(`drop view if exists ${quote(view['schemaname'])}.${quote(view['viewname'])} cascade`);
	}

	const schemas = await run(
		`select nspname from pg_namespace where nspname not in ('public', 'information_schema', 'sys') and nspname !~ '^pg_'`,
	);
	for (const schema of schemas) {
		await run(`drop schema if exists ${quote(String(Object.values(schema)[0]))} cascade`);
	}

	await run('create schema "mySchema"');
};

const dsqlDatabase = () => {
	const pathname = new URL(dsqlUrl()).pathname.slice(1);
	return pathname || 'postgres';
};

export const prepareNodePgDsql = async () => {
	const client = new AuroraDSQLClient({ connectionString: dsqlUrl() });
	await client.connect();

	await resetSchemas(async (sql) => retryOcc(async () => (await client.query(sql)).rows));

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.query(sql, params);
		return res.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(statements.map((x) => client.query(x))).then((results) => [results] as any);
	};

	return { client, query, batch, database: dsqlDatabase() };
};

export const preparePostgresJsDsql = async () => {
	const client: Sql = auroraDSQLPostgres(dsqlUrl(), { max: 1, onnotice: () => {} }) as Sql;

	await resetSchemas(async (sql) => retryOcc(async () => await client.unsafe(sql) as any[]));

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.unsafe(sql, params);
		return res as any[];
	};

	const batch = async (statements: string[]) => {
		return Promise.all(statements.map((x) => client.unsafe(x))).then((results) => [results] as any);
	};

	return { client, query, batch, database: dsqlDatabase() };
};

type Vendor =
	| 'node-postgres-dsql'
	| 'postgres-js-dsql';

export const provideForNodePgDsql = async () => {
	const clients = [
		await prepareNodePgDsql(),
	];

	return createProvider(clients);
};

export const provideForPostgresJsDsql = async () => {
	const clients = [
		await preparePostgresJsDsql(),
	];

	return createProvider(clients);
};

type ProvideForNodePgDsql = Awaited<ReturnType<typeof provideForNodePgDsql>>;
type ProvideForPostgresJsDsql = Awaited<ReturnType<typeof provideForPostgresJsDsql>>;

type Provider =
	| ProvideForNodePgDsql
	| ProvideForPostgresJsDsql;

const testFor = (vendor: Vendor) => {
	return base.extend<{
		provider: Provider;
		kit: {
			client: any;
			query: (sql: string, params?: any[]) => Promise<any[]>;
			batch: (statements: string[]) => Promise<any>;
			database: string | undefined;
		};
		client: any;
		db: DsqlAsyncDatabase<any, typeof relations>;
		push: (schema: any, params?: { log: 'statements' }) => Promise<void>;
		createDB: {
			<S extends PostgresSchema>(schema: S): DsqlAsyncDatabase<any, ReturnType<typeof defineRelations<S>>>;
			<S extends PostgresSchema, TConfig extends AnyRelationsBuilderConfig>(
				schema: S,
				cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
				useJitMappers?: boolean,
				paramsInErrors?: boolean,
			): DsqlAsyncDatabase<any, ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>>;
		};
	}>({
		provider: [
			// oxlint-disable-next-line no-empty-pattern
			async ({}, use) => {
				const provider = vendor === 'node-postgres-dsql'
					? await provideForNodePgDsql()
					: vendor === 'postgres-js-dsql'
					? await provideForPostgresJsDsql()
					: '' as never;

				await use(provider);
			},
			{ scope: 'file' },
		],
		kit: [
			async ({ provider }, use) => {
				const { client, batch, query, release, database } = await provider();
				await use({ client: client as any, query, batch, database });
				release();
			},
			{ scope: 'test' },
		],
		client: [
			async ({ kit }, use) => {
				await use(kit.client);
			},
			{ scope: 'test' },
		],
		db: [
			async ({ kit }, use) => {
				const db = vendor === 'node-postgres-dsql'
					? drizzleNodePgDsql({ client: kit.client as any, relations })
					: vendor === 'postgres-js-dsql'
					? drizzlePostgresJsDsql({ client: kit.client as any, relations })
					: '' as never;

				await use(db);
			},
			{ scope: 'test' },
		],
		push: [
			async ({ kit }, use) => {
				const push = (
					schema: any,
					params?: { log: 'statements' },
				) => _push(kit.query, schema, params?.log);

				await use(push);
			},
			{ scope: 'test' },
		],
		createDB: [
			async ({ kit }, use) => {
				const createDB = <S extends PostgresSchema>(
					schema: S,
					cb?: (
						helpers: RelationsBuilder<ExtractTablesFromSchema<S>>,
					) => RelationsBuilderConfig<ExtractTablesFromSchema<S>>,
					useJitMappers?: boolean,
					paramsInErrors?: boolean,
				) => {
					const relations = cb ? defineRelations(schema, cb) : defineRelations(schema);

					if (vendor === 'node-postgres-dsql') {
						return drizzleNodePgDsql({
							client: kit.client as any,
							relations,
							jit: useJitMappers,
							paramsInErrors,
						});
					}
					if (vendor === 'postgres-js-dsql') {
						return drizzlePostgresJsDsql({
							client: kit.client as any,
							relations,
							jit: useJitMappers,
							paramsInErrors,
						});
					}

					throw new Error();
				};

				await use(createDB);
			},
			{ scope: 'test' },
		],
	});
};

export const nodePgDsqlTest = testFor('node-postgres-dsql');
export const postgresJsDsqlTest = testFor('postgres-js-dsql');

export type Test = ReturnType<typeof testFor>;
