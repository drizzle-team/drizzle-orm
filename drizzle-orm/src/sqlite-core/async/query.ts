import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SQLiteRelationalQuery, type SQLiteRelationalQueryHKTBase } from '~/sqlite-core/query-builders/query.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import { SQLiteRunnableQuery } from '../query-builders/runnable.ts';
import type { PreparedQueryConfig } from '../session.ts';
import { SQLiteAsyncRunnableQuery } from './runnable.ts';
import type { SQLiteAsyncPreparedQuery, SQLiteAsyncSession } from './session.ts';

export interface SQLiteAsyncRelationalQueryHKT extends SQLiteRelationalQueryHKTBase {
	_type: SQLiteAsyncRelationalQueryKind<Assume<this['type'], 'sync' | 'async'>, this['result']>;
}

export type SQLiteAsyncRelationalQueryKind<TType extends 'sync' | 'async', TResult> = TType extends 'async'
	? SQLiteAsyncRelationalQuery<'async', TResult>
	: SQLiteSyncRelationalQuery<TResult>;

export type AnySQLiteAsyncRelationalQuery = SQLiteAsyncRelationalQuery<any, any>;

// oxlint-disable-next-line no-unused-vars
export interface SQLiteAsyncRelationalQuery<TType extends 'sync' | 'async', TResult> extends QueryPromise<TResult> {
	/** @internal */
	_prepare(
		prepare?: boolean,
	): SQLiteAsyncPreparedQuery<PreparedQueryConfig & { type: TType; all: TResult; get: TResult; execute: TResult }>;

	prepare(): SQLiteAsyncPreparedQuery<
		PreparedQueryConfig & { type: TType; all: TResult; get: TResult; execute: TResult }
	>;

	/**
	 * Declared rather than inherited from `QueryPromise`, where it's abstract: {@link SQLiteSyncRelationalQuery}
	 * extends this class
	 */
	execute(placeholderValues?: Record<string, unknown>): Promise<TResult>;
}

export class SQLiteAsyncRelationalQuery<TType extends 'sync' | 'async', TResult>
	extends SQLiteRelationalQuery<SQLiteAsyncRelationalQueryHKT, TResult>
	implements RunnableQuery<TResult, 'sqlite'>
{
	static override readonly [entityKind]: string = 'SQLiteAsyncRelationalQueryV2';

	declare readonly _: {
		readonly dialect: 'sqlite';
		readonly hkt: SQLiteAsyncRelationalQueryHKT;
		readonly type: TType;
		readonly result: TResult;
	};

	declare protected session: SQLiteAsyncSession<TType, any, any>;
}

export class SQLiteSyncRelationalQuery<TResult> extends SQLiteAsyncRelationalQuery<'sync', TResult> {
	static override readonly [entityKind]: string = 'SQLiteSyncRelationalQueryV2';

	sync(placeholderValues?: Record<string, unknown>): TResult {
		return this._prepare().execute(placeholderValues).sync() as TResult;
	}
}

applyMixins(SQLiteAsyncRelationalQuery, [QueryPromise, SQLiteRunnableQuery, SQLiteAsyncRunnableQuery]);
