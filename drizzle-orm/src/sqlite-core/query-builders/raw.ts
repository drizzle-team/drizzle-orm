import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { PreparedQuery } from '~/session.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '../dialect.ts';

type SQLiteRawAction = 'all' | 'get' | 'values' | 'run';
export interface SQLiteRawConfig {
	action: SQLiteRawAction;
}

export interface SQLiteRaw<TResult> extends QueryPromise<TResult>, RunnableQuery<TResult, 'sqlite'>, SQLWrapper {}

export class SQLiteRaw<TResult> extends QueryPromise<TResult>
	implements RunnableQuery<TResult, 'sqlite'>, SQLWrapper, PreparedQuery
{
	static override readonly [entityKind]: string = 'SQLiteRaw';

	declare readonly _: {
		readonly dialect: 'sqlite';
		readonly result: TResult;
	};

	/** @internal */
	config: SQLiteRawConfig;

	constructor(
		public execute: () => Promise<TResult>,
		/** @internal */
		public getSQL: () => SQL,
		action: SQLiteRawAction,
		private dialect: SQLiteAsyncDialect,
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
