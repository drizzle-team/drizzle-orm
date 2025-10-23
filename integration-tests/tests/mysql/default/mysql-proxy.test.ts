import * as mysql from 'mysql2/promise';
import { skipTests } from '~/common';
import { tests } from '../mysql-common';

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

skipTests([
	'select iterator w/ prepared statement',
	'select iterator',
	'nested transaction rollback',
	'nested transaction',
	'transaction rollback',
	'transaction',
	'transaction with options (set isolationLevel)',
	'migrator',
	'RQB v2 transaction find first - no rows',
	'RQB v2 transaction find first - multiple rows',
	'RQB v2 transaction find first - with relation',
	'RQB v2 transaction find first - placeholders',
	'RQB v2 transaction find many - no rows',
	'RQB v2 transaction find many - multiple rows',
	'RQB v2 transaction find many - with relation',
	'RQB v2 transaction find many - placeholders',
]);

new ServerSimulator({} as any);
tests({} as any);
