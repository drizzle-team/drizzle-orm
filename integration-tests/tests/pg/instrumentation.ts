import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import {
	PgDatabase,
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
import { release } from 'os';
import { test as base } from 'vitest';
import { relations } from './relations';

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

const prepareNeonClient = async (db: string) => {
	const url = new URL(process.env['NEON_CONNECTION_STRING']!);
	url.pathname = `/${db}`;
	const client = neon(url.toString());

	await client('drop schema if exists public, "mySchema" cascade;');
	await client('create schema public;');

	const query = async (sql: string, params: any[] = []) => {
		const res = await client(sql, params);
		return res as any[];
	};

	const batch = async (statements: string[]) => {
		return Promise.all([
			statements.map((x) => client(x)),
		]).then((x) => x as any);
	};

	return { client, query, batch };
};

export const prepareNeonClientsProvider = async () => {
	// const apiKey = process.env['NEON_API_KEY']!;

	// await fetch(
	// 	`https://console.neon.tech/api/v2/projects/small-resonance-31171552/branches/br-divine-fire-ag4fzm6d/reset`,
	// 	{
	// 		method: 'POST',
	// 		headers: {
	// 			Authorization: `Bearer ${apiKey}`,
	// 			'Content-Type': 'application/json',
	// 		},
	// 		body: JSON.stringify({
	// 			source_branch_id: 'br-wild-wildflower-agazwijm',
	// 		}),
	// 	},
	// );

	// const sql = neon(process.env['NEON_CONNECTION_STRING']!);
	// await sql`select 1;` // wait for branch to be ready after reset

	const clients = [
		await prepareNeonClient('db0'),
		await prepareNeonClient('db1'),
		await prepareNeonClient('db2'),
		await prepareNeonClient('db3'),
		await prepareNeonClient('db4'),
		await prepareNeonClient('db5'),
		await prepareNeonClient('db6'),
		await prepareNeonClient('db7'),
		await prepareNeonClient('db8'),
		await prepareNeonClient('db9'),
	];

	const provider = async () => {
		while (true) {
			const c = clients.shift();
			if (!c) {
				console.log('slip');
				sleep(50);
				continue;
			}
			return {
				...c,
				release: () => {
					clients.push(c);
				},
			};
		}
	};

	return provider;
};

type Provider = Awaited<ReturnType<typeof prepareNeonClientsProvider>>;

export const neonTest = base.extend<{
	provider: Provider;
	kit: {
		client: NeonQueryFunction<false, false>;
		query: (sql: string, params?: any[]) => Promise<any[]>;
		batch: (statements: string[]) => Promise<any>;
	};
	client: NeonQueryFunction<false, false>;
	db: PgDatabase<any, any, typeof relations>;
	push: (schema: any) => Promise<void>;
}>({
	provider: [
		// oxlint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const provider = await prepareNeonClientsProvider();
			await use(provider);
			release();
		},
		{ scope: 'file' },
	],
	kit: [
		// oxlint-disable-next-line no-empty-pattern
		async ({ provider }, use) => {
			const { client, batch, query } = await provider();
			await use({ client, query, batch });
			release();
		},
		{ scope: 'test' },
	],
	client: [
		async ({ kit }, use) => {
			await use(kit.client);
			release();
		},
		{ scope: 'test' },
	],
	db: [
		async ({ kit }, use) => {
			const db = drizzle({ client: kit.client, relations });
			await use(db);
			release();
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
