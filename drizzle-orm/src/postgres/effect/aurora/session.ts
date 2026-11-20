import type { QueryResult, ShapeSpec } from '#postgres';
import type { DrizzleAuroraClient as Client } from '#postgres/effect/aurora';
import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/sql/SqlError';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectPreparedQuery, PgEffectSession, PgEffectTransaction } from '~/pg-core/effect/session.ts';
import type { PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { setTransactionSnapshotSQL } from '~/pg-core/session.ts';
import type { PostgresAuroraQueryResultHKT as EffectPostgresAuroraQueryResultHKT } from '~/postgres/aurora/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';

export type { EffectPostgresAuroraQueryResultHKT };

export interface EffectPostgresAuroraQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export interface EffectPostgresAuroraSessionOptions {
	logger: EffectLoggerShape;
	paramsInErrors?: boolean;
}

export class EffectPostgresAuroraSession<
	TRelations extends AnyRelations,
> extends PgEffectSession<EffectPostgresAuroraQueryEffectHKT, EffectPostgresAuroraQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'EffectPostgresAuroraSession';

	constructor(
		private client: Client.DrizzleAuroraClient,
		dialect: PgDialect,
		protected relations: TRelations,
		private options: EffectPostgresAuroraSessionOptions,
	) {
		super(dialect);
	}

	override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		// The Data API has no prepared statements: every statement is a request of it's own
		_name: string | boolean,
		mapper?: (rows: any[]) => any,
		shape?: ShapeSpec,
	) {
		const executor = (params?: unknown[]) => {
			const result: Effect.Effect<QueryResult<unknown>, SqlError> = mode === 'arrays'
				? this.client.query(query.sql, params ?? [], { mode: 'array', shape })
				: this.client.query(query.sql, params ?? [], { mode: 'object', shape });

			if (mode === 'raw') return result;
			return Effect.map(result, (r) => r.rows);
		};

		return new PgEffectPreparedQuery<T, EffectPostgresAuroraQueryEffectHKT>(
			executor,
			query,
			mapper,
			mode,
			this.options.logger,
			this.options.paramsInErrors,
		);
	}

	override transaction<A, E, R>(
		transaction: (tx: EffectPostgresAuroraTransaction<TRelations>) => Effect.Effect<A, E, R>,
		config?: PgTransactionConfig,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations } = this;

		return this.client.withTransaction(
			Effect.gen({ self: this }, function*() {
				const tx = new EffectPostgresAuroraTransaction<TRelations>(dialect, this, relations);

				if (typeof config?.snapshot === 'string') {
					yield* this.client.query(dialect.sqlToQuery(setTransactionSnapshotSQL(config.snapshot)).sql, [], {
						mode: 'object',
					});
				}

				return yield* transaction(tx);
			}),
			{
				deferrable: config?.deferrable,
				isolation: config?.isolationLevel,
				readOnly: config?.accessMode === 'read only',
			},
		);
	}
}

export class EffectPostgresAuroraTransaction<
	TRelations extends AnyRelations,
> extends PgEffectTransaction<EffectPostgresAuroraQueryEffectHKT, EffectPostgresAuroraQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'EffectPostgresAuroraTransaction';

	/** @internal */
	declare session: EffectPostgresAuroraSession<TRelations>;

	override transaction<A, E, R>(
		transaction: (
			tx: PgEffectTransaction<EffectPostgresAuroraQueryEffectHKT, EffectPostgresAuroraQueryResultHKT, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction);
	}
}
