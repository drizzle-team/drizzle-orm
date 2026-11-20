import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import { SQLiteRaw } from '~/sqlite-core/query-builders/raw.ts';
import { applyMixins } from '~/utils.ts';

export interface SQLiteAsyncRaw<TResult> extends SQLiteRaw<TResult>, QueryPromise<TResult>, SQLWrapper {}

export class SQLiteAsyncRaw<TResult> extends SQLiteRaw<TResult>
	implements RunnableQuery<TResult, 'sqlite'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'SQLiteAsyncRaw';

	override execute(placeholderValues?: Record<string, unknown>): Promise<TResult> {
		return this.prepared.execute(placeholderValues) as Promise<TResult>;
	}
}

applyMixins(SQLiteAsyncRaw, [QueryPromise]);

export type DBResult<TKind extends 'sync' | 'async', TResult> = TKind extends 'async' ? SQLiteAsyncRaw<TResult>
	: TResult;
