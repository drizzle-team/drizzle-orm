import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SQLiteRelationalQuery, type SQLiteRelationalQueryHKTBase } from '~/sqlite-core/query-builders/query.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { SQLiteAsyncPreparedQuery, SQLiteAsyncSession } from './session.ts';

export interface SQLiteAsyncRelationalQueryHKT extends SQLiteRelationalQueryHKTBase {
	_type: SQLiteAsyncRelationalQueryKind<Assume<this['type'], 'sync' | 'async'>, this['result']>;
}

export type SQLiteAsyncRelationalQueryKind<TType extends 'sync' | 'async', TResult> = TType extends 'async'
	? SQLiteAsyncRelationalQuery<'async', TResult>
	: SQLiteSyncRelationalQuery<TResult>;

export type AnySQLiteAsyncRelationalQuery = SQLiteAsyncRelationalQuery<any, any>;

// oxlint-disable-next-line no-unused-vars
export interface SQLiteAsyncRelationalQuery<TType extends 'sync' | 'async', TResult> extends QueryPromise<TResult> {}

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

	/** @internal */
	_prepare(
		prepare = false,
	): SQLiteAsyncPreparedQuery<PreparedQueryConfig & { type: TType; all: TResult; get: TResult; execute: TResult }> {
		const { query, builtQuery } = this._toSQL();

		const mapper = this.dialect.mapperGenerators.relationalRows({
			isFirst: this.mode === 'first',
			parseJson: true,
			parseJsonIfString: false,
			rootJsonMappers: false,
			selection: query.selection,
			arrayModeRoot: true,
		});

		return this.session.prepareQuery(
			builtQuery,
			'arrays',
			prepare,
			// Do not use 'get' - mapper returns an item instead of an array, would break on session's destructuring; query itself is already limited to 1 item, so no performance overhead occurs.
			'all',
			mapper,
		) as SQLiteAsyncPreparedQuery<PreparedQueryConfig & { type: TType; all: TResult; get: TResult; execute: TResult }>;
	}

	prepare(): SQLiteAsyncPreparedQuery<
		PreparedQueryConfig & { type: TType; all: TResult; get: TResult; execute: TResult }
	> {
		return this._prepare(true);
	}

	async execute(placeholderValues?: Record<string, unknown>): Promise<TResult> {
		return this._prepare().execute(placeholderValues) as Promise<TResult>;
	}
}

export class SQLiteSyncRelationalQuery<TResult> extends SQLiteAsyncRelationalQuery<'sync', TResult> {
	static override readonly [entityKind]: string = 'SQLiteSyncRelationalQueryV2';

	sync(placeholderValues?: Record<string, unknown>): TResult {
		return this._prepare().execute(placeholderValues).sync() as TResult;
	}
}

applyMixins(SQLiteAsyncRelationalQuery, [QueryPromise]);
