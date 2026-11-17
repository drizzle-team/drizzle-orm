import type { SettledQueryResult } from '~/batch.ts';
import { entityKind, is } from '~/entity.ts';
import { type DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import type { QueryRuntimeHKT } from '~/query-builders/runtime.ts';
import { asyncQueryRuntime, type QueryRuntime } from '~/query-runtime.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { run } from '~/runtime/async.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import { migrate as migrateProgram } from '~/up-migrations/pg-program.ts';
import { pgMigrationRunner } from '~/up-migrations/pg.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '../session.ts';
import { getTransactionConfigStatements, PgBasePreparedQuery, PgSession } from '../session.ts';
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
export class PgAsyncBoundQuery<T extends PreparedQueryConfig> {
	static readonly [entityKind]: string = 'PgAsyncBoundQuery';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	// No `_` result marker on purpose: with it, this class would match the builder-only batch item type that the
	// other pg drivers take (their declarations keep only `_`), and they would send it's placeholders unfilled.

	constructor(
		readonly prepared: PgAsyncPreparedQuery<T>,
		readonly placeholderValues: Record<string, unknown>,
	) {}
}

/** What a statement of `batch`, `pipeline` or `parallel` gives for the driver's result of it */
function multiValue(prepared: PgAsyncPreparedQuery<any>, result: { rows: any[] }): unknown {
	const { mapper, mode } = prepared;
	return mapper ? mapper(result.rows) : mode === 'raw' ? result : result.rows;
}

/**
 * The response of `batch`: one value per statement, in input order
 *
 * @internal
 */
export function mapBatchResults(
	prepared: readonly PgAsyncPreparedQuery<any>[],
	results: ArrayLike<{ rows: any[] }>,
): any[] {
	const response = new Array(results.length);
	for (let i = 0; i < results.length; ++i) response[i] = multiValue(prepared[i]!, results[i]!);
	return response;
}

/**
 * The response of `pipeline` and `parallel`: one settled result per statement, in input order. A statement the
 * driver rejected, and one whose rows could not be mapped, are both `rejected` with the error `queryError` builds
 *
 * @internal
 */
export function mapSettledResults(
	prepared: readonly PgAsyncPreparedQuery<any>[],
	results: ArrayLike<PromiseSettledResult<{ rows: any[] }>>,
	queryError: (index: number, cause: unknown) => DrizzleQueryError,
): SettledQueryResult<any>[] {
	const response: SettledQueryResult<any>[] = new Array(results.length);
	for (let i = 0; i < results.length; ++i) {
		const result = results[i]!;
		if (result.status === 'rejected') {
			response[i] = { status: 'rejected', reason: queryError(i, result.reason) };
			continue;
		}

		try {
			response[i] = { status: 'fulfilled', value: multiValue(prepared[i]!, result.value) };
		} catch (e) {
			response[i] = { status: 'rejected', reason: queryError(i, e) };
		}
	}
	return response;
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
		return asyncQueryRuntime;
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
		return asyncQueryRuntime;
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
	return run(migrateProgram(migrations, pgMigrationRunner(db), config));
}
