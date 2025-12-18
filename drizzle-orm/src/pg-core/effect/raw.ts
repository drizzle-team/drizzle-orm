import { QueryEffect } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { DrizzleQueryError } from '~/errors.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';

export interface EffectPgRaw<TResult>
	extends QueryEffect<TResult, DrizzleQueryError>, RunnableQuery<TResult, 'pg'>, SQLWrapper
{}

export class EffectPgRaw<TResult> extends QueryEffect<TResult, DrizzleQueryError>
	implements RunnableQuery<TResult, 'pg'>, SQLWrapper, PreparedQuery
{
	static override readonly [entityKind]: string = 'EffectPgRaw';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	constructor(
		public execute: QueryEffect<TResult, DrizzleQueryError>['execute'],
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
