import type { MySqlDatabase } from 'drizzle-orm/mysql-core';
import type { AnyMySql2Connection } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/singlestore';
import { createConnection } from 'mysql2/promise';
import { test as base } from 'vitest';

const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
) => {
	const { diff } = await import('../../../drizzle-kit/tests/singlestore/mocks' as string);

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
				client: AnyMySql2Connection;
				query: (sql: string, params: any[]) => Promise<any[]>;
				batch: (statements: string[]) => Promise<void>;
			};
			db: MySqlDatabase<any, any, any, any>;
			push: (schema: any) => Promise<void>;
		}
	>({
		client: [
			// oxlint-disable-next-line
			async ({}, use) => {
				const envurl = process.env['SINGLESTORE_CONNECTION_STRING'];
				if (!envurl) throw new Error('No singlestore url provided');
				const client = await createConnection({
					uri: envurl,
					supportBigNumbers: true,
					multipleStatements: true,
				});
				await client.connect();

				const query = async (sql: string, params: any[] = []) => {
					const res = await client.query(sql, params);
					return res[0] as any[];
				};
				const batch = async (statements: string[]) => {
					return client.query(statements.map((x) => x.endsWith(';') ? x : `${x};`).join('\n')).then(() => '' as any);
				};

				await batch(['drop database if exists drizzle;', 'create database drizzle;', 'use drizzle;']);

				await use({ client, query, batch });
				await client.end();
				client.destroy();
			},
			{ scope: 'worker' },
		],
		db: [
			async ({ client }, use) => {
				const db = drizzle({ client: client.client as AnyMySql2Connection });
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

export const singlestoreTest = prepareTest();
export type Test = ReturnType<typeof prepareTest>;
