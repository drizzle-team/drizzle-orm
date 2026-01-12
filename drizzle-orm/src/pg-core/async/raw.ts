import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { applyMixins } from '~/utils.ts';
import { PgRaw } from '../query-builders/raw.ts';

export interface PgAsyncRaw<TResult> extends QueryPromise<TResult>, RunnableQuery<TResult, 'pg'>, SQLWrapper {}
export class PgAsyncRaw<TResult> extends PgRaw<TResult> implements RunnableQuery<TResult, 'pg'> {
	static override readonly [entityKind]: string = 'PgAsyncRaw';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	constructor(
		public execute: () => Promise<TResult>,
		sql: SQL,
		query: Query,
		mapBatchResult: (result: unknown) => unknown,
	) {
		super(sql, query, mapBatchResult);
	}

	_prepare(): PreparedQuery {
		return this;
	}
}

applyMixins(PgAsyncRaw, [QueryPromise]);
