import type { PgClient } from '@effect/sql-pg/PgClient';
import type { Result } from '@effect/sql-pg/PgConnection';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { SqlError } from 'effect/sql/SqlError';
import type { EffectCacheShape } from '~/cache/core/cache-effect.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectPreparedQuery, PgEffectSession, PgEffectTransaction } from '~/pg-core/effect/session.ts';
import type { PgQueryResultHKT, PgRawRow, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { Simplify } from '~/utils.ts';

export interface EffectPgQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export type EffectPgQueryResult<TRow> = Simplify<
	Omit<Result, 'rows'> & { readonly rows: [TRow] extends [never] ? readonly [] : ReadonlyArray<TRow> }
>;

export interface EffectPgQueryResultHKT extends PgQueryResultHKT {
	type: EffectPgQueryResult<PgRawRow<this['row']>>;
}

export interface EffectPgSessionOptions {
	logger: EffectLoggerShape;
	cache: EffectCacheShape;
}

export class EffectPgSession<
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations,
> extends PgEffectSession<EffectPgQueryEffectHKT, TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'EffectPgSession';

	constructor(
		private client: PgClient,
		dialect: PgDialect,
		protected relations: TRelations,
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
			if (mode === 'objects') return q.withoutTransform;
			return q.raw;
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
			tx: EffectPgTransaction<TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
		config?: PgTransactionConfig,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations } = this;

		return this.client.withTransaction(Effect.gen({ self: this }, function*() {
			const tx = new EffectPgTransaction<TQueryResult, TRelations>(
				dialect,
				this,
				relations,
			);

			if (config) {
				for (const statement of tx.getTransactionConfigStatements(config)) {
					yield* this.client.unsafe(statement);
				}
			}

			return yield* transaction(tx);
		}));
	}

	override inTransaction(): Effect.Effect<boolean> {
		return Effect.map(Effect.serviceOption(this.client.transactionService), Option.isSome);
	}
}

export class EffectPgTransaction<
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations,
> extends PgEffectTransaction<EffectPgQueryEffectHKT, TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'EffectPgTransaction';

	override transaction<A, E, R>(
		transaction: (
			tx: PgEffectTransaction<EffectPgQueryEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, SqlError | E, R> {
		return this.session.transaction(transaction);
	}
}
