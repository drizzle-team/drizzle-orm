import type { PgClient } from '@effect/sql-pg/PgClient';
import type { SqlError } from '@effect/sql/SqlError';
import * as Effect from 'effect/Effect';
import type * as V1 from '~/_relations.ts';
import type { EffectCache } from '~/cache/core/cache-effect.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectLogger } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectPreparedQuery, PgEffectSession, PgEffectTransaction } from '~/pg-core/effect/session.ts';
import type { PgQueryResultHKT, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';

export interface EffectPgQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export interface EffectPgQueryResultHKT extends PgQueryResultHKT {
	type: readonly Assume<this['row'], object>[];
}
export interface EffectPgSessionOptions {
	logger: EffectLogger;
	cache: EffectCache;
	useJitMapper?: boolean;
}

export class EffectPgSession<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgEffectSession<EffectPgQueryEffectHKT, TQueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'EffectPgSession';

	constructor(
		private client: PgClient,
		dialect: PgDialect,
		protected relations: TRelations,
		protected schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: EffectPgSessionOptions,
	) {
		super(dialect);
	}

	override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		_name: string | boolean,
		mapper?: (rows: any[]) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgEffectPreparedQuery<T, EffectPgQueryEffectHKT> {
		const executor = (params?: unknown[]) => {
			const q = this.client.unsafe(query.sql, params);

			if (mode === 'arrays') return q.values;
			return q.withoutTransform;
		};

		return new PgEffectPreparedQuery<T, EffectPgQueryEffectHKT>(
			executor,
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
			tx: EffectPgTransaction<
				TQueryResult,
				TFullSchema,
				TRelations,
				TSchema
			>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations, schema } = this;

		return this.client.withTransaction(Effect.gen(this, function*() {
			const tx = new EffectPgTransaction<TQueryResult, TFullSchema, TRelations, TSchema>(
				dialect,
				this,
				relations,
				schema,
			);

			return yield* transaction(tx);
		}));
	}
}

export class EffectPgTransaction<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgEffectTransaction<EffectPgQueryEffectHKT, TQueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'EffectPgTransaction';

	override transaction: <A, E, R>(
		transaction: (
			tx: PgEffectTransaction<EffectPgQueryEffectHKT, TQueryResult, TFullSchema, TRelations, TSchema>,
		) => Effect.Effect<A, E, R>,
	) => Effect.Effect<A, SqlError | E, R> = (tx) => this.session.transaction(tx);
}
