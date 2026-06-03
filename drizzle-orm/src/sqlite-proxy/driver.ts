import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLiteExecuteMethod } from '~/sqlite-core/session.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { SQLiteRemoteSession } from './session.ts';

export interface SqliteRemoteResult<T = unknown> {
	rows?: T[];
}

export class SqliteRemoteDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'async', SqliteRemoteResult, TRelations>
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

export type AsyncRemoteCallback = (
	sql: string,
	params: any[],
	method: SQLiteExecuteMethod,
) => Promise<{ rows: any[] }>;

export type AsyncBatchRemoteCallback = (batch: {
	sql: string;
	params: any[];
	method: SQLiteExecuteMethod;
}[]) => Promise<{ rows: any[] }[]>;

export type RemoteCallback = AsyncRemoteCallback;

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	callback: RemoteCallback,
	config?: DrizzleSQLiteConfig<TRelations>,
): SqliteRemoteDatabase<TRelations>;
export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	callback: RemoteCallback,
	batchCallback?: AsyncBatchRemoteCallback,
	config?: DrizzleSQLiteConfig<TRelations>,
): SqliteRemoteDatabase<TRelations>;
export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	callback: RemoteCallback,
	batchCallback?: AsyncBatchRemoteCallback | DrizzleSQLiteConfig<TRelations>,
	config?: DrizzleSQLiteConfig<TRelations>,
): SqliteRemoteDatabase<TRelations> {
	let logger;
	let cache;
	let _batchCallback: AsyncBatchRemoteCallback | undefined;
	let _config: DrizzleSQLiteConfig<TRelations> = {};

	if (batchCallback) {
		if (typeof batchCallback === 'function') {
			_batchCallback = batchCallback as AsyncBatchRemoteCallback;
			_config = config ?? {};
		} else {
			_batchCallback = undefined;
			_config = batchCallback as DrizzleSQLiteConfig<TRelations>;
		}

		if (_config.logger === true) {
			logger = new DefaultLogger();
		} else if (_config.logger !== false) {
			logger = _config.logger;
			cache = _config.cache;
		}
	}

	const dialect = new SQLiteDialect({
		useJitMappers: jitCompatCheck(_config.jit),
	});

	const relations = _config.relations ?? {} as TRelations;
	const session = new SQLiteRemoteSession(callback, dialect, relations, _batchCallback, {
		logger,
		cache,
	});
	const db = new SqliteRemoteDatabase(
		'async',
		dialect,
		session,
		relations,
	);
	(<any> db).$cache = cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = cache?.onMutate;
	}
	return db;
}
