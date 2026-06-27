/// <reference types="@cloudflare/workers-types" />
import type { SqliteClient } from '@effect/sql-sqlite-do/SqliteClient';
import type * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type { SqlError } from 'effect/unstable/sql/SqlError';
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
import type { PreparedQueryConfig, SQLiteExecuteMethod } from '~/sqlite-core/session.ts';

export interface EffectSQLiteDoQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export type EffectSQLiteDoRunResult = unknown;

export interface EffectSQLiteDOSessionOptions {
	logger: EffectLoggerShape;
	cache: EffectCacheShape;
	storage: DurableObjectStorage;
}

export class EffectSQLiteDOSession<TRelations extends AnyRelations>
	extends SQLiteEffectSession<EffectSQLiteDoRunResult, EffectSQLiteDoQueryEffectHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteDOSession';

	constructor(
		private client: SqliteClient,
		dialect: SQLiteDialect,
		protected relations: TRelations,
		private options: EffectSQLiteDOSessionOptions,
	) {
		super(dialect);
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
	): SQLiteEffectPreparedQuery<T, EffectSQLiteDoQueryEffectHKT> {
		const executors: SQLiteEffectQueryExecutors = {
			all: (params) => {
				const q = this.client.unsafe(query.sql, params);

				if (mode === 'arrays') return q.values;
				return q.withoutTransform;
			},
			get: (params) => {
				const q = this.client.unsafe(query.sql, params);

				if (mode === 'arrays') return q.values.pipe(Effect.map((e) => e[0]));
				return q.withoutTransform.pipe(Effect.map((e) => e[0]));
			},
			values: (params) => this.client.unsafe(query.sql, params).values,
			run: (params) => this.client.unsafe(query.sql, params).raw,
		};

		return new SQLiteEffectPreparedQuery<T, EffectSQLiteDoQueryEffectHKT>(
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
			tx: EffectSQLiteDOTransaction<TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations, options: { storage } } = this;

		// Bypass effect wrapper's transaction bug by using driver directly
		return Effect.gen({ self: this }, function*() {
			const context = yield* Effect.context<R>();
			let cause: Cause.Cause<E> | undefined;

			try {
				return storage.transactionSync(() => {
					const tx = new EffectSQLiteDOTransaction<TRelations>(dialect, this, relations);
					const exit = Effect.runSyncExit(Effect.provideContext(transaction(tx), context));

					if (Exit.isFailure(exit)) {
						cause = exit.cause;
						throw new TransactionRollbackError();
					}

					return exit.value;
				});
			} catch (e) {
				if (cause) return yield* Effect.failCause(cause);
				throw e;
			}
		});

		// return this.client.withTransaction(Effect.gen({ self: this }, function*() {
		// 	const tx = new EffectSQLiteDOTransaction<TRelations>(
		// 		dialect,
		// 		this,
		// 		relations,
		// 	);

		// 	return yield* transaction(tx);
		// }));
	}
}

export class EffectSQLiteDOTransaction<TRelations extends AnyRelations>
	extends SQLiteEffectTransaction<EffectSQLiteDoQueryEffectHKT, EffectSQLiteDoRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteDOTransaction';

	override transaction<A, E, R>(
		transaction: (
			tx: SQLiteEffectTransaction<EffectSQLiteDoQueryEffectHKT, EffectSQLiteDoRunResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction);
	}
}
