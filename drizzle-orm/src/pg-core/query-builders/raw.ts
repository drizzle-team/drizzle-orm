import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';

export interface PgRaw<TResult>
	extends QueryPromise<TResult>, RunnableQuery<TResult, 'pg'>, SQLWrapper, PreparedQuery
{}

export class PgRaw<TResult> extends QueryPromise<TResult>
	implements RunnableQuery<TResult, 'pg'>, SQLWrapper, PreparedQuery
{
	static readonly [entityKind]: string = 'PgRaw';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	constructor(
		public execute: () => Promise<TResult>,
		private sql: SQL,
		private query: Query,
		private mapBatchResult: (result: unknown) => unknown,
	) {
		super();
	}

	/** @internal */
	getSQL() {
		return this.sql;
	}

	getQuery() {
		return this.query;
	}

	mapResult(result: unknown, isFromBatch?: boolean) {
		return isFromBatch ? this.mapBatchResult(result) : result;
	}

	_prepare(): PreparedQuery {
		return this;
	}
}
