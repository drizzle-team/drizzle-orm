import type { MysqlClient } from '@effect/sql-mysql2/MysqlClient';
import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import type { EffectCacheShape } from '~/cache/core/cache-effect.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import { MySqlEffectPreparedQuery, MySqlEffectSession, MySqlEffectTransaction } from '~/mysql-core/effect/session.ts';
import type { MySqlPreparedQueryConfig, MySqlQueryResultHKT } from '~/mysql-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';

export interface EffectMysql2QueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export interface EffectMysql2QueryResultHKT extends MySqlQueryResultHKT {
	type: readonly Assume<this['row'], object>[];
}

export interface EffectMysql2SessionOptions {
	logger: EffectLoggerShape;
	cache: EffectCacheShape;
}

export class EffectMysql2Session<
	TQueryResult extends MySqlQueryResultHKT,
	TRelations extends AnyRelations,
> extends MySqlEffectSession<EffectMysql2QueryEffectHKT, TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'EffectMysql2Session';

	constructor(
		private client: MysqlClient,
		dialect: MySqlDialect,
		protected relations: TRelations,
		private options: EffectMysql2SessionOptions,
	) {
		super(dialect);
	}

	override prepareQuery<T extends MySqlPreparedQueryConfig = MySqlPreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (rows: any[]) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): MySqlEffectPreparedQuery<T, EffectMysql2QueryEffectHKT> {
		const executor = (params?: unknown[]) => {
			const q = this.client.unsafe(query.sql, params);

			if (mode === 'arrays') return q.values;
			if (mode === 'objects') return q.withoutTransform;
			if (!mapper) return q.raw;

			return q.raw.pipe(Effect.map(({ insertId, affectedRows }: any) => ({
				insertId,
				affectedRows,
			})));
		};

		return new MySqlEffectPreparedQuery<T, EffectMysql2QueryEffectHKT>(
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
			tx: EffectMysql2Transaction<TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations } = this;

		return this.client.withTransaction(Effect.gen({ self: this }, function*() {
			const tx = new EffectMysql2Transaction<TQueryResult, TRelations>(
				dialect,
				this,
				relations,
			);

			return yield* transaction(tx);
		}));
	}
}

export class EffectMysql2Transaction<
	TQueryResult extends MySqlQueryResultHKT,
	TRelations extends AnyRelations,
> extends MySqlEffectTransaction<EffectMysql2QueryEffectHKT, TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'EffectMysql2Transaction';

	override transaction<A, E, R>(
		transaction: (
			tx: MySqlEffectTransaction<EffectMysql2QueryEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, SqlError | E, R> {
		return this.session.transaction(transaction);
	}
}
