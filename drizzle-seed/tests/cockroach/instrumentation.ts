import { requireEnv, workerDatabaseName } from '@drizzle/test-utils';
import { drizzle } from 'drizzle-orm/cockroach';
import type { CockroachDatabase } from 'drizzle-orm/cockroach-core';
import { Client } from 'pg';
import { test as base } from 'vitest';

const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
) => {
	const { diff } = await import('../../../drizzle-kit/tests/cockroach/mocks' as string);

	const res = await diff({}, schema, []);
	for (const s of res.sqlStatements) {
		await query(s, []).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

const prepareTest = () => {
	return base.extend<
		{
			client: {
				client: Client;
				query: (sql: string, params: any[]) => Promise<any[]>;
				batch: (statements: string[]) => Promise<void>;
			};
			db: CockroachDatabase<any, any>;
			push: (schema: any) => Promise<void>;
		}
	>({
		client: [
			// oxlint-disable-next-line
			async ({}, use) => {
				const envurl = requireEnv('COCKROACH_CONNECTION_STRING');

				const client = new Client(envurl);
				await client.connect();

				const query = async (sql: string, params: any[] = []) => {
					const res = await client.query(sql, params);
					return res.rows as any[];
				};
				const batch = async (statements: string[]) => {
					return client.query(statements.map((x) => x.endsWith(';') ? x : `${x};`).join('\n')).then(() => '' as any);
				};

				// A database for this worker alone: test files run side by side.
				const database = workerDatabaseName();
				await batch([
					`drop database if exists "${database}" cascade;`,
					`create database "${database}";`,
					`use "${database}";`,
				]);

				await use({ client, query, batch });
				await batch(['use defaultdb;', `drop database if exists "${database}" cascade;`]);
				await client.end();
			},
			{ scope: 'worker' },
		],
		db: [
			async ({ client }, use) => {
				const db = drizzle({ client: client.client });
				await use(db as any);
			},
			{ scope: 'worker' },
		],
		push: [
			async ({ client }, use) => {
				const { query } = client;
				const push = (
					schema: any,
				) => _push(query, schema);

				await use(push);
			},
			{ scope: 'worker' },
		],
	});
};

export const cockroachTest = prepareTest();
export type Test = ReturnType<typeof prepareTest>;
