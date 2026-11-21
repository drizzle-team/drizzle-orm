import { parseMssqlUrl, requireEnv, workerDatabaseName } from '@drizzle/test-utils';
import { drizzle, MsSqlDatabase } from 'drizzle-orm/node-mssql';
import mssql from 'mssql';
import { test as base } from 'vitest';

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
			db: MsSqlDatabase<any, any, any>;
			push: (schema: any) => Promise<void>;
		}
	>({
		client: [
			// oxlint-disable-next-line
			async ({}, use) => {
				const envurl = requireEnv('MSSQL_CONNECTION_STRING');

				const options = parseMssqlUrl(envurl);
				// A database of this worker's own (test files run side by side), connected to directly: `use` on a pool
				// switches only the connection that ran it. On a self-hosted machine every job's tests share one server;
				// DRIZZLE_TEST_DB_PREFIX names the job's.
				const database = workerDatabaseName();
				const admin = await new mssql.ConnectionPool(options).connect();
				await admin.query(
					`if db_id(N'${database}') is not null begin alter database [${database}] set single_user with rollback immediate; drop database [${database}]; end; create database [${database}]; alter database [${database}] set parameterization forced;`,
				);
				await admin.close();
				const client = await new mssql.ConnectionPool({ ...options, database }).connect();

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

				await use({ client, query, batch });
				await client.close();
				const dropper = await new mssql.ConnectionPool(options).connect();
				await dropper.query(
					`alter database [${database}] set single_user with rollback immediate; drop database [${database}];`,
				);
				await dropper.close();
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
