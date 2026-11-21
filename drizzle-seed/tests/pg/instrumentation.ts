import { createProvider, requireEnv, workerDatabaseName } from '@drizzle/test-utils';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { Client } from 'pg';
import { test as base } from 'vitest';

const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
) => {
	const { diff } = await import('../../../drizzle-kit/tests/postgres/mocks' as string);

	const res = await diff({}, schema, []);
	for (const s of res.sqlStatements) {
		await query(s, []).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

export const preparePglite = async () => {
	const client = new PGlite({ extensions: { vector } });
	await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
	await client.query('create schema "mySchema";');

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.query(sql, params);
		return res.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(statements.map((x) => client.query(x))).then((results) => [results] as any);
	};

	return { client, query, batch, close: () => client.close() };
};

// A database for this worker alone, copied from the image's PostGIS template: test files run side by side. The
// URL's database is the job's; it only serves to connect for the copy.
export const prepareNodePostgres = async () => {
	const envUrl = requireEnv('PG_POSTGIS_CONNECTION_STRING');
	const database = workerDatabaseName();
	const admin = new Client(envUrl);
	await admin.connect();
	await admin.query(`drop database if exists "${database}" with (force)`);
	for (let attempt = 1;; attempt++) {
		try {
			await admin.query(`create database "${database}" template template_postgis`);
			break;
		} catch (error) {
			// 55006 (object_in_use): another worker is copying the template at this moment; it clears in milliseconds.
			if ((error as { code?: string }).code !== '55006' || attempt === 50) throw error;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}

	const url = new URL(envUrl);
	url.pathname = `/${database}`;
	const client = new Client(url.toString());
	await client.connect();

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.query(sql, params);
		return res.rows as any[];
	};
	const batch = async (statements: string[]) => {
		return client.query(statements.map((x) => x.endsWith(';') ? x : `${x};`).join('\n')).then(() => '' as any);
	};
	const close = async () => {
		await client.end();
		await admin.query(`drop database if exists "${database}" with (force)`);
		await admin.end();
	};

	return { client, query, batch, close };
};

export const provideForPglite = async () => {
	const clients = [
		await preparePglite(),
	];

	return { provider: createProvider(clients), close: () => Promise.all(clients.map((it) => it.close())) };
};

export const provideForNodePostgres = async () => {
	const clients = [
		await prepareNodePostgres(),
	];

	return { provider: createProvider(clients), close: () => Promise.all(clients.map((it) => it.close())) };
};

type ProvideForPglite = Awaited<ReturnType<typeof provideForPglite>>['provider'];
type ProvideForNodePostgres = Awaited<ReturnType<typeof provideForNodePostgres>>['provider'];

type Provider =
	| ProvideForPglite
	| ProvideForNodePostgres;

const prepareTest = (dbType: 'pglite' | 'postgis') => {
	return base.extend<
		{
			provider: Provider;
			kit: {
				client: any;
				query: (sql: string, params?: any[]) => Promise<any[]>;
				batch: (statements: string[]) => Promise<any>;
			};
			client: any;
			db: PgAsyncDatabase<any, any>;
			push: (schema: any) => Promise<void>;
		}
	>({
		provider: [
			// oxlint-disable-next-line no-empty-pattern
			async ({}, use) => {
				const { provider, close } = dbType === 'postgis'
					? await provideForNodePostgres()
					: dbType === 'pglite'
					? await provideForPglite()
					: '' as never;

				await use(provider);
				await close();
			},
			{ scope: 'file' },
		],
		kit: [
			async ({ provider }, use) => {
				const { client, batch, query, release } = await provider();
				await use({ client: client as any, query, batch });
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
				const db = dbType === 'postgis'
					? drizzleNodePostgres({ client: kit.client })
					: dbType === 'pglite'
					? drizzlePglite({ client: kit.client })
					: '' as never;

				await use(db);
			},
			{ scope: 'test' },
		],
		push: [
			async ({ kit }, use) => {
				const push = (
					schema: any,
				) => _push(kit.query, schema);

				await use(push);
			},
			{ scope: 'test' },
		],
	});
};

export const pgPostgisTest = prepareTest('postgis');
export const pgliteTest = prepareTest('pglite');
export type Test = ReturnType<typeof prepareTest>;
