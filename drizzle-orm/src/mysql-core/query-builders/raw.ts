import { entityKind, is } from '~/entity.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { MySqlBasePreparedQuery, MySqlRuntimeHKT, MySqlRuntimeKind } from '../session.ts';

// oxlint-disable-next-line no-unused-vars
export interface MySqlRaw<TResult, TRuntime extends MySqlRuntimeHKT = MySqlRuntimeHKT> extends SQLWrapper {}
export class MySqlRaw<TResult, TRuntime extends MySqlRuntimeHKT = MySqlRuntimeHKT>
	implements SQLWrapper, PreparedQuery
{
	static readonly [entityKind]: string = 'MySqlRaw';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare readonly _: {
		readonly dialect: 'mysql';
		readonly result: TResult;
	};

	constructor(
		protected prepared: MySqlBasePreparedQuery,
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
	_prepare(): MySqlBasePreparedQuery {
		return this.prepared;
	}

	/**
	 * Runs the query and returns a Promise of the result, with values for any `sql.placeholder()` it contains.
	 *
	 * Eager: the query is sent as soon as `execute` is called, whether or not the Promise is awaited. The builder
	 * itself is lazy: awaiting it runs it the same way.
	 */
	execute(placeholderValues?: Record<string, unknown>): MySqlRuntimeKind<TRuntime, TResult>['execute'] {
		return this.prepared.execute(placeholderValues) as MySqlRuntimeKind<TRuntime, TResult>['execute'];
	}
}
