import type { QueryResult, ShapeSpec } from '#postgres';
import type { DrizzlePostgresHttpClient as Client } from '#postgres/effect/http';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';
import type { SqlError } from 'effect/sql/SqlError';
import type { BatchItem } from '~/batch.ts';
import { EffectDrizzleQueryError, MigratorInitError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectPreparedQuery, PgEffectSession, type PgEffectTransaction } from '~/pg-core/effect/session.ts';
import type { PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PostgresHttpQueryResultHKT as EffectPostgresHttpQueryResultHKT } from '~/postgres/http/session.ts';
import { buildHttpMulti } from '~/postgres/http/utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { runEffectProgram } from '~/runtime/effect.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { migrate as migrateProgram } from '~/up-migrations/pg-program.ts';

export type { EffectPostgresHttpQueryResultHKT };

/** The response of `pipeline` and `parallel`: one `Result` per query, in input order */
export type EffectPostgresHttpSettledResponse<T extends BatchItem[] | readonly BatchItem[]> = {
	[K in keyof T]: Result.Result<T[K]['_']['result'], EffectDrizzleQueryError>;
};

export interface EffectPostgresHttpQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

/** Transaction settings of `batch`: `snapshot` needs `isolation: 'repeatable read' | 'serializable'` */
export type EffectPostgresHttpBatchOptions = NonNullable<Parameters<Client.DrizzlePostgresHttpClient['batch']>[1]>;

export interface EffectPostgresHttpSessionOptions {
	logger: EffectLoggerShape;
	paramsInErrors?: boolean;
}

export class EffectPostgresHttpPreparedQuery<
	T extends PreparedQueryConfig,
	TEffectHKT extends QueryEffectHKTBase = EffectPostgresHttpQueryEffectHKT,
> extends PgEffectPreparedQuery<T, TEffectHKT> {
	static override readonly [entityKind]: string = 'EffectPostgresHttpPreparedQuery';

	constructor(
		executor: (params?: unknown[]) => Effect.Effect<unknown, unknown, unknown>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		logger: EffectLoggerShape,
		/** The shape the client decodes the rows with, kept for the statements of `batch`, `pipeline` and `parallel` */
		readonly shape: ShapeSpec | undefined,
		paramsInErrors: boolean | undefined,
	) {
		super(executor, query, mapper, mode, logger, paramsInErrors);
	}
}

const kindLabel = { gateway: 'gateway', neon: 'Neon HTTP' } as const;
const kindEntry = {
	gateway: 'drizzle-orm/postgres/effect/http',
	neon: 'drizzle-orm/postgres/effect/neon-http',
};

/**
 * The defect of a database given the other kind of HTTP client: both kinds are provided as one service
 *
 * @internal
 */
export const wrongKind = (expected: 'gateway' | 'neon', actual: 'gateway' | 'neon') =>
	`\`${kindEntry[expected]}\` needs a ${kindLabel[expected]} \`DrizzlePostgresHttpClient\`, but got a ${
		kindLabel[actual]
	} one: use \`${kindEntry[actual]}\` for it`;

const noTransactions =
	'No interactive transactions support in postgres HTTP drivers. Use `db.batch(...)` for an atomic set of statements, or a wire-protocol driver (`drizzle-orm/postgres/effect` over `DrizzlePostgresClient`) for interactive transactions';

/** The index of the statement a failed `batch` request names in it's error, when the backend reports one */
const failedQueryIndex = (error: unknown): number | undefined => {
	const seen = new Set<unknown>();
	let e: any = error;
	while (e && typeof e === 'object' && !seen.has(e)) {
		seen.add(e);
		if (typeof e.failedQueryIndex === 'number') return e.failedQueryIndex;
		e = e.reason ?? e.cause;
	}
	return undefined;
};

export class EffectPostgresHttpSession<
	TRelations extends AnyRelations,
