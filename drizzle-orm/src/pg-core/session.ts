import { entityKind, is } from '~/entity.ts';
import type { QueryRuntimeHKT, QueryRuntimeKind } from '~/query-builders/runtime.ts';
import { executePreparedQuery, type PreparedQueryLogger, type QueryRuntime, withSpan } from '~/runtime/core.ts';
import type { PreparedQuery } from '~/session.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import type { PgDialect } from './dialect.ts';

export interface PreparedQueryConfig {
	execute: unknown;
}

/** What a prepared query logs it's queries with: a `Logger`, or an Effect logger whose `logQuery` is an Effect */
export type PgPreparedQueryLogger = PreparedQueryLogger;

/**
 * A prepared query of either runtime. `execute` is written once, over the runtime's {@link QueryRuntime}: the async
 * prepared query returns a Promise, the Effect one an Effect
 */
export abstract class PgBasePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'PgBasePreparedQuery';
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
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw' | 'call',
		protected logger: PgPreparedQueryLogger,
		protected paramsInErrors: boolean | undefined,
	) {
		this.mapper = mapper;
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

/**
 * A prepared query of either runtime with values for it's placeholders, not run yet: an item of `batch`, `pipeline`
 * and `parallel` of the `drizzle-orm/postgres` drivers. Created by the runtime's `bind`.
 */
export class PgBoundQuery {
	static readonly [entityKind]: string = 'PgBoundQuery';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	// No `_` result marker on purpose: with it, this class would match the builder-only batch item type that the
	// other pg drivers take (their declarations keep only `_`), and they would send it's placeholders unfilled.

	constructor(
		readonly prepared: PgBasePreparedQuery,
		readonly placeholderValues: Record<string, unknown>,
	) {}
}

/**
 * `prepare` and `execute` of a builder that runs on a session (implemented by `PgRunnableQuery`): typed by the
 * builder's runtime (see {@link QueryRuntimeHKT}) for its result
 */
export interface PgRunnableQueryMethods<TRuntime extends QueryRuntimeHKT, TResult> {
	/**
	 * Create a prepared statement for this query. This allows
	 * the database to remember this query for the given session
	 * and call it by name, rather than specifying the full query.
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-prepare.html | Postgres prepare documentation}
	 */
	prepare(name?: string): QueryRuntimeKind<TRuntime, TResult>['prepared'];

	/**
	 * Runs the query and returns a Promise of the result, with values for any `sql.placeholder()` it contains.
	 *
	 * Eager: the query is sent as soon as `execute` is called, whether or not the Promise is awaited. The builder
	 * itself is lazy: awaiting it runs it the same way, and passing it to a batch runs it there instead.
	 */
	execute(placeholderValues?: Record<string, unknown>): QueryRuntimeKind<TRuntime, TResult>['execute'];
}

export type PgTransactionConfig =
	| {
		/** `snapshot` cannot be used with `isolationLevel: 'read uncommitted' | 'read committed'` */
		isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable' | undefined;
		accessMode?: 'read only' | 'read write' | undefined;
		deferrable?: boolean | undefined;
		snapshot?: undefined;
	}
	| {
		/** `snapshot` needs `isolationLevel: 'repeatable read' | 'serializable'`: the server default, `read committed`, can't import one */
		isolationLevel: 'repeatable read' | 'serializable';
		accessMode?: 'read only' | 'read write' | undefined;
		deferrable?: boolean | undefined;
		/** Run the transaction on a snapshot exported by another transaction (`pg_export_snapshot()`) */
		snapshot: string;
	};

export abstract class PgSession {
	static readonly [entityKind]: string = 'PgSession';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	/** @internal */
	abstract get runtime(): QueryRuntime;

	constructor(protected dialect: PgDialect) {}

	abstract prepareQuery(
		query: Query,
		/**
		 * `call` - `objects` rows of `db.call`: it's mapper only picks the row, no codecs run, so drivers must not apply
		 * the typecasts they do for codec-decoded (mapped) queries
		 */
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		name: string | boolean,
		mapper: ((rows: unknown[]) => any) | undefined,
		/** Usef for driver-side mapping if supported by driver & compatible */
		driverShape?: unknown,
	): PgBasePreparedQuery;

	execute(query: SQL): unknown {
		return this.runSQL(query, 'raw');
	}

	arrays(query: SQL): unknown {
		return this.runSQL(query, 'arrays');
	}

	objects(query: SQL): unknown {
		return this.runSQL(query, 'objects');
	}

	private runSQL(query: SQL, mode: 'arrays' | 'objects' | 'raw'): unknown {
		return withSpan(this.runtime, 'drizzle.operation', undefined, () => {
			const prepared = tracer.startActiveSpan(
				'drizzle.prepareQuery',
				() => this.prepareQuery(this.dialect.sqlToQuery(query), mode, false, undefined),
			);

			return prepared.execute();
		});
	}
}

/** @internal The `begin`/`set transaction` modes of `config`: isolation level, access mode, deferrable */
export function getTransactionConfigChunks(config: PgTransactionConfig): string[] {
	const chunks: string[] = [];
	if (config.isolationLevel) {
		chunks.push(`isolation level ${config.isolationLevel}`);
	}
	if (config.accessMode) {
		chunks.push(config.accessMode);
	}
	if (typeof config.deferrable === 'boolean') {
		chunks.push(config.deferrable ? 'deferrable' : 'not deferrable');
	}
	return chunks;
}

/** @internal */
export function getTransactionConfigSQL(config: PgTransactionConfig): SQL {
	return sql.raw(getTransactionConfigChunks(config).join(' '));
}

/** @internal */
export function setTransactionSnapshotSQL(snapshot: string): SQL {
	return sql`set transaction snapshot ${snapshot}`.inlineParams();
}

/** @internal The statements that apply `config` to a transaction that has already begun */
export function getTransactionConfigStatements(dialect: PgDialect, config: PgTransactionConfig): string[] {
	const statements: string[] = [];

	const chunks = getTransactionConfigChunks(config);
	if (chunks.length) statements.push(`set transaction ${chunks.join(' ')}`);

	if (typeof config.snapshot === 'string') {
		statements.push(dialect.sqlToQuery(setTransactionSnapshotSQL(config.snapshot)).sql);
	}

	return statements;
}

export interface PgQueryResultHKT {
	readonly $brand: 'PgQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type PgQueryResultKind<TKind extends PgQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export type PgRawRow<TRow> = TRow extends 'unknown' ? Record<string, unknown> : TRow;
