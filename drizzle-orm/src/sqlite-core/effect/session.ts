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
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import {
	type PreparedQueryConfig,
	type SQLiteExecuteMethod,
	SQLitePreparedQuery,
	SQLiteSession,
} from '~/sqlite-core/session.ts';
import { migrate as migrateProgram } from '~/up-migrations/sqlite-program.ts';
import { SQLiteEffectDatabase } from './db.ts';

export type SQLiteEffectQueryExecutors = Record<
	// `values` mirrors `all` in array mode, no need to define separate executor
	Exclude<SQLiteExecuteMethod, 'values'>,
	(params: unknown[]) => Effect.Effect<any, unknown, unknown>
>;

export interface SQLiteEffectPreparedQuery<
	T extends PreparedQueryConfig,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> {
	run(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['run']>;
	all(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['all']>;
	get(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['get']>;
	values(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['values']>;
	execute(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['execute']>;
}

export class SQLiteEffectPreparedQuery<
	// oxlint-disable-next-line no-unused-vars
	T extends PreparedQueryConfig,
	// oxlint-disable-next-line no-unused-vars
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends SQLitePreparedQuery {
	static override readonly [entityKind]: string = 'SQLiteEffectPreparedQuery';

	/** @internal */
	override get runtime(): QueryRuntime {
		return effectQueryRuntime;
	}

	constructor(
		executeMethod: SQLiteExecuteMethod = 'all',
		executors: SQLiteEffectQueryExecutors,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw',
		logger: EffectLoggerShape,
		paramsInErrors: boolean | undefined,
	) {
		super(executeMethod, executors, query, mapper, mode, logger, paramsInErrors);
	}
}

export interface SQLiteEffectSession<
	TRunResult,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	// oxlint-disable-next-line no-unused-vars
	TRelations extends AnyRelations = EmptyRelations,
> {
	run(query: SQL): QueryEffectKind<TEffectHKT, TRunResult>;
	objects<T = unknown>(query: SQL): QueryEffectKind<TEffectHKT, T[]>;
	object<T = unknown>(query: SQL): QueryEffectKind<TEffectHKT, T>;
	arrays<T extends any[] = unknown[]>(query: SQL): QueryEffectKind<TEffectHKT, T[]>;
	array<T extends any[] = unknown[]>(query: SQL): QueryEffectKind<TEffectHKT, T>;
}

export abstract class SQLiteEffectSession<
	TRunResult,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteSession<TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteEffectSession';

	/** @internal */
	override get runtime(): QueryRuntime {
		return effectQueryRuntime;
	}

	declare readonly dialect: SQLiteDialect;

	constructor(dialect: SQLiteDialect) {
		super(dialect);
	}

	abstract override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		prepare: boolean,
		executeMethod?: SQLiteExecuteMethod,
		mapper?: (rows: any[]) => any,
	): SQLiteEffectPreparedQuery<T, TEffectHKT>;

	abstract transaction<A, E, R>(
		transaction: (
			tx: SQLiteEffectTransaction<TEffectHKT, TRunResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R>;
}

export abstract class SQLiteEffectTransaction<
	TEffectHKT extends QueryEffectHKTBase,
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteEffectDatabase<TEffectHKT, TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteEffectTransaction';

	constructor(
		dialect: SQLiteDialect,
		session: SQLiteEffectSession<any, TEffectHKT, any>,
		relations: TRelations,
		protected readonly nestedIndex = 0,
		forbidJsonb?: boolean,
	) {
		super(dialect, session, relations, forbidJsonb);
	}

	rollback() {
		return new EffectTransactionRollbackError();
	}
}

export const migrate = Effect.fn('migrate')(function*<TEffectHKT extends QueryEffectHKTBase>(
	migrations: MigrationMeta[],
	session: SQLiteEffectSession<any, TEffectHKT>,
	config?: string | Omit<MigrationConfig, 'migrationsFolder'>,
) {
	// The shared SQLite migrator (`up-migrations/sqlite-program.ts`), run natively by Effect. What the async API
	// returns as an init failure is a typed failure here
	const initFailure = yield* runEffectProgram<
		void | MigratorInitFailResponse,
		TEffectHKT['error'] | SqlError,
		TEffectHKT['context']
	>(() =>
		migrateProgram(
			migrations,
			effectMigrationRunner({
				execute: (query) => session.run(query),
				objects: (query) => session.objects(query),
				transaction: (transaction) => session.transaction((tx) => transaction({ execute: (query) => tx.run(query) })),
			}),
			config,
		)
	);

	if (initFailure) return yield* new MigratorInitError({ exitCode: initFailure.exitCode });
});
