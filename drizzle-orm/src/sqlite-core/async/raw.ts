import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { SQLiteRaw } from '~/sqlite-core/query-builders/raw.ts';
import { applyMixins } from '~/utils.ts';
import type { SQLiteAsyncPreparedQuery, SQLiteAsyncPreparedQueryConfig } from './session.ts';

export interface SQLiteAsyncRaw<TResult>
	extends SQLiteRaw<TResult>, QueryPromise<TResult>, RunnableQuery<TResult, 'sqlite'>, SQLWrapper
{}

export class SQLiteAsyncRaw<TResult> extends SQLiteRaw<TResult>
	implements RunnableQuery<TResult, 'sqlite'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'SQLiteAsyncRaw';

	declare protected prepared: SQLiteAsyncPreparedQuery<
		SQLiteAsyncPreparedQueryConfig & {
			execute: TResult;
		}
	>;

	constructor(
		prepared: SQLiteAsyncPreparedQuery<
			SQLiteAsyncPreparedQueryConfig & {
				execute: TResult;
			}
		>,
		sql: SQL,
		query: Query,
	) {
		super(prepared, sql, query);
	}

	execute(placeholderValues?: Record<string, undefined>): Promise<TResult> {
		return this.prepared.execute(placeholderValues) as Promise<TResult>;
	}
}

applyMixins(SQLiteAsyncRaw, [QueryPromise]);

export type DBResult<TKind extends 'sync' | 'async', TResult> = TKind extends 'async' ? SQLiteAsyncRaw<TResult>
	: TResult;
