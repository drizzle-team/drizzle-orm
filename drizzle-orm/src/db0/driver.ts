import type { Database } from 'db0';
import type { DrizzleConfig } from '~/utils.ts';
import { isConfig } from '~/utils.ts';
import { constructPg, type Db0PgDatabase } from './pg/index.ts';
import { constructSqlite, type Db0SQLiteDatabase } from './sqlite/index.ts';

export type Db0Database = Db0SQLiteDatabase<any> | Db0PgDatabase<any>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	...params:
		| [Database]
		| [Database, DrizzleConfig<TSchema>]
		| [DrizzleConfig<TSchema> & { client: Database }]
): Db0Database & { $client: Database } {
	if (isConfig(params[0])) {
		const { client, ...drizzleConfig } = params[0] as DrizzleConfig<TSchema> & { client: Database };
		return drizzleInternal(client, drizzleConfig);
	}

	return drizzleInternal(params[0] as Database, params[1] as DrizzleConfig<TSchema> | undefined);
}

function drizzleInternal<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Database,
	config: DrizzleConfig<TSchema> = {},
): Db0Database & { $client: Database } {
	const dialect = client.dialect;

	switch (dialect) {
		case 'sqlite':
		case 'libsql':
			return constructSqlite(client, config) as any;
		case 'postgresql':
			return constructPg(client, config) as any;
		case 'mysql':
			throw new Error('drizzle-orm/db0: MySQL support is not yet implemented');
		default:
			throw new Error(`drizzle-orm/db0: Unsupported db0 dialect: ${dialect}`);
	}
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): Db0Database & { $client: '$client is not available on drizzle.mock()' } {
		return constructSqlite({} as any, config) as any;
	}
}
