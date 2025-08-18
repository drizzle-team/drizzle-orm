import retry from 'async-retry';
import type { MySqlRemoteDatabase } from 'drizzle-orm/mysql-proxy';
import { drizzle as proxyDrizzle } from 'drizzle-orm/mysql-proxy';
import * as mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { skipTests } from '~/common';
import { createDockerDB, tests } from './mysql-common';

const ENABLE_LOGGING = false;

// eslint-disable-next-line drizzle-internal/require-entity-kind
class ServerSimulator {
	constructor(private db: mysql.Connection) {}

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

let db: MySqlRemoteDatabase;
let client: mysql.Connection;
let serverSimulator: ServerSimulator;

beforeAll(async () => {
	let connectionString;
	if (process.env['MYSQL_CONNECTION_STRING']) {
		connectionString = process.env['MYSQL_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr } = await createDockerDB();
		connectionString = conStr;
	}
	client = await retry(async () => {
		client = await mysql.createConnection({
			uri: connectionString,
			supportBigNumbers: true,
		});
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
	serverSimulator = new ServerSimulator(client);
	db = proxyDrizzle(async (sql, params, method) => {
		try {
			const response = await serverSimulator.query(sql, params, method);

			if (response.error !== undefined) {
				throw response.error;
			}

			return { rows: response.data };
		} catch (e: any) {
			console.error('Error from mysql proxy server:', e.message);
			throw e;
		}
	}, { logger: ENABLE_LOGGING });
});

afterAll(async () => {
	await client?.end();
});

beforeEach((ctx) => {
	ctx.mysql = {
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
