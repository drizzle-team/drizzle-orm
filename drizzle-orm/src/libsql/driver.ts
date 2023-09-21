import type { Client, ResultSet } from '@libsql/client';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { SelectResult } from '~/query-builders/select.types.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type {
	SQLiteDelete,
	SQLiteInsert,
	SQLiteSelect,
	SQLiteUpdate,
} from '~/sqlite-core/index.ts';
import type { SQLiteRelationalQuery } from '~/sqlite-core/query-builders/query.ts';
import type { SQLiteRaw } from '~/sqlite-core/query-builders/raw.ts';
import { type DrizzleConfig } from '~/utils.ts';
import { LibSQLSession } from './session.ts';

export type BatchParameters =
	| SQLiteUpdate<any, 'async', ResultSet, any>
	| SQLiteSelect<any, 'async', ResultSet, any, any>
	| SQLiteDelete<any, 'async', ResultSet, any>
	| Omit<SQLiteDelete<any, 'async', ResultSet, any>, 'where'>
	| Omit<SQLiteUpdate<any, 'async', ResultSet, any>, 'where'>
	| SQLiteInsert<any, 'async', ResultSet, any>
	| SQLiteRelationalQuery<'async', any>
	| SQLiteRaw<any>;

export type BatchResponse<U extends BatchParameters, TQuery extends Readonly<[U, ...U[]]>> = {
	[K in keyof TQuery]: TQuery[K] extends
		SQLiteSelect<infer _TTable, 'async', infer _TRes, infer TSelection, infer TSelectMode, infer TNullabilityMap>
		? SelectResult<TSelection, TSelectMode, TNullabilityMap>[]
		: TQuery[K] extends SQLiteUpdate<infer _TTable, 'async', infer _TRunResult, infer _TReturning>
			? _TReturning extends undefined ? _TRunResult : _TReturning[]
		: TQuery[K] extends Omit<SQLiteUpdate<infer _TTable, 'async', infer _TRunResult, infer _TReturning>, 'where'>
			? _TReturning extends undefined ? _TRunResult : _TReturning[]
		: TQuery[K] extends SQLiteInsert<infer _TTable, 'async', infer _TRunResult, infer _TReturning>
			? _TReturning extends undefined ? _TRunResult : _TReturning[]
		: TQuery[K] extends SQLiteDelete<infer _TTable, 'async', infer _TRunResult, infer _TReturning>
			? _TReturning extends undefined ? _TRunResult : _TReturning[]
		: TQuery[K] extends Omit<SQLiteDelete<infer _TTable, 'async', infer _TRunResult, infer _TReturning>, 'where'>
			? _TReturning extends undefined ? _TRunResult : _TReturning[]
		: TQuery[K] extends SQLiteRelationalQuery<'async', infer TResult> ? TResult
		: TQuery[K] extends SQLiteRaw<infer TResult> ? TResult
		: never;
};

export class LibSQLDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'async', ResultSet, TSchema> {
	static readonly [entityKind]: string = 'LibSQLDatabase';

	async batch<U extends BatchParameters, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<U, T>> {
		return await (this.session as LibSQLSession<TSchema, any>).batch(batch) as BatchResponse<U, T>;
	}
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(client: Client, config: DrizzleConfig<TSchema> = {}): LibSQLDatabase<TSchema> {
	const dialect = new SQLiteAsyncDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = extractTablesRelationalConfig(
			config.schema,
			createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const session = new LibSQLSession(client, dialect, schema, { logger }, undefined);
	return new LibSQLDatabase('async', dialect, session, schema) as LibSQLDatabase<TSchema>;
}
