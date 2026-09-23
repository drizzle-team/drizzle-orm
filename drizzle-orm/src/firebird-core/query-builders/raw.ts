import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { PreparedQuery } from '~/session.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { FirebirdAsyncDialect } from '../dialect.ts';

type FirebirdRawAction = 'all' | 'get' | 'values' | 'run';
export interface FirebirdRawConfig {
	action: FirebirdRawAction;
}

export interface FirebirdRaw<TResult> extends QueryPromise<TResult>, RunnableQuery<TResult, 'firebird'>, SQLWrapper {}

export class FirebirdRaw<TResult> extends QueryPromise<TResult>
	implements RunnableQuery<TResult, 'firebird'>, SQLWrapper, PreparedQuery
{
	static override readonly [entityKind]: string = 'FirebirdRaw';

	declare readonly _: {
		readonly dialect: 'firebird';
		readonly result: TResult;
	};

	/** @internal */
	config: FirebirdRawConfig;

	constructor(
		public execute: () => Promise<TResult>,
		/** @internal */
		public getSQL: () => SQL,
		action: FirebirdRawAction,
		private dialect: FirebirdAsyncDialect,
		private mapBatchResult: (result: unknown) => unknown,
	) {
		super();
		this.config = { action };
	}

	getQuery() {
		return { ...this.dialect.sqlToQuery(this.getSQL()), method: this.config.action };
	}

	mapResult(result: unknown, isFromBatch?: boolean) {
		return isFromBatch ? this.mapBatchResult(result) : result;
	}

	_prepare(): PreparedQuery {
		return this;
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return false;
	}
}
