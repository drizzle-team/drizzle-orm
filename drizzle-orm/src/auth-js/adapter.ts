import type { Adapter } from '@auth/core/adapters';
import { is } from '~/entity.ts';
import { MySqlDatabase } from '~/mysql-core/index.ts';
import { PgAsyncDatabase } from '~/pg-core/index.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/index.ts';
import { assertUnreachable } from '~/utils.ts';
import { type DefaultMySqlSchema, defineAdapter as mysqlDefineAdapter } from './mysql-adapter.ts';
import { type DefaultPostgresSchema, defineAdapter as pgDefineAdapter } from './pg-adapter.ts';
import { type DefaultSqliteSchema, defineAdapter as sqliteDefineAdapter } from './sqlite-adapter.ts';

export type DefaultSchema<T extends DB> = T extends MySqlDatabase<any, any> ? DefaultMySqlSchema
	: T extends PgAsyncDatabase<any, any> ? DefaultPostgresSchema
	: T extends BaseSQLiteDatabase<'sync' | 'async', any, any> ? DefaultSqliteSchema
	: never;

export type DB =
	| MySqlDatabase<any, any>
	| PgAsyncDatabase<any, any>
	| BaseSQLiteDatabase<'sync' | 'async', any, any>;

export function drizzleAdapter<T extends DB>(
	db: T,
	schema?: Partial<DefaultSchema<T>>,
): Adapter {
	if (is(db, MySqlDatabase<any, any>)) {
		return mysqlDefineAdapter(db, schema as DefaultMySqlSchema);
	} else if (is(db, PgAsyncDatabase<any, any>)) {
		return pgDefineAdapter(db, schema as DefaultPostgresSchema);
	} else if (is(db, BaseSQLiteDatabase<'sync' | 'async', any, any>)) {
		return sqliteDefineAdapter(db, schema as DefaultSqliteSchema);
	}

	assertUnreachable(db);
}
