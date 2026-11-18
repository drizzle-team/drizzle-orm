import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/sql/SqlError';
import { MigratorInitError } from '~/effect-core/errors.ts';
import { EffectTransactionRollbackError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase, QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import type { QueryRuntimeHKT } from '~/query-builders/runtime.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { QueryRuntime } from '~/runtime/core.ts';
import { effectMigrationRunner, runEffectProgram, tracedEffectQueryRuntime } from '~/runtime/effect.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import { migrate as migrateProgram } from '~/up-migrations/pg-program.ts';
import type { PgDialect } from '../dialect.ts';
import {
	getTransactionConfigStatements,
	PgBasePreparedQuery,
	type PgQueryResultHKT,
	PgSession,
	type PgTransactionConfig,
	type PreparedQueryConfig,
} from '../session.ts';
import { PgEffectDatabase } from './db.ts';

export interface PgEffectPreparedQuery<
	T extends PreparedQueryConfig,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> {
	/** Runs the query with values for it's placeholders. A failed query fails with an `EffectDrizzleQueryError` */
	execute(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['execute']>;
}

export class PgEffectPreparedQuery<
	// oxlint-disable-next-line no-unused-vars
	T extends PreparedQueryConfig,
	// oxlint-disable-next-line no-unused-vars
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgBasePreparedQuery {
	static override readonly [entityKind]: string = 'PgEffectPreparedQuery';

	/** @internal */
	override get runtime(): QueryRuntime {
		return tracedEffectQueryRuntime;
	}

	constructor(
		executor: (params?: unknown[]) => Effect.Effect<unknown, unknown, unknown>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		logger: EffectLoggerShape,
		paramsInErrors: boolean | undefined,
	) {
		super(executor, query, mapper, mode, logger, paramsInErrors);
	}
}

type PgEffectPreparedQueryOf<TResult, TEffectHKT extends QueryEffectHKTBase> = PgEffectPreparedQuery<
	PreparedQueryConfig & { execute: TResult },
	TEffectHKT
>;

/** Builders of the Effect runtime run as Effects */
export interface PgEffectRuntimeHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends QueryRuntimeHKT
{
	readonly execute: QueryEffectKind<TEffectHKT, this['result']>;
	readonly prepared: PgEffectPreparedQueryOf<this['result'], TEffectHKT>;
}

export interface PgEffectSession<
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	// oxlint-disable-next-line no-unused-vars
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	// oxlint-disable-next-line no-unused-vars
	TRelations extends AnyRelations = EmptyRelations,
> {
	execute<T>(query: SQL): QueryEffectKind<TEffectHKT, T[]>;
	arrays<T>(query: SQL): QueryEffectKind<TEffectHKT, T[]>;
	objects<T>(query: SQL): QueryEffectKind<TEffectHKT, T[]>;
}

export abstract class PgEffectSession<
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgSession {
	static override readonly [entityKind]: string = 'PgEffectSession';

	/** @internal */
	override get runtime(): QueryRuntime {
		return tracedEffectQueryRuntime;
	}

	constructor(dialect: PgDialect) {
		super(dialect);
	}

	abstract override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		name: string | boolean,
		mapper?: (rows: any[]) => any,
		shape?: unknown,
	): PgEffectPreparedQuery<T, TEffectHKT>;

	abstract transaction<A, E, R>(
		transaction: (
			tx: PgEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
		config?: PgTransactionConfig,
	): Effect.Effect<A, E | SqlError, R>;
}

export abstract class PgEffectTransaction<
	TEffectHKT extends QueryEffectHKTBase,
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgEffectDatabase<TEffectHKT, TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'PgEffectTransaction';

	constructor(
		dialect: PgDialect,
		session: PgEffectSession<TEffectHKT, any, any>,
		protected relations: TRelations,
		protected readonly nestedIndex = 0,
		parseRqbJson?: boolean,
	) {
		super(dialect, session, relations, parseRqbJson);
	}

	rollback() {
		return new EffectTransactionRollbackError();
	}

	setTransaction(config: PgTransactionConfig) {
		return Effect.forEach(
			getTransactionConfigStatements(this.dialect, config),
			(statement) => this.session.execute<void>(sql.raw(statement)),
			{ discard: true },
		);
	}

	abstract override transaction<A, E, R>(
		transaction: (
			tx: PgEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R>;
}

export const migrate = Effect.fn('migrate')(function*<TEffectHKT extends QueryEffectHKTBase>(
	migrations: MigrationMeta[],
	session: PgEffectSession<TEffectHKT>,
	config: string | MigrationConfig,
) {
	// The shared Postgres migrator (`up-migrations/pg-program.ts`), run natively by Effect. What the async API
	// returns as an init failure is a typed failure here
	const initFailure = yield* runEffectProgram<
		void | MigratorInitFailResponse,
		TEffectHKT['error'] | SqlError,
		TEffectHKT['context']
	>(() => migrateProgram(migrations, effectMigrationRunner(session), config));

	if (initFailure) return yield* new MigratorInitError({ exitCode: initFailure.exitCode });
});
