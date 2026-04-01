import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
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

	return { client, query, batch };
};

export const prepareNodePostgres = async (db: string = 'drizzle') => {
	const envUrl = process.env['PG_POSTGIS_CONNECTION_STRING'];
	if (!envUrl) throw new Error('PG_POSTGIS_CONNECTION_STRING env is not set.');
	const url = new URL(envUrl);
	url.pathname = `/${db}`;

	const client = new Client(url.toString());
	await client.connect();

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.query(sql, params);
		return res.rows as any[];
	};
	const batch = async (statements: string[]) => {
		return client.query(statements.map((x) => x.endsWith(';') ? x : `${x};`).join('\n')).then(() => '' as any);
	};

	await query('drop schema if exists public cascade;');
	await query('create schema public;');
	await query('create extension if not exists postgis;');

	return { client, query, batch };
};

const providerClosure = async <T>(items: T[]) => {
	return async () => {
		while (true) {
			const c = items.shift();
			if (!c) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				continue;
			}
			return {
				...c,
				release: () => {
					items.push(c);
				},
			};
		}
	};
};

export const provideForPglite = async () => {
	const clients = [
		await preparePglite(),
	];

	return providerClosure(clients);
};

export const provideForNodePostgres = async () => {
	const clients = [
		await prepareNodePostgres(),
	];

	return providerClosure(clients);
};

type ProvideForPglite = Awaited<ReturnType<typeof provideForPglite>>;
type ProvideForNodePostgres = Awaited<ReturnType<typeof provideForNodePostgres>>;

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
			db: PgAsyncDatabase<any, any, any>;
			push: (schema: any) => Promise<void>;
		}
	>({
		provider: [
			// oxlint-disable-next-line no-empty-pattern
			async ({}, use) => {
				const provider = dbType === 'postgis'
					? await provideForNodePostgres()
					: dbType === 'pglite'
					? await provideForPglite()
					: '' as never;

				await use(provider);
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
