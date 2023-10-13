import { entityKind } from '~/entity.ts';
import type { SQL, SQLWrapper } from '~/index.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { PreparedQuery } from '~/session.ts';
import type { SQLiteAsyncDialect } from '../dialect.ts';

type SQLiteRawAction = 'all' | 'get' | 'values' | 'run';
export interface SQLiteRawConfig {
	action: SQLiteRawAction;
}

export class SQLiteRaw<TResult> extends QueryPromise<TResult> implements RunnableQuery<TResult, 'sqlite'>, SQLWrapper {
	static readonly [entityKind]: string = 'SQLiteRaw';

	declare readonly _: {
		readonly dialect: 'sqlite';
		readonly result: TResult;
	};

	/** @internal */
	config: SQLiteRawConfig;

	constructor(
		private cb: () => Promise<TResult>,
		private getSQLCb: () => SQL,
		action: SQLiteRawAction,
		private dialect: SQLiteAsyncDialect,
		private mapBatchResult: (result: unknown) => unknown,
	) {
		super();
		this.config = { action };
	}

	/** @internal */
	getSQL(): SQL {
		return this.getSQLCb();
	}

	override async execute(): Promise<TResult> {
		return this.cb();
	}

	prepare(): PreparedQuery {
		return {
			getQuery: () => {
				return this.dialect.sqlToQuery(this.getSQL());
			},
			mapResult: (result: unknown, isFromBatch?: boolean) => {
				return isFromBatch ? this.mapBatchResult(result) : result;
			},
		};
	}
}
