import { randomUUID } from 'crypto';
import { defineRelations } from 'drizzle-orm';
import type { NodeMsSqlDatabase } from 'drizzle-orm/node-mssql';
import { drizzle } from 'drizzle-orm/node-mssql';
import mssql from 'mssql';
import { test as base } from 'vitest';
import * as schema from './mssql.schema';

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
	const db = drizzle({ client, schema, relations: defineRelations(schema) });
	return { client, close, url, url2, db };
};

export const test = base.extend<
	{
		connection: { client: mssql.ConnectionPool; url: string; url2: string; db: NodeMsSqlDatabase<typeof schema> };
		client: mssql.ConnectionPool;
		url: string;
		url2: string;
		db: NodeMsSqlDatabase<typeof schema>;
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
});
