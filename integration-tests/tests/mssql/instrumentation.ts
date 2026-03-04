import { randomUUID } from 'crypto';
import Docker from 'dockerode';
import { defineRelations } from 'drizzle-orm';
import type { NodeMsSqlDatabase } from 'drizzle-orm/node-mssql';
import { drizzle } from 'drizzle-orm/node-mssql';
import getPort from 'get-port';
import mssql from 'mssql';
import { test as base } from 'vitest';
import * as schema from './mssql.schema';

export async function createDockerDB(): Promise<{ close: () => Promise<void>; url: string }> {
	const docker = new Docker();
	const port = await getPort({ port: 1433 });
	const image = 'mcr.microsoft.com/azure-sql-edge';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	const mssqlContainer = await docker.createContainer({
		Image: image,
		Env: ['ACCEPT_EULA=1', 'MSSQL_SA_PASSWORD=drizzle123PASSWORD!'],
		name: `drizzle-integration-tests-${randomUUID()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'1433/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await mssqlContainer.start();

	const close = async () => {
		await mssqlContainer.remove();
	};

	return {
		url: `mssql://SA:drizzle123PASSWORD!@localhost:${port}?encrypt=true&trustServerCertificate=true`,
		close,
	};
}

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
	const envurl = process.env['MSSQL_CONNECTION_STRING'];
	const { url, close } = envurl ? { url: envurl, close: () => Promise.resolve() } : await createDockerDB();
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
