import type { D1Client } from '@effect/sql-d1/D1Client';
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

export interface EffectSQLiteD1QueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export type EffectSQLiteD1RunResult = unknown;

export interface EffectSQLiteD1SessionOptions {
	logger: EffectLoggerShape;
	cache: EffectCacheShape;
}

export class EffectSQLiteD1Session<TRelations extends AnyRelations>
	extends SQLiteEffectSession<EffectSQLiteD1RunResult, EffectSQLiteD1QueryEffectHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteD1Session';

	constructor(
		private client: D1Client,
		dialect: SQLiteDialect,
		protected relations: TRelations,
		private options: EffectSQLiteD1SessionOptions,
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
	): SQLiteEffectPreparedQuery<T, EffectSQLiteD1QueryEffectHKT> {
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

		return new SQLiteEffectPreparedQuery<T, EffectSQLiteD1QueryEffectHKT>(
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

	// Kept in case D1 supports transactions
	// Currently throws
	override transaction<A, E, R>(
		transaction: (
			tx: EffectSQLiteD1Transaction<TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations } = this;

		return this.client.withTransaction(Effect.gen({ self: this }, function*() {
			const tx = new EffectSQLiteD1Transaction<TRelations>(
				dialect,
				this,
				relations,
				undefined,
				true,
			);

			return yield* transaction(tx);
		}));
	}
}

export class EffectSQLiteD1Transaction<TRelations extends AnyRelations>
	extends SQLiteEffectTransaction<EffectSQLiteD1QueryEffectHKT, EffectSQLiteD1RunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteD1Transaction';

	override transaction<A, E, R>(
		transaction: (
			tx: SQLiteEffectTransaction<EffectSQLiteD1QueryEffectHKT, EffectSQLiteD1RunResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction);
	}
}
