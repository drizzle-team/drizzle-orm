import type { MySqlDatabase } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/node-mssql';
import mssql from 'mssql';
import { test as base } from 'vitest';
import { parseMssqlUrl } from './utils';

const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
) => {
	const { diff } = await import('../../../drizzle-kit/tests/mssql/mocks' as string);

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
				client: mssql.ConnectionPool;
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
				const envurl = process.env['MSSQL_CONNECTION_STRING'];
				if (!envurl) throw new Error('No mssql url provided');

				const options = parseMssqlUrl(envurl);
				const client = await mssql.connect(options);
				await client.connect();

				const query = async (sql: string, params: any[] = []) => {
					const request = client.request();
					for (const [index, param] of params.entries()) {
						request.input(`par${index}`, param);
					}

					const res = await request.query(sql);
					return res.recordset as any[];
				};
				const batch = async (statements: string[]) => {
					return client.query(statements.map((x) => x.endsWith(';') ? x : `${x};`).join('\n')).then(() => '' as any);
				};

				await client.query('drop database if exists drizzle;');
				await client.query('create database drizzle;');
				await client.query('use drizzle;');

				await use({ client, query, batch });
				await client.close();
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

export const mssqlTest = prepareTest();
export type Test = ReturnType<typeof prepareTest>;
