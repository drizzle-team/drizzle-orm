import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { CockroachBasePreparedQuery } from '../session.ts';

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
		protected prepared: CockroachBasePreparedQuery,
		private sql: SQL,
		private query: Query,
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

	override execute(placeholderValues?: Record<string, unknown>): Promise<TResult> {
		return this.prepared.execute(placeholderValues) as Promise<TResult>;
	}

	_prepare(): CockroachBasePreparedQuery {
		return this.prepared;
	}
}
