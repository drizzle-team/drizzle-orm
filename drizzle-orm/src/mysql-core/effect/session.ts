import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/sql/SqlError';
import { EffectTransactionRollbackError, MigratorInitError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase, QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { QueryRuntime } from '~/runtime/core.ts';
import { effectMigrationRunner, effectQueryRuntime, runEffectProgram } from '~/runtime/effect.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { migrate as migrateProgram } from '~/up-migrations/mysql-program.ts';
import type { MySqlDialect } from '../dialect.ts';
import {
	MySqlBasePreparedQuery,
	type MySqlPreparedQueryConfig,
	type MySqlQueryResultHKT,
	type MySqlRuntimeHKT,
	MySqlSession,
} from '../session.ts';
import { MySqlEffectDatabase } from './db.ts';

type MySqlEffectPreparedQueryOf<TResult, TRow, TEffectHKT extends QueryEffectHKTBase> = MySqlEffectPreparedQuery<
	MySqlPreparedQueryConfig & { execute: TResult; iterator: TRow },
	TEffectHKT
>;

/** Builders of the Effect runtime run as Effects */
export interface MySqlEffectRuntimeHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlRuntimeHKT
{
	readonly execute: QueryEffectKind<TEffectHKT, this['result']>;
	readonly prepared: MySqlEffectPreparedQueryOf<this['result'], this['row'], TEffectHKT>;
}

export interface MySqlEffectPreparedQuery<
	T extends MySqlPreparedQueryConfig,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> {
	execute(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['execute']>;
}

export class MySqlEffectPreparedQuery<
	// oxlint-disable-next-line no-unused-vars
	T extends MySqlPreparedQueryConfig,
	// oxlint-disable-next-line no-unused-vars
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends MySqlBasePreparedQuery {
	static override readonly [entityKind]: string = 'MySqlEffectPreparedQuery';

	/** @internal */
	override get runtime(): QueryRuntime {
		return effectQueryRuntime;
	}

	constructor(
		executor: (params?: unknown[]) => Effect.Effect<unknown, unknown, unknown>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw',
		logger: EffectLoggerShape,
		paramsInErrors: boolean | undefined,
	) {
		super(executor, query, mapper, mode, logger, paramsInErrors);
	}
}

export interface MySqlEffectSession<
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	// oxlint-disable-next-line no-unused-vars
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	// oxlint-disable-next-line no-unused-vars
	TRelations extends AnyRelations = EmptyRelations,
> {
	execute<T>(query: SQL): QueryEffectKind<TEffectHKT, T>;
	arrays<T>(query: SQL): QueryEffectKind<TEffectHKT, T[]>;
	objects<T>(query: SQL): QueryEffectKind<TEffectHKT, T[]>;
}

export abstract class MySqlEffectSession<
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlSession {
	static override readonly [entityKind]: string = 'MySqlEffectSession';

	/** @internal */
	override get runtime(): QueryRuntime {
		return effectQueryRuntime;
	}

	constructor(dialect: MySqlDialect) {
		super(dialect);
	}

	abstract override prepareQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (rows: any) => any,
	): MySqlEffectPreparedQuery<T, TEffectHKT>;

	abstract transaction<A, E, R>(
		transaction: (
			tx: MySqlEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R>;
}

export abstract class MySqlEffectTransaction<
	TEffectHKT extends QueryEffectHKTBase,
	TQueryResult extends MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlEffectDatabase<TEffectHKT, TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'MySqlEffectTransaction';

	constructor(
		dialect: MySqlDialect,
		session: MySqlEffectSession<TEffectHKT, any, any>,
		protected relations: TRelations,
		protected readonly nestedIndex = 0,
	) {
		super(dialect, session, relations);
	}

	rollback() {
		return new EffectTransactionRollbackError();
	}

	/** Nested transactions (aka savepoints) only work with InnoDB engine. */
	abstract override transaction<A, E, R>(
		transaction: (
			tx: MySqlEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R>;
}

export const migrate = Effect.fn('migrate')(function*<TEffectHKT extends QueryEffectHKTBase>(
	migrations: MigrationMeta[],
	session: MySqlEffectSession<TEffectHKT>,
	config: Omit<MigrationConfig, 'migrationsSchema'>,
) {
	// The shared MySQL migrator (`up-migrations/mysql-program.ts`), run natively by Effect. What the async API
	// returns as an init failure is a typed failure here
	const initFailure = yield* runEffectProgram<
		void | MigratorInitFailResponse,
		TEffectHKT['error'] | SqlError,
		TEffectHKT['context']
	>(() => migrateProgram(migrations, effectMigrationRunner(session), config));

	if (initFailure) return yield* new MigratorInitError({ exitCode: initFailure.exitCode });
});
