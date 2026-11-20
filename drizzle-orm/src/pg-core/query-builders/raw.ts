import { entityKind, is } from '~/entity.ts';
import type { QueryRuntimeHKT, QueryRuntimeKind } from '~/query-builders/runtime.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { PgBasePreparedQuery } from '../session.ts';

// oxlint-disable-next-line no-unused-vars
export interface PgRaw<TResult, TRuntime extends QueryRuntimeHKT = QueryRuntimeHKT> extends SQLWrapper {}
export class PgRaw<TResult, TRuntime extends QueryRuntimeHKT = QueryRuntimeHKT> implements SQLWrapper, PreparedQuery {
	static readonly [entityKind]: string = 'PgRaw';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	constructor(
		protected prepared: PgBasePreparedQuery,
		protected sql: SQL,
		protected query: Query,
	) {
	}

	getSQL() {
		return this.sql;
	}

	getQuery() {
		return this.query;
	}

	/** @internal */
	_prepare(): PgBasePreparedQuery {
		return this.prepared;
	}

	/**
	 * Runs the query and returns a Promise of the result, with values for any `sql.placeholder()` it contains.
	 *
	 * Eager: the query is sent as soon as `execute` is called, whether or not the Promise is awaited. The builder
	 * itself is lazy: awaiting it runs it the same way, and passing it to a batch runs it there instead.
	 */
	execute(placeholderValues?: Record<string, unknown>): QueryRuntimeKind<TRuntime, TResult>['execute'] {
		return this.prepared.execute(placeholderValues) as QueryRuntimeKind<TRuntime, TResult>['execute'];
	}
}
