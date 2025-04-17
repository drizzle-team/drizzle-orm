import retry from 'async-retry';
import type { SingleStoreRemoteDatabase } from 'drizzle-orm/singlestore-proxy';
import { drizzle as proxyDrizzle } from 'drizzle-orm/singlestore-proxy';
import * as mysql2 from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { skipTests } from '~/common';
import { createDockerDB, tests } from './singlestore-common';

const ENABLE_LOGGING = false;

// eslint-disable-next-line drizzle-internal/require-entity-kind
class ServerSimulator {
	constructor(private db: mysql2.Connection) {}

	async query(sql: string, params: any[], method: 'all' | 'execute') {
		if (method === 'all') {
			try {
				const result = await this.db.query({
					sql,
					values: params,
					rowsAsArray: true,
					typeCast: function(field: any, next: any) {
						if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
							return field.string();
						}
						return next();
					},
				});

				return { data: result[0] as any };
			} catch (e: any) {
				return { error: e };
			}
		} else if (method === 'execute') {
			try {
				const result = await this.db.query({
					sql,
					values: params,
					typeCast: function(field: any, next: any) {
						if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
							return field.string();
						}
						return next();
					},
				});

				return { data: result as any };
			} catch (e: any) {
				return { error: e };
			}
		} else {
			return { error: 'Unknown method value' };
		}
	}

	async migrations(queries: string[]) {
		await this.db.query('START TRANSACTION');
		try {
			for (const query of queries) {
				await this.db.query(query);
			}
			await this.db.query('COMMIT');
		} catch (e) {
			await this.db.query('ROLLBACK');
			throw e;
		}

		return {};
	}
}

let db: SingleStoreRemoteDatabase;
let client: mysql2.Connection;
let serverSimulator: ServerSimulator;

beforeAll(async () => {
	let connectionString;
	if (process.env['SINGLESTORE_CONNECTION_STRING']) {
		connectionString = process.env['SINGLESTORE_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr } = await createDockerDB();
		connectionString = conStr;
	}
	client = await retry(async () => {
		client = await mysql2.createConnection({ uri: connectionString, supportBigNumbers: true });
		await client.connect();
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
		onRetry() {
			client?.end();
		},
	});

	await client.query(`CREATE DATABASE IF NOT EXISTS drizzle;`);
	await client.changeUser({ database: 'drizzle' });

	serverSimulator = new ServerSimulator(client);
	db = proxyDrizzle(async (sql, params, method) => {
		try {
			const response = await serverSimulator.query(sql, params, method);

			if (response.error !== undefined) {
				throw response.error;
			}

			return { rows: response.data };
		} catch (e: any) {
			console.error('Error from singlestore proxy server:', e.message);
			throw e;
		}
	}, { logger: ENABLE_LOGGING });
});

afterAll(async () => {
	await client?.end();
});

beforeEach((ctx) => {
	ctx.singlestore = {
		db,
	};
});

skipTests([
	'select iterator w/ prepared statement',
	'select iterator',
	'nested transaction rollback',
	'nested transaction',
	'transaction rollback',
	'transaction',
	'transaction with options (set isolationLevel)',
	'migrator',
]);

tests();
