import { entityKind } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { asyncQueryRuntime, runAsyncProgram } from '~/runtime/async.ts';
import type { QueryRuntime } from '~/runtime/core.ts';
import { runSyncProgram, syncQueryRuntime } from '~/runtime/sync.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import {
	type PreparedQueryConfig as BasePreparedQueryConfig,
	type SQLiteExecuteMethod,
	SQLitePreparedQuery,
	SQLiteSession,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { migrate as migrateProgram } from '~/up-migrations/sqlite-program.ts';
import { sqliteAsyncMigrationRunner, sqliteSyncMigrationRunner } from '~/up-migrations/sqlite.ts';
import { SQLiteAsyncDatabase } from './db.ts';

export interface SQLiteAsyncPreparedQueryConfig extends BasePreparedQueryConfig {
	type: 'sync' | 'async';
}

export type ExecuteResult<TType extends 'sync' | 'async', TResult> = TType extends 'async' ? Promise<TResult>
	: ExecuteResultSync<TResult>;

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

export type SQLiteQueryExecutors<TType extends 'sync' | 'async'> = Record<
	// `values` mirrors `all` in array mode, no need to define separate executor
	Exclude<SQLiteExecuteMethod, 'values'>,
	(params: unknown[]) => Result<TType, any>
>;

export type Result<TKind extends 'sync' | 'async', TResult> = TKind extends 'async' ? Promise<TResult> : TResult;

export interface SQLiteAsyncPreparedQuery<T extends SQLiteAsyncPreparedQueryConfig> {
	run(placeholderValues?: Record<string, unknown>): Result<T['type'], T['run']>;
	all(placeholderValues?: Record<string, unknown>): Result<T['type'], T['all']>;
	get(placeholderValues?: Record<string, unknown>): Result<T['type'], T['get']>;
	values(placeholderValues?: Record<string, unknown>): Result<T['type'], T['values']>;
}

export class SQLiteAsyncPreparedQuery<T extends SQLiteAsyncPreparedQueryConfig> extends SQLitePreparedQuery {
	static override readonly [entityKind]: string = 'SQLiteAsyncPreparedQuery';

	declare protected executors: SQLiteQueryExecutors<T['type']>;

	/** @internal Sync drivers' queries run as plain values, async drivers' as Promises */
	override get runtime(): QueryRuntime {
		return this.resultKind === 'sync' ? syncQueryRuntime : asyncQueryRuntime;
	}

	constructor(
		private resultKind: 'sync' | 'async',
		executeMethod: SQLiteExecuteMethod = 'all',
		executors: SQLiteQueryExecutors<T['type']>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw',
		logger: Logger,
		paramsInErrors: boolean | undefined,
	) {
		super(executeMethod, executors, query, mapper, mode, logger, paramsInErrors);
	}

	override execute(placeholderValues?: Record<string, unknown>): ExecuteResult<T['type'], T['execute']> {
		if (this.resultKind === 'async') {
			return this[this.executeMethod](placeholderValues) as ExecuteResult<T['type'], T['execute']>;
		}
		return new ExecuteResultSync(() => this[this.executeMethod](placeholderValues)) as ExecuteResult<
			T['type'],
			T['execute']
		>;
	}
}

export interface SQLiteAsyncSession<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	// oxlint-disable-next-line no-unused-vars
	TRelations extends AnyRelations = EmptyRelations,
> {
	run(query: SQL): Result<TResultKind, TRunResult>;
	objects<T = unknown>(query: SQL): Result<TResultKind, T[]>;
	object<T = unknown>(query: SQL): Result<TResultKind, T>;
	arrays<T extends any[] = unknown[]>(query: SQL): Result<TResultKind, T[]>;
	array<T extends any[] = unknown[]>(query: SQL): Result<TResultKind, T>;
}

export abstract class SQLiteAsyncSession<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteSession<TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteAsyncSession';

	declare readonly dialect: SQLiteDialect;

	/** @internal Sync drivers' queries run as plain values, async drivers' as Promises */
	override get runtime(): QueryRuntime {
		return this.resultKind === 'sync' ? syncQueryRuntime : asyncQueryRuntime;
	}

	constructor(
		dialect: SQLiteDialect,
		protected resultKind: TResultKind,
	) {
		super(dialect);
	}

	abstract override prepareQuery(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		prepare: boolean,
		executeMethod?: SQLiteExecuteMethod,
		mapper?: (rows: any[]) => any,
	): SQLiteAsyncPreparedQuery<SQLiteAsyncPreparedQueryConfig & { type: TResultKind }>;

	abstract transaction<T>(
		transaction: (
			tx: SQLiteAsyncTransaction<TResultKind, TRunResult, TRelations>,
		) => Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T>;
}

export abstract class SQLiteAsyncTransaction<
	TResultType extends 'sync' | 'async',
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteAsyncDatabase<TResultType, TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteAsyncTransaction';

	constructor(
		resultType: TResultType,
		dialect: SQLiteDialect,
		session: SQLiteAsyncSession<TResultType, TRunResult, TRelations>,
		relations: TRelations,
		protected readonly nestedIndex = 0,
		forbidJsonb?: boolean,
	) {
		super(resultType, dialect, session, relations, forbidJsonb);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}
}

/** Applies the migrations that the database doesn't have yet, all or none of them: for drivers that run queries synchronously */
export function migrateSync(
	migrations: MigrationMeta[],
	session: SQLiteAsyncSession<'sync', unknown, AnyRelations>,
	config?: string | Omit<MigrationConfig, 'migrationsFolder'>,
): void | MigratorInitFailResponse {
	return runSyncProgram(() => migrateProgram(migrations, sqliteSyncMigrationRunner(session), config));
}

/** Applies the migrations that the database doesn't have yet, all or none of them, in a transaction */
export function migrateAsync(
	migrations: MigrationMeta[],
	db: SQLiteAsyncDatabase<'async', unknown, AnyRelations>,
	config?: string | Omit<MigrationConfig, 'migrationsFolder'>,
): Promise<void | MigratorInitFailResponse> {
	return runAsyncProgram(() => migrateProgram(migrations, sqliteAsyncMigrationRunner(db), config));
}
