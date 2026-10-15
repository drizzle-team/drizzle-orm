import type { SqliteClient } from '@effect/sql-sqlite-wasm/SqliteClient';
import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import type { EffectCacheShape } from '~/cache/core/cache-effect.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
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

export interface EffectSQLiteWasmQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export type EffectSQLiteWasmRunResult = unknown;

export interface EffectSQLiteWasmSessionOptions {
	logger: EffectLoggerShape;
	cache: EffectCacheShape;
}

export class EffectSQLiteWasmSession<TRelations extends AnyRelations>
	extends SQLiteEffectSession<EffectSQLiteWasmRunResult, EffectSQLiteWasmQueryEffectHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteWasmSession';

	constructor(
		private client: SqliteClient,
		dialect: SQLiteDialect,
		protected relations: TRelations,
		private options: EffectSQLiteWasmSessionOptions,
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
	): SQLiteEffectPreparedQuery<T, EffectSQLiteWasmQueryEffectHKT> {
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

		return new SQLiteEffectPreparedQuery<T, EffectSQLiteWasmQueryEffectHKT>(
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
			tx: EffectSQLiteWasmTransaction<TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations } = this;

		return this.client.withTransaction(Effect.gen({ self: this }, function*() {
			const tx = new EffectSQLiteWasmTransaction<TRelations>(
				dialect,
				this,
				relations,
			);

			return yield* transaction(tx);
		}));
	}
}

export class EffectSQLiteWasmTransaction<TRelations extends AnyRelations>
	extends SQLiteEffectTransaction<EffectSQLiteWasmQueryEffectHKT, EffectSQLiteWasmRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteWasmTransaction';

	override transaction<A, E, R>(
		transaction: (
			tx: SQLiteEffectTransaction<EffectSQLiteWasmQueryEffectHKT, EffectSQLiteWasmRunResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction);
	}
}