> extends PgEffectSession<EffectPostgresHttpQueryEffectHKT, EffectPostgresHttpQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'EffectPostgresHttpSession';

	constructor(
		private client: Client.DrizzlePostgresHttpClient,
		dialect: PgDialect,
		protected relations: TRelations,
		private options: EffectPostgresHttpSessionOptions,
	) {
		super(dialect);
	}

	override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		// HTTP holds no session to keep a prepared statement in: every statement is a request of it's own
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

		return new EffectPostgresHttpPreparedQuery<T>(
			executor,
			query,
			mapper,
			mode,
			this.options.logger,
			shape,
			this.options.paramsInErrors,
		);
	}

	/** Atomic: runs all queries in one transaction, in a single request */
	batch(
		queries: readonly BatchItem<'pg'>[],
		options?: EffectPostgresHttpBatchOptions,
	): Effect.Effect<unknown[], EffectDrizzleQueryError | SqlError> {
		return Effect.suspend(() => this.runBatch(queries, options));
	}

	private runBatch(
		queries: readonly (BatchItem<'pg'> | EffectPostgresHttpPreparedQuery<any>)[],
		options?: EffectPostgresHttpBatchOptions,
	): Effect.Effect<unknown[], EffectDrizzleQueryError | SqlError> {
		const { prepared, built } = buildHttpMulti<EffectPostgresHttpPreparedQuery<any>>(queries);
		return this.client.batch(built, options).pipe(
			Effect.catch((e) => {
				const index = failedQueryIndex(e);
				const query = index === undefined ? undefined : prepared[index];
				return Effect.fail(query ? this.queryError(query, e) : e);
			}),
			Effect.flatMap((results) => Effect.forEach(results, (result, i) => this.mapResult(prepared[i]!, result))),
		);
	}

	/**
	 * Non-atomic: pipelines all queries in a single request, each in it's own autocommit
	 *
	 * A failing query does not fail the others: each gives it's own `Result`, in input order
	 */
	pipeline(
		queries: readonly BatchItem<'pg'>[],
	): Effect.Effect<Result.Result<unknown, EffectDrizzleQueryError>[], SqlError> {
		return Effect.suspend(() => {
			const { prepared, built } = buildHttpMulti<EffectPostgresHttpPreparedQuery<any>>(queries);

			return Effect.flatMap(
				this.client.pipeline(built),
				(outcomes) =>
					Effect.forEach(outcomes, (outcome, i) =>
						Result.isSuccess(outcome)
							? Effect.result(this.mapResult(prepared[i]!, outcome.success))
							: Effect.succeed(Result.fail(this.queryError(prepared[i]!, outcome.failure)))),
			);
		});
	}
	/**
	 * Non-atomic: sends every query as it's own concurrent request, each in it's own autocommit
	 *
	 * A failing query does not fail the others: each gives it's own `Result`, in input order
	 */
	parallel(queries: readonly BatchItem<'pg'>[]): Effect.Effect<Result.Result<unknown, EffectDrizzleQueryError>[]> {
		return Effect.suspend(() =>
			Effect.forEach(
				buildHttpMulti<EffectPostgresHttpPreparedQuery<any>>(queries).prepared,
				(prepared) => Effect.result(this.runStatement(prepared)),
				{ concurrency: 'unbounded' },
			)
		);
	}

	/** Runs one statement of `parallel` as a request of it's own */
	private runStatement(prepared: EffectPostgresHttpPreparedQuery<any>) {
		const { sql, params } = prepared.getQuery();
		const { shape } = prepared;
		const result: Effect.Effect<QueryResult<unknown>, SqlError> = prepared.mode === 'arrays'
			? this.client.query(sql, params, { mode: 'array', shape })
			: this.client.query(sql, params, { mode: 'object', shape });

		return result.pipe(
			Effect.mapError((e) => this.queryError(prepared, e)),
			Effect.flatMap((r) => this.mapResult(prepared, r)),
		);
	}

	/** What a statement of `batch`, `pipeline` or `parallel` gives for the client's result of it */
	private mapResult(prepared: EffectPostgresHttpPreparedQuery<any>, result: QueryResult<unknown>) {
		const { mapper, mode } = prepared;
		if (!mapper) return Effect.succeed(mode === 'raw' ? result : result.rows);

		return Effect.try({ try: () => mapper(result.rows), catch: (e) => this.queryError(prepared, e) });
	}

	private queryError(prepared: EffectPostgresHttpPreparedQuery<any>, cause: unknown) {
		const { sql, params } = prepared.getQuery();
		return new EffectDrizzleQueryError({
			query: sql,
			params: this.options.paramsInErrors ? params : undefined,
			cause: Cause.fail(cause),
		});
	}

	override transaction<A, E, R>(
		_transaction: (
			tx: PgEffectTransaction<EffectPostgresHttpQueryEffectHKT, EffectPostgresHttpQueryResultHKT, TRelations>,
		) => Effect.Effect<A, E, R>,
		_config?: PgTransactionConfig,
	): Effect.Effect<A, E | SqlError, R> {
		return Effect.die(new Error(noTransactions));
	}

	/**
	 * The migrator's atomic step: HTTP has no interactive transactions, so the statements run as one batch
	 *
	 * @internal
	 */
	atomically(statements: SQL[]) {
		return Effect.suspend(() =>
			this.runBatch(
				statements.map((statement) => this.prepareQuery(this.dialect.sqlToQuery(statement), 'raw', false, undefined)),
			)
		);
	}
}

/** What a migration runs on: the session of either HTTP database, which both have these the same */
type HttpMigrationSession = Pick<EffectPostgresHttpSession<AnyRelations>, 'execute' | 'objects' | 'atomically'>;

/**
 * The migrator of both HTTP databases, gateway and Neon. HTTP has no interactive transactions: the statements of a
 * migration apply atomically as one batch
 *
 * @internal
 */
export const migrateHttp = Effect.fn('migrate')(function*(
	migrations: MigrationMeta[],
	session: HttpMigrationSession,
	config: MigrationConfig,
) {
	const initFailure = yield* runEffectProgram<
		void | MigratorInitFailResponse,
		Effect.Error<ReturnType<HttpMigrationSession['atomically']>>,
		never
	>(() =>
		migrateProgram(migrations, {
			execute: (query) => session.execute(query),
			objects: (query) => session.objects(query),
			atomically: (statements) => session.atomically(statements),
		}, config)
	);

	if (initFailure) return yield* new MigratorInitError({ exitCode: initFailure.exitCode });
});
