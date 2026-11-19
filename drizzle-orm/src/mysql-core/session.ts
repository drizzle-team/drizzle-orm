import { entityKind, is } from '~/entity.ts';
import type { QueryRuntimeHKT } from '~/query-builders/runtime.ts';
import { executePreparedQuery, type PreparedQueryLogger, type QueryRuntime } from '~/runtime/core.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { MySqlDialect } from './dialect.ts';

export interface MySqlQueryResultHKT {
	readonly $brand: 'MySqlQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export interface AnyMySqlQueryResultHKT extends MySqlQueryResultHKT {
	readonly type: any;
}

export type MySqlQueryResultKind<TKind extends MySqlQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export interface MySqlPreparedQueryConfig {
	execute: unknown;
	iterator: unknown;
}

export interface MySqlPreparedQueryHKT {
	readonly $brand: 'MySqlPreparedQueryHKT';
	readonly config: unknown;
	readonly type: unknown;
}

/**
 * How a MySQL runtime wraps what a builder runs (see {@link QueryRuntimeHKT}), plus `row`: what the async runtime's
 * `iterator` yields for the builder
 */
export interface MySqlRuntimeHKT extends QueryRuntimeHKT {
	readonly row: unknown;
}

export type MySqlRuntimeKind<TRuntime extends MySqlRuntimeHKT, TResult, TRow = never> = TRuntime & {
	readonly result: TResult;
	readonly row: TRow;
};

/**
 * `prepare` and `execute` of a builder that runs on a session (implemented by `MySqlRunnableQuery`): typed by the
 * builder's runtime (see {@link MySqlRuntimeHKT}) for its result, and the row its async `iterator` yields
 */
export interface MySqlRunnableQueryMethods<TRuntime extends MySqlRuntimeHKT, TResult, TRow = never> {
	/** Prepares the query on the session: run it with `execute` as many times as needed */
	prepare(): MySqlRuntimeKind<TRuntime, TResult, TRow>['prepared'];

	/**
	 * Runs the query and returns a Promise of the result, with values for any `sql.placeholder()` it contains.
	 *
	 * Eager: the query is sent as soon as `execute` is called, whether or not the Promise is awaited. The builder
	 * itself is lazy: awaiting it runs it the same way.
	 */
	execute(placeholderValues?: Record<string, unknown>): MySqlRuntimeKind<TRuntime, TResult, TRow>['execute'];
}

export type AnyMySqlMapper = (
	response: Record<string, unknown>[] | unknown[][] | { insertId: number; affectedRows: number },
) => any;

/**
 * A prepared query of either runtime. `execute` is written once, over the runtime's {@link QueryRuntime}: the async
 * prepared query returns a Promise, the Effect one an Effect
 */
export abstract class MySqlBasePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'MySqlBasePreparedQuery';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;

	/** @internal */
	abstract get runtime(): QueryRuntime;

	constructor(
		/** Runs the query with it's params: returns what the runtime runs, a Promise or an Effect */
		protected executor: (params?: unknown[]) => unknown,
		protected query: Query,
		mapper: AnyMySqlMapper | ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
		protected logger: PreparedQueryLogger,
		protected paramsInErrors: boolean | undefined,
	) {
		this.mapper = mapper as ((rows: any[]) => any) | undefined;
	}

	getQuery(): Query {
		return this.query;
	}

	/**
	 * Runs the query with values for it's placeholders. A failure of the query fails with the runtime's query error
	 * (`DrizzleQueryError` / `EffectDrizzleQueryError`)
	 */
	execute(placeholderValues?: Record<string, unknown>): unknown {
		return executePreparedQuery(
			this.runtime,
			this.query,
			this.logger,
			this.paramsInErrors,
			placeholderValues,
			this.executor,
			this.mapper,
		);
	}
}

export interface MySqlTransactionConfig {
	withConsistentSnapshot?: boolean;
	accessMode?: 'read only' | 'read write';
	isolationLevel: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
}

export abstract class MySqlSession {
	static readonly [entityKind]: string = 'MySqlSession';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	/** @internal */
	abstract get runtime(): QueryRuntime;

	constructor(protected dialect: MySqlDialect) {}

	abstract prepareQuery(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (rows: any) => any,
	): MySqlBasePreparedQuery;

	execute(query: SQL): unknown {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'raw').execute();
	}

	arrays(query: SQL): unknown {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'arrays').execute();
	}

	objects(query: SQL): unknown {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'objects').execute();
	}

	protected getSetTransactionSQL(config: MySqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.isolationLevel) {
			parts.push(`isolation level ${config.isolationLevel}`);
		}

		return parts.length ? sql`set transaction ${sql.raw(parts.join(' '))}` : undefined;
	}

	protected getStartTransactionSQL(config: MySqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.withConsistentSnapshot) {
			parts.push('with consistent snapshot');
		}

		if (config.accessMode) {
			parts.push(config.accessMode);
		}

		return parts.length ? sql`start transaction ${sql.raw(parts.join(', '))}` : undefined;
	}
}
