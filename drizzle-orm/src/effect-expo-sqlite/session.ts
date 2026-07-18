import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { classifySqliteError, SqlError } from 'effect/unstable/sql/SqlError';
import type { SQLiteDatabase, SQLiteRunResult, SQLiteStatement } from 'expo-sqlite';
import type { EffectCacheShape } from '~/cache/core/cache-effect.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import {
	SQLiteEffectPreparedQuery,
	type SQLiteEffectQueryExecutors,
	SQLiteEffectSession,
	SQLiteEffectTransaction,
} from '~/sqlite-core/effect/session.ts';
import type { PreparedQueryConfig, SQLiteExecuteMethod, SQLiteTransactionConfig } from '~/sqlite-core/session.ts';

const makeSqlError = (cause: unknown, operation: string) =>
	new SqlError({ reason: classifySqliteError(cause, { operation }) });

export interface EffectExpoSQLiteQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export type EffectExpoSQLiteRunResult = SQLiteRunResult;

export interface EffectExpoSQLiteSessionOptions {
	logger: EffectLoggerShape;
	cache: EffectCacheShape;
}

export class EffectExpoSQLiteSession<TRelations extends AnyRelations>
	extends SQLiteEffectSession<EffectExpoSQLiteRunResult, EffectExpoSQLiteQueryEffectHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectExpoSQLiteSession';

	constructor(
		private client: SQLiteDatabase,
		dialect: SQLiteDialect,
		protected relations: TRelations,
		private options: EffectExpoSQLiteSessionOptions,
	) {
		super(dialect);
	}

	private withStatement<A>(query: string, execute: (statement: SQLiteStatement) => A): Effect.Effect<A, SqlError> {
		return Effect.try({
			try: () => {
				const statement = this.client.prepareSync(query);
				try {
					return execute(statement);
				} finally {
					statement.finalizeSync();
				}
			},
			catch: (cause) => makeSqlError(cause, 'execute'),
		});
	}

	execute(query: string): Effect.Effect<void, SqlError> {
		return Effect.try({
			try: () => this.client.execSync(query),
			catch: (cause) => makeSqlError(cause, 'execute'),
		});
	}

	override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		_prepare: boolean,
		executeMethod?: SQLiteExecuteMethod,
		mapper?: (rows: any[]) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): SQLiteEffectPreparedQuery<T, EffectExpoSQLiteQueryEffectHKT> {
		const executors: SQLiteEffectQueryExecutors = {
			all: (params) =>
				this.withStatement(query.sql, (statement) => {
					if (mode === 'arrays') {
						return statement.executeForRawResultSync(params as any[]).getAllSync();
					}
					return statement.executeSync(params as any[]).getAllSync();
				}),
			get: (params) =>
				this.withStatement(query.sql, (statement) => {
					if (mode === 'arrays') {
						return statement.executeForRawResultSync(params as any[]).getFirstSync() ?? undefined;
					}
					return statement.executeSync(params as any[]).getFirstSync() ?? undefined;
				}),
			run: (params) =>
				this.withStatement(query.sql, (statement) => {
					const result = statement.executeSync(params as any[]);
					return {
						changes: result.changes,
						lastInsertRowId: result.lastInsertRowId,
					};
				}),
			values: (params) =>
				this.withStatement(
					query.sql,
					(statement) => statement.executeForRawResultSync(params as any[]).getAllSync(),
				),
		};

		return new SQLiteEffectPreparedQuery<T, EffectExpoSQLiteQueryEffectHKT>(
			executeMethod,
			executors,
			query,
			mapper,
			mode,
			this.options.logger,
			this.options.cache,
			queryMetadata,
			cacheConfig,
		);
	}

	override transaction<A, E, R>(
		transaction: (
			tx: EffectExpoSQLiteTransaction<TRelations>,
		) => Effect.Effect<A, E, R>,
		config: SQLiteTransactionConfig = {},
	): Effect.Effect<A, E | SqlError, R> {
		const { client, dialect, relations, options } = this;

		if (config.behavior !== undefined && config.behavior !== 'deferred') {
			return Effect.fail(
				makeSqlError(
					new Error(`Expo SQLite transactions do not support ${config.behavior} behavior`),
					'transaction',
				),
			);
		}

		return Effect.callback<A, E | SqlError, R>((resume) => {
			let interrupted = false;
			const rollbackMarker = new TransactionRollbackError();
			let nativeTransaction: Promise<void>;

			const awaitNativeTransaction = () =>
				Effect.tryPromise({
					try: () => nativeTransaction,
					catch: (cause) => cause,
				}).pipe(
					Effect.catch((cause) =>
						cause === rollbackMarker
							? Effect.void
							: Effect.fail(makeSqlError(cause, 'transaction'))
					),
				);

			const runTransaction = (transactionClient: SQLiteDatabase) =>
				new Promise<void>((resolve, reject) => {
					if (interrupted) {
						resolve();
						return;
					}

					const session = new EffectExpoSQLiteSession(transactionClient, dialect, relations, options);
					const tx = new EffectExpoSQLiteTransaction<TRelations>(dialect, session, relations);
					resume(
						Effect.suspend(() => transaction(tx)).pipe(
							Effect.onExit((exit) => {
								if (Exit.isFailure(exit)) {
									reject(rollbackMarker);
								} else {
									resolve();
								}
								return awaitNativeTransaction();
							}),
						),
					);
				});

			nativeTransaction = client.databaseName === ':memory:'
				? client.withTransactionAsync(() => runTransaction(client))
				: client.withExclusiveTransactionAsync(runTransaction);

			void nativeTransaction.catch((cause) => {
				if (cause !== rollbackMarker) {
					resume(Effect.fail(makeSqlError(cause, 'transaction')));
				}
			});

			return Effect.suspend(() => {
				interrupted = true;
				return awaitNativeTransaction().pipe(Effect.catch(() => Effect.void));
			});
		});
	}
}

export class EffectExpoSQLiteTransaction<TRelations extends AnyRelations>
	extends SQLiteEffectTransaction<EffectExpoSQLiteQueryEffectHKT, EffectExpoSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectExpoSQLiteTransaction';

	override transaction<A, E, R>(
		transaction: (
			tx: EffectExpoSQLiteTransaction<TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		const savepointName = `sp${this.nestedIndex}`;
		const session = this.session as EffectExpoSQLiteSession<TRelations>;
		const tx = new EffectExpoSQLiteTransaction(
			this.dialect,
			session,
			this._.relations,
			this.nestedIndex + 1,
		);

		return Effect.uninterruptibleMask((restore) =>
			Effect.gen(function*() {
				yield* session.execute(`savepoint ${savepointName}`);
				const exit = yield* Effect.exit(restore(Effect.suspend(() => transaction(tx))));

				if (Exit.isSuccess(exit)) {
					yield* session.execute(`release savepoint ${savepointName}`);
					return exit.value;
				}

				yield* session.execute(`rollback to savepoint ${savepointName}`);
				yield* session.execute(`release savepoint ${savepointName}`);
				return yield* Effect.failCause(exit.cause);
			})
		);
	}
}
