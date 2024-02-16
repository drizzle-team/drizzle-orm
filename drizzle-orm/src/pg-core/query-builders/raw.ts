import { entityKind } from '~/entity';
import { QueryPromise } from '~/query-promise';
import type { RunnableQuery } from '~/runnable-query';
import type { PreparedQuery } from '~/session';
import type { Query, SQL, SQLWrapper } from '~/sql/sql';

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
