import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { SQLiteRemoteSession } from './session.ts';

/** Type is inferred from return type of user-provided `run`, thus internal expectation stays `any` */
export type SqliteRemoteRunResult = any;

export class SqliteRemoteDatabase<TRunResult = unknown, TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'async', TRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SqliteRemoteDatabase';

	/** @internal */
	declare readonly session: SQLiteRemoteSession<TRelations>;

	async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

export interface SqliteProxyExecutors<TRunResult = unknown> {
	get: {
		(sql: string, params: any[], rowMode?: 'array' | undefined): Promise<any[] | undefined>;
		(sql: string, params: any[], rowMode: 'object'): Promise<Record<string, any> | undefined>;
		(
			sql: string,
			params: any[],
			rowMode?: 'array' | 'object' | undefined,
		): Promise<Record<string, any> | undefined>;
	};
	all: {
		(sql: string, params: any[], rowMode?: 'array' | undefined): Promise<any[][]>;
		(sql: string, params: any[], rowMode: 'object'): Promise<Record<string, any>[]>;
		(
			sql: string,
			params: any[],
			rowMode?: 'array' | 'object' | undefined,
		): Promise<Record<string, any>[]>;
	};
	run: {
		(sql: string, params: any[]): Promise<TRunResult>;
	};
	/** Each query's result must mirror result of same query ran via it's respective method's executor */
	batch?: SQLiteProxyBatchCallback;
	// TODO: discuss - current implementation may not be suitable for all drivers and there's no way to override it
	// /** Transaction must handle nested savepoints, commits & rollbacks on error itself
	//  *
	//  * `callback` must be provided with executors pinned to transaction client
	//  */
	// transaction?: <T>(callback: (txExecutors: SqliteProxyExecutors<TRunResult>) => Promise<T> | T, config?: SQLiteTransactionConfig,) => Promise<T>;
}

export type SqliteProxyBatchItem = {
	sql: string;
	params: any[];
	method: 'all' | 'get';
	rowMode: 'array' | 'object';
} | {
	sql: string;
	params: any[];
	method: 'run';
	rowMode?: undefined;
};

export type SQLiteProxyBatchCallback = (batch: SqliteProxyBatchItem[]) => Promise<any[]>;

export function drizzle<TRelations extends AnyRelations = EmptyRelations, TRunResult = unknown>(
	executors: SqliteProxyExecutors<TRunResult>,
	config?: DrizzleSQLiteConfig<TRelations>,
): SqliteRemoteDatabase<TRunResult, TRelations> {
	let logger;

	if (config?.logger === true) {
		logger = new DefaultLogger();
	} else if (config?.logger !== false) {
		logger = config?.logger;
	}

	const dialect = new SQLiteDialect({
		codecs: config?.codecs,
		useJitMappers: jitCompatCheck(config?.jit),
	});

	const relations = config?.relations ?? {} as TRelations;
	const session = new SQLiteRemoteSession(executors, dialect, relations, {
		logger,
		cache: config?.cache,
	});
	const db = new SqliteRemoteDatabase(
		'async',
		dialect,
		session,
		relations,
	);
	(<any> db).$cache = config?.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config?.cache?.onMutate;
	}
	return db;
}
