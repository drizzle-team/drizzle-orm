import { entityKind } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import type { QueryRuntimeHKT } from '~/query-builders/runtime.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { runAsyncProgram, tracedAsyncQueryRuntime } from '~/runtime/async.ts';
import type { QueryRuntime } from '~/runtime/core.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import { migrate as migrateProgram } from '~/up-migrations/pg-program.ts';
import { pgMigrationRunner } from '~/up-migrations/pg.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '../session.ts';
import { getTransactionConfigStatements, PgBasePreparedQuery, PgBoundQuery, PgSession } from '../session.ts';
import { PgAsyncDatabase } from './db.ts';

/**
 * A prepared query with it's placeholder values bound, so it can run as one item of a batch:
 *
 * ```ts
 * const getUser = db.select().from(users).where(eq(users.id, sql.placeholder('id'))).prepare('get_user');
 * const [alice, bob] = await db.batch([getUser.bind({ id: 1 }), getUser.bind({ id: 2 })]);
 * ```
 *
 * Accepted by `batch`, `pipeline` and `parallel` of the `drizzle-orm/postgres` driver, which run it under the
 * prepared statement's name. Created by {@link PgAsyncPreparedQuery.bind}.
 */
export class PgAsyncBoundQuery<T extends PreparedQueryConfig> extends PgBoundQuery {
	static override readonly [entityKind]: string = 'PgAsyncBoundQuery';

	declare readonly prepared: PgAsyncPreparedQuery<T>;

	constructor(prepared: PgAsyncPreparedQuery<T>, placeholderValues: Record<string, unknown>) {
		super(prepared, placeholderValues);
	}
}

export interface PgAsyncPreparedQuery<T extends PreparedQueryConfig> {
	/**
	 * Runs the query with values for it's placeholders and returns a Promise of the result.
	 *
	 * Eager: the query is sent as soon as `execute` is called, whether or not the Promise is awaited. To hand the
	 * query and it's values to something that runs it later, such as a batch, use {@link bind}.
	 */
	execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;
}

export class PgAsyncPreparedQuery<T extends PreparedQueryConfig> extends PgBasePreparedQuery {
	static override readonly [entityKind]: string = 'PgAsyncPreparedQuery';

	/** @internal */
	override get runtime(): QueryRuntime {
		return tracedAsyncQueryRuntime;
	}

	constructor(
		executor: (params?: unknown[]) => Promise<any>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		logger: Logger,
		paramsInErrors: boolean | undefined,
	) {
		super(executor, query, mapper, mode, logger, paramsInErrors);
	}

	/**
	 * Pairs this query with values for it's placeholders without running it: the lazy counterpart of
	 * {@link execute}. Nothing is sent until the result is run as an item of `batch`, `pipeline` or `parallel`
	 * of the `drizzle-orm/postgres` driver, which runs it under this query's statement name:
	 *
	 * ```ts
	 * const [alice, bob] = await db.batch([getUser.bind({ id: 1 }), getUser.bind({ id: 2 })]);
	 * ```
	 *
	 * Other drivers' batches don't accept it.
	 */
	bind(placeholderValues: Record<string, unknown> = {}): PgAsyncBoundQuery<T> {
		return new PgAsyncBoundQuery(this, placeholderValues);
	}
}

type PgAsyncPreparedQueryOf<TResult> = PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }>;

/** Builders of the async runtime run as Promises */
export interface PgAsyncRuntimeHKT extends QueryRuntimeHKT {
	readonly execute: Promise<this['result']>;
	readonly prepared: PgAsyncPreparedQueryOf<this['result']>;
}

export interface BasePgAsyncSession {
	execute<T>(query: SQL): Promise<T[]>;
	arrays<T>(query: SQL): Promise<T[]>;
	objects<T>(query: SQL): Promise<T[]>;
}

export abstract class BasePgAsyncSession extends PgSession {
	static override readonly [entityKind]: string = 'BasePgAsyncSession';

	/** @internal */
	override get runtime(): QueryRuntime {
		return tracedAsyncQueryRuntime;
	}

	abstract override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		name: string | boolean,
		mapper?: (rows: any[]) => any,
		driverShape?: unknown,
	): PgAsyncPreparedQuery<T>;
}

export abstract class PgAsyncSession<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends BasePgAsyncSession {
	static override readonly [entityKind]: string = 'PgAsyncSession';

	abstract transaction<T>(
		transaction: (tx: PgAsyncTransaction<TQueryResult, TRelations>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T>;
}

export abstract class PgAsyncTransaction<
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'PgAsyncTransaction';

	constructor(
		dialect: PgDialect,
		session: PgAsyncSession<any, any>,
		relations: TRelations,
		protected readonly nestedIndex = 0,
		parseRqbJson: boolean | undefined,
	) {
		super(dialect, session, relations, parseRqbJson);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	async setTransaction(config: PgTransactionConfig): Promise<unknown> {
		let result: unknown;
		for (const statement of getTransactionConfigStatements(this.dialect, config)) {
			result = await this.session.execute(sql.raw(statement));
		}
		return result;
	}

	abstract override transaction<T>(
		transaction: (tx: PgAsyncTransaction<TQueryResult, TRelations>) => Promise<T>,
	): Promise<T>;
}

/** Runs the shared Postgres migrator (`up-migrations/pg-program.ts`) with Promises */
export function migrate(
	migrations: MigrationMeta[],
	db: PgAsyncDatabase<PgQueryResultHKT, any>,
	config: string | MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	return runAsyncProgram(() => migrateProgram(migrations, pgMigrationRunner(db), config));
}
