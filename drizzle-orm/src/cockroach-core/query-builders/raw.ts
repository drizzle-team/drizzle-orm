import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';

export interface CockroachRaw<TResult> extends QueryPromise<TResult>, RunnableQuery<TResult, 'cockroach'>, SQLWrapper {}

export class CockroachRaw<TResult> extends QueryPromise<TResult>
	implements RunnableQuery<TResult, 'cockroach'>, SQLWrapper, PreparedQuery
{
	static override readonly [entityKind]: string = 'CockroachRaw';

	declare readonly _: {
		readonly dialect: 'cockroach';
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

	/** @internal */
	isResponseInArrayMode() {
		return false;
	}
}
