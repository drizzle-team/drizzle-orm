import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';

export interface PreparedQueryConfig {
	run: unknown;
	all: unknown;
	get: unknown;
	values: unknown;
	execute: unknown;
}

export class ExecuteResultSync<T> extends QueryPromise<T> {
	static override readonly [entityKind]: string = 'ExecuteResultSync';

	constructor(private resultCb: () => T) {
		super();
	}

	override async execute(): Promise<T> {
		return this.resultCb();
	}

	sync(): T {
		return this.resultCb();
	}
}

export type ExecuteResult<TType extends 'sync' | 'async', TResult> = TType extends 'async' ? Promise<TResult>
	: ExecuteResultSync<TResult>;

export interface SQLiteTransactionConfig {
	behavior?: 'deferred' | 'immediate' | 'exclusive';
}

export type SQLiteExecuteMethod = 'run' | 'all' | 'get' | 'values';

export abstract class SQLiteBasePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'SQLiteBasePreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;
	/** @internal */
	readonly executeMethod: SQLiteExecuteMethod;

	constructor(
		executeMethod: SQLiteExecuteMethod,
		protected query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
	) {
		this.mapper = mapper;
		this.executeMethod = executeMethod;
	}

	getQuery(): Query {
		return this.query;
	}

	abstract run(placeholderValues?: Record<string, unknown>): unknown;
	abstract all(placeholderValues?: Record<string, unknown>): unknown;
	abstract get(placeholderValues?: Record<string, unknown>): unknown;
	abstract values(placeholderValues?: Record<string, unknown>): unknown;
	abstract execute(placeholderValues?: Record<string, unknown>): unknown;

	/** @internal */
	protected abstract queryWithCache(
		queryString: string,
		params: any[],
		query: unknown,
	): unknown;
}

export abstract class SQLiteSession<TRunResult = unknown, TRelations extends AnyRelations = EmptyRelations> {
	static readonly [entityKind]: string = 'SQLiteSession';

	declare readonly _: {
		readonly runResult: TRunResult;
		readonly relations: TRelations;
	};

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
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): SQLiteBasePreparedQuery;
}
