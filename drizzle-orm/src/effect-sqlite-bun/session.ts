import type { SqliteClient } from '@effect/sql-sqlite-bun/SqliteClient';
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

export interface EffectSQLiteBunQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export type EffectSQLiteBunRunResult = unknown;

export interface EffectSQLiteBunSessionOptions {
	logger: EffectLoggerShape;
	cache: EffectCacheShape;
}

export class EffectSQLiteBunSession<TRelations extends AnyRelations>
	extends SQLiteEffectSession<EffectSQLiteBunRunResult, EffectSQLiteBunQueryEffectHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteBunSession';

	constructor(
		private client: SqliteClient,
		dialect: SQLiteDialect,
		protected relations: TRelations,
		private options: EffectSQLiteBunSessionOptions,
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
	): SQLiteEffectPreparedQuery<T, EffectSQLiteBunQueryEffectHKT> {
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

		return new SQLiteEffectPreparedQuery<T, EffectSQLiteBunQueryEffectHKT>(
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
			tx: EffectSQLiteBunTransaction<TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations } = this;

		return this.client.withTransaction(Effect.gen({ self: this }, function*() {
			const tx = new EffectSQLiteBunTransaction<TRelations>(
				dialect,
				this,
				relations,
			);

			return yield* transaction(tx);
		}));
	}
}

export class EffectSQLiteBunTransaction<TRelations extends AnyRelations>
	extends SQLiteEffectTransaction<EffectSQLiteBunQueryEffectHKT, EffectSQLiteBunRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteBunTransaction';

	override transaction<A, E, R>(
		transaction: (
			tx: SQLiteEffectTransaction<EffectSQLiteBunQueryEffectHKT, EffectSQLiteBunRunResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction);
	}
}
