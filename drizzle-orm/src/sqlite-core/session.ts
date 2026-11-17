import { entityKind, is } from '~/entity.ts';
import { executePreparedQuery, type PreparedQueryLogger, type QueryRuntime } from '~/query-runtime.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';

export interface PreparedQueryConfig {
	run: unknown;
	all: unknown;
	get: unknown;
	values: unknown;
	execute: unknown;
}

export interface SQLiteTransactionConfig {
	behavior?: 'deferred' | 'immediate' | 'exclusive' | 'concurrent';
}

export type SQLiteExecuteMethod = 'run' | 'all' | 'get' | 'values';

/** The driver calls a prepared query runs: each returns what the runtime runs (a value, a Promise or an Effect) */
export type SQLiteQueryExecutorsBase = Record<
	// `values` mirrors `all` in array mode, no need to define separate executor
	Exclude<SQLiteExecuteMethod, 'values'>,
	(params: unknown[]) => unknown
>;

/**
 * A prepared query of every runtime. `run`, `all`, `get`, `values` are written once, over the runtime's
 * {@link QueryRuntime}: sync drivers' prepared queries return values, async ones Promises, Effect ones Effects
 */
export abstract class SQLitePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'SQLiteBasePreparedQuery';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;
	/** @internal */
	readonly executeMethod: SQLiteExecuteMethod;

	/** @internal */
	abstract get runtime(): QueryRuntime;

	constructor(
		executeMethod: SQLiteExecuteMethod,
		protected executors: SQLiteQueryExecutorsBase,
		protected query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
		protected logger: PreparedQueryLogger,
		protected paramsInErrors: boolean | undefined,
	) {
		this.mapper = mapper;
		this.executeMethod = executeMethod;
	}

	getQuery(): Query {
		return this.query;
	}

	run(placeholderValues?: Record<string, unknown>): unknown {
		const { executors } = this;
		return executePreparedQuery(
			this.runtime,
			this.query,
			this.logger,
			this.paramsInErrors,
			placeholderValues,
			(params) => executors.run(params),
			undefined,
		);
	}

	all(placeholderValues?: Record<string, unknown>): unknown {
		const { executors } = this;
		return executePreparedQuery(
			this.runtime,
			this.query,
			this.logger,
			this.paramsInErrors,
			placeholderValues,
			(params) => executors.all(params),
			this.mapper,
		);
	}

	get(placeholderValues?: Record<string, unknown>): unknown {
		const { executors, mapper } = this;
		return executePreparedQuery(
			this.runtime,
			this.query,
			this.logger,
			this.paramsInErrors,
			placeholderValues,
			(params) => executors.get(params),
			// Convert potential nulls from drivers to undefined
			(row) => row ? (mapper ? mapper([row])[0] : row) : undefined,
		);
	}

	values(placeholderValues?: Record<string, unknown>): unknown {
		const { executors } = this;
		return executePreparedQuery(
			this.runtime,
			this.query,
			this.logger,
			this.paramsInErrors,
			placeholderValues,
			(params) => executors.all(params),
			undefined,
		);
	}

	execute(placeholderValues?: Record<string, unknown>): unknown {
		return this[this.executeMethod](placeholderValues);
	}
}

export abstract class SQLiteSession<TRunResult = unknown, TRelations extends AnyRelations = EmptyRelations> {
	static readonly [entityKind]: string = 'SQLiteSession';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare readonly _: {
		readonly runResult: TRunResult;
		readonly relations: TRelations;
	};

	/** @internal */
	abstract get runtime(): QueryRuntime;

	constructor(
		/** @internal */
		readonly dialect: SQLiteDialect,
	) {}

	abstract prepareQuery(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		prepare: boolean,
		executeMethod?: SQLiteExecuteMethod,
		mapper?: (rows: any[]) => any,
	): SQLitePreparedQuery;

	run(query: SQL): unknown {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'raw', false, 'run').run();
	}

	objects(query: SQL): unknown {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'objects', false, 'all').all();
	}

	object(query: SQL): unknown {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'objects', false, 'get').get();
	}

	arrays(query: SQL): unknown {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'arrays', false, 'all').all();
	}

	array(query: SQL): unknown {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'arrays', false, 'get').get();
	}
}
