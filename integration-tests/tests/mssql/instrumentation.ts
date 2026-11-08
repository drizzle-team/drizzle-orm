import { parseMssqlUrl, requireEnv } from '@drizzle/test-utils';
import { randomUUID } from 'crypto';
import { defineRelations } from 'drizzle-orm';
import type { NodeMsSqlDatabase } from 'drizzle-orm/node-mssql';
import { drizzle } from 'drizzle-orm/node-mssql';
import type {
	AnyRelationsBuilderConfig,
	ExtractTablesFromSchema,
	ExtractTablesWithRelations,
	RelationsBuilder,
} from 'drizzle-orm/relations';
import mssql from 'mssql';
import { test as base } from 'vitest';
import relations from './mssql.relations';

type MsSqlSchema = Record<string, unknown>;

export const _push = async (
	query: (sql: string) => Promise<any[]>,
	schema: any,
	log?: 'statements',
) => {
	const { diff } = await import('../../../drizzle-kit/tests/mssql/mocks' as string);

	const res = await diff({}, schema, []);

	for (const s of res.sqlStatements) {
		if (log === 'statements') console.log(s);
		await query(s).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

export const createClient = async () => {
	const url = requireEnv(
		'MSSQL_CONNECTION_STRING',
		'Bring DBs up with `bash compose/dockers.sh up mssql` and export the connection string (e.g. `mssql://SA:drizzle123PASSWORD!@127.0.0.1:1433?encrypt=true&trustServerCertificate=true`) before running tests.',
	);
	const params = parseMssqlUrl(url);

	// The same server as MSSQL_CONNECTION_STRING, whose host CI sets to the container's IP.
	const url2 =
		`Server=${params.server},${params.port};User Id=SA;Password=drizzle123PASSWORD!;TrustServerCertificate=True;`;

	// A database of the test file's own, dropped when it finishes. On a self-hosted machine every job's files share
	// one server, and DRIZZLE_TEST_DB_PREFIX names this job's, so the job's end drops those a failed file left.
	const id = `${process.env['DRIZZLE_TEST_DB_PREFIX'] ?? ''}db${randomUUID().split('-')[0]}`;
	const admin = await new mssql.ConnectionPool(params).connect();
	await admin.query(`create database [${id}]`);
	await admin.close();
	// Connected to the test's database itself: `use` would switch only the pool connection that ran it, and a
	// query on any other connection the pool opens would run in master.
	const client = await new mssql.ConnectionPool({ ...params, database: id }).connect();
	const close = async () => {
		await client.close();
		const dropper = await new mssql.ConnectionPool(params).connect();
		try {
			// Rolls back and closes what a test left connected (a pool of its own, an open transaction).
			await dropper.query(`alter database [${id}] set single_user with rollback immediate; drop database [${id}];`);
		} finally {
			await dropper.close();
		}
	};
	const db = drizzle({ client, relations });
	return { client, close, url, url2, db };
};

export const test = base.extend<
	{
		connection: { client: mssql.ConnectionPool; url: string; url2: string; db: NodeMsSqlDatabase<typeof relations> };
		client: mssql.ConnectionPool;
		url: string;
		url2: string;
		db: NodeMsSqlDatabase<typeof relations>;
		query: (sql: string) => Promise<any[]>;
		push: (schema: any, params?: { log: 'statements' }) => Promise<void>;
		createDB: {
			<S extends MsSqlSchema>(schema: S): NodeMsSqlDatabase<ReturnType<typeof defineRelations<S>>>;
			<S extends MsSqlSchema, TConfig extends AnyRelationsBuilderConfig>(
				schema: S,
				cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
				useJitMappers?: boolean,
				paramsInErrors?: boolean,
			): NodeMsSqlDatabase<ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>>;
		};
	}
>({
	connection: [
		// oxlint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const { client, close, url, url2, db } = await createClient();
			try {
				await use({ client, url, url2, db });
			} finally {
				await close();
			}
		},
		{ scope: 'file' },
	],
	client: [
		async ({ connection }, use) => {
			await use(connection.client);
		},
		{ scope: 'file' },
	],
	url: [
		async ({ connection }, use) => {
			await use(connection.url);
		},
		{ scope: 'file' },
	],
	url2: [
		async ({ connection }, use) => {
			await use(connection.url2);
		},
		{ scope: 'file' },
	],
	db: [
		async ({ connection }, use) => {
			await use(connection.db);
		},
		{ scope: 'file' },
	],
	query: [
		async ({ connection }, use) => {
			await use(async (sql: string) => (await connection.client.query(sql)).recordset ?? []);
		},
		{ scope: 'test' },
	],
	push: [
		async ({ query }, use) => {
			await use((schema, params) => _push(query, schema, params?.log));
		},
		{ scope: 'test' },
	],
	createDB: [
		async ({ connection }, use) => {
			const createDB = <S extends MsSqlSchema>(
				schema: S,
				cb?: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => AnyRelationsBuilderConfig,
				useJitMappers?: boolean,
				paramsInErrors?: boolean,
			) => {
				const relations = cb ? defineRelations(schema, cb as any) : defineRelations(schema);

				return drizzle({ client: connection.client, relations, jit: useJitMappers, paramsInErrors });
			};

			await use(createDB as any);
		},
		{ scope: 'test' },
	],
});

export type Test = typeof test;
