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

export function parseMssqlUrl(urlString: string) {
	const url = new URL(urlString);
	return {
		user: url.username,
		password: url.password,
		server: url.hostname,
		port: Number.parseInt(url.port, 10),
		database: url.pathname.replace(/^\//, ''),
		options: {
			encrypt: url.searchParams.get('encrypt') === 'true',
			trustServerCertificate: url.searchParams.get('trustServerCertificate') === 'true',
		},
	};
}

export const createClient = async () => {
	const url = process.env['MSSQL_CONNECTION_STRING'];
	if (!url) {
		throw new Error(
			'MSSQL_CONNECTION_STRING is not set. Bring DBs up with `bash compose/dockers.sh up mssql` and export the connection string (e.g. `mssql://SA:drizzle123PASSWORD!@127.0.0.1:1433?encrypt=true&trustServerCertificate=true`) before running tests.',
		);
	}
	const close = () => Promise.resolve();
	const params = parseMssqlUrl(url);

	const url2 = `Server=localhost,${params.port};User Id=SA;Password=drizzle123PASSWORD!;TrustServerCertificate=True;`;

	const client = await mssql.connect(params);
	const id = `db${randomUUID().split('-')[0]}`;
	await client.query('select 1');
	await client.query(`create database ${id}`);
	await client.query(`use ${id}`);
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
			) => {
				const relations = cb ? defineRelations(schema, cb as any) : defineRelations(schema);

				return drizzle({ client: connection.client, relations, jit: useJitMappers });
			};

			await use(createDB as any);
		},
		{ scope: 'test' },
	],
});

export type Test = typeof test;
