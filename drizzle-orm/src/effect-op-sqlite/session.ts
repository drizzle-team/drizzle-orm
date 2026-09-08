import type { OPSQLiteConnection, QueryResult } from '@op-engineering/op-sqlite';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { classifySqliteError, SqlError } from 'effect/unstable/sql/SqlError';
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

export interface EffectOPSQLiteQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export type EffectOPSQLiteRunResult = QueryResult;

export interface EffectOPSQLiteSessionOptions {
	logger: EffectLoggerShape;
	cache: EffectCacheShape;
}

export class EffectOPSQLiteSession<TRelations extends AnyRelations>
	extends SQLiteEffectSession<EffectOPSQLiteRunResult, EffectOPSQLiteQueryEffectHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectOPSQLiteSession';

	constructor(
		private client: OPSQLiteConnection,
		dialect: SQLiteDialect,
		protected relations: TRelations,
		private options: EffectOPSQLiteSessionOptions,
	) {
		super(dialect);
	}

	execute(query: string, params: unknown[] = []): Effect.Effect<QueryResult, SqlError> {
		return Effect.tryPromise({
			try: () => this.client.executeAsync(query, params as any[]),
			catch: (cause) => makeSqlError(cause, 'execute'),
		});
	}

	executeRaw(query: string, params: unknown[] = []): Effect.Effect<any[], SqlError> {
		return Effect.tryPromise({
			try: () => this.client.executeRawAsync(query, params as any[]),
			catch: (cause) => makeSqlError(cause, 'executeRaw'),
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
	): SQLiteEffectPreparedQuery<T, EffectOPSQLiteQueryEffectHKT> {
		const executors: SQLiteEffectQueryExecutors = {
			all: (params) => {
				if (mode === 'arrays') return this.executeRaw(query.sql, params);
				return this.execute(query.sql, params).pipe(Effect.map(({ rows }) => rows?._array ?? []));
			},
			get: (params) => {
				if (mode === 'arrays') return this.executeRaw(query.sql, params).pipe(Effect.map((rows) => rows[0]));
				return this.execute(query.sql, params).pipe(Effect.map(({ rows }) => rows?._array?.[0]));
			},
			run: (params) => this.execute(query.sql, params),
			values: (params) => this.executeRaw(query.sql, params),
		};

		return new SQLiteEffectPreparedQuery<T, EffectOPSQLiteQueryEffectHKT>(
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
			tx: EffectOPSQLiteTransaction<TRelations>,
		) => Effect.Effect<A, E, R>,
		config: SQLiteTransactionConfig = {},
	): Effect.Effect<A, E | SqlError, R> {
		const { client, dialect, relations } = this;

		if (config.behavior !== undefined && config.behavior !== 'deferred') {
			return Effect.fail(
				makeSqlError(
					new Error(`OP-SQLite transactions do not support ${config.behavior} behavior`),
					'transaction',
				),
			);
		}

		const tx = new EffectOPSQLiteTransaction<TRelations>(dialect, this, relations);

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

			nativeTransaction = client.transaction(() =>
				new Promise<void>((resolve, reject) => {
					if (interrupted) {
						resolve();
						return;
					}

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
				})
			);

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

export class EffectOPSQLiteTransaction<TRelations extends AnyRelations>
	extends SQLiteEffectTransaction<EffectOPSQLiteQueryEffectHKT, EffectOPSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectOPSQLiteTransaction';

	override transaction<A, E, R>(
		transaction: (
			tx: EffectOPSQLiteTransaction<TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		const savepointName = `sp${this.nestedIndex}`;
		const session = this.session as EffectOPSQLiteSession<TRelations>;
		const tx = new EffectOPSQLiteTransaction(
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
