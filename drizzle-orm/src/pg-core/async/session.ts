import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import { cachedQuery, type CacheOps } from '~/cache/core/flow.ts';
import type { QueryMetadata, WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { is } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { run } from '~/runtime/async.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { hasTelemetry, tracer } from '~/tracing.ts';
import { migrate as migrateProgram } from '~/up-migrations/pg-program.ts';
import { pgMigrationRunner } from '~/up-migrations/pg.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '../session.ts';
import { PgBasePreparedQuery, PgSession } from '../session.ts';
import { PgAsyncDatabase } from './db.ts';

/**
 * A prepared query with its placeholder values bound, so it can run as one item of a batch:
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
	// other pg drivers take (their declarations keep only `_`), and they would send its placeholders unfilled.

	constructor(
		readonly prepared: PgAsyncPreparedQuery<T>,
		readonly placeholderValues: Record<string, unknown>,
	) {}
}

export class PgAsyncPreparedQuery<T extends PreparedQueryConfig> extends PgBasePreparedQuery {
	static override readonly [entityKind]: string = 'PgAsyncPreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;

	private fastPath: boolean;

	constructor(
		protected executor: (params?: unknown[]) => Promise<any>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw' | 'call',
		protected logger: Logger,
		// cache instance
		protected cache: Cache | undefined,
		// per query related metadata
		protected queryMetadata: QueryMetadata | undefined,
		// config that was passed through $withCache
		protected cacheConfig: WithCacheConfig | undefined,
		protected paramsInErrors: boolean | undefined,
	) {
		super(query);
		this.mapper = mapper;
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}

		this.fastPath = cacheConfig === undefined
			&& (cache === undefined || is(cache, NoopCache))
			&& !hasTelemetry;
	}

	/**
	 * Pairs this query with values for its placeholders without running it: the lazy counterpart of
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

	/**
	 * Runs the query with values for its placeholders and returns a Promise of the result.
	 *
	 * Eager: the query is sent as soon as `execute` is called, whether or not the Promise is awaited. To hand the
	 * query and its values to something that runs it later, such as a batch, use {@link bind}.
	 */
	override async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const { query, logger, executor, mapper, fastPath } = this;

		if (fastPath) {
			const sql = query._sql ? query._sql.join(' ') : query.sql;
			const params = query.params.length === 0
				? query.params
				: fillPlaceholders(query.params, placeholderValues);
			logger.logQuery(sql, params);
			const res = executor(params).catch((e) => {
				throw new DrizzleQueryError(sql, this.paramsInErrors ? params : undefined, e as Error);
			});
			if (!mapper) return res;

			return res.then((rows) => mapper(rows));
		}

		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(this.query.params, placeholderValues);
			const sql = this.query._sql ? this.query._sql.join(' ') : this.query.sql;
			const { mapper } = this;

			span?.setAttributes({
				'drizzle.query.text': sql,
				'drizzle.query.params': JSON.stringify(params),
			});

			this.logger.logQuery(sql, params);

			const query = tracer.startActiveSpan('drizzle.driver.execute', async (span) => {
				span?.setAttributes({
					'drizzle.query.text': sql,
					'drizzle.query.params': JSON.stringify(params),
				});

				// return await so tracer captures time accurately
				return await this.queryWithCache(sql, params, () => this.executor(params));
			});

			if (!mapper) return query;

			return query.then((rows) => tracer.startActiveSpan('drizzle.mapResponse', () => mapper(rows as unknown[])));
		});
	}

	/**
	 * Runs the shared cache flow (`cachedQuery`) with Promises. A failed query, and a failed invalidation after a
	 * mutation, reject with a `DrizzleQueryError`; a failed cache read or write rejects with the cache's own error
	 *
	 * @internal
	 */
	protected queryWithCache<T>(
		queryString: string,
		params: any[],
		query: () => Promise<T>,
	): Promise<T> {
		const asQueryError = (e: unknown): never => {
			throw new DrizzleQueryError(queryString, this.paramsInErrors ? params : undefined, e as Error);
		};
		const { cache } = this;
		const ops: CacheOps | undefined = cache !== undefined && !is(cache, NoopCache)
			? {
				get: (key, tables, isTag, isAutoInvalidate) => cache.get(key, tables, isTag, isAutoInvalidate),
				put: (key, response, tables, isTag, config) => cache.put(key, response, tables, isTag, config),
				onMutate: (mutation) => cache.onMutate(mutation).catch(asQueryError),
			}
			: undefined;

		return run(
			cachedQuery<T>(ops, queryString, params, this.queryMetadata, this.cacheConfig, () => query().catch(asQueryError)),
		);
	}
}

export abstract class BasePgAsyncSession extends PgSession {
	static override readonly [entityKind]: string = 'BasePgAsyncSession';

	abstract override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		name: string | boolean,
		mapper?: (rows: any[]) => any,
		queryMetadata?: QueryMetadata,
		cacheConfig?: WithCacheConfig,
		driverShape?: unknown,
	): PgAsyncPreparedQuery<T>;

	override execute<T>(query: SQL): Promise<T[]> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
					this.dialect.sqlToQuery(query),
					'raw',
					false,
				);
			});

			return prepared.execute();
		});
	}

	override arrays<T>(query: SQL): Promise<T[]> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
					this.dialect.sqlToQuery(query),
					'arrays',
					false,
				);
			});

			return prepared.execute();
		});
	}

	override objects<T>(query: SQL): Promise<T[]> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
					this.dialect.sqlToQuery(query),
					'objects',
					false,
				);
			});

			return prepared.execute();
		});
	}
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

	/** @internal */
	getTransactionConfigChunks(config: PgTransactionConfig): string[] {
		const chunks: string[] = [];
		if (config.isolationLevel) {
			chunks.push(`isolation level ${config.isolationLevel}`);
		}
		if (config.accessMode) {
			chunks.push(config.accessMode);
		}
		if (typeof config.deferrable === 'boolean') {
			chunks.push(config.deferrable ? 'deferrable' : 'not deferrable');
		}
		return chunks;
	}

	/** @internal */
	getTransactionConfigSQL(config: PgTransactionConfig): SQL {
		return sql.raw(this.getTransactionConfigChunks(config).join(' '));
	}

	/** @internal */
	setTransactionSnapshotSQL(snapshot: string): SQL {
		return sql`set transaction snapshot ${snapshot}`.inlineParams();
	}

	async setTransaction(config: PgTransactionConfig): Promise<unknown> {
		const chunks = this.getTransactionConfigChunks(config);
		if (chunks.length) {
			await this.session.execute<void>(sql.raw(`set transaction ${chunks.join(' ')}`));
		}
		if (typeof config.snapshot === 'string') {
			return this.session.execute(this.setTransactionSnapshotSQL(config.snapshot));
		}
		return undefined;
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
