import type { QueryResult, ShapeSpec } from '#postgres';
import type { DrizzlePostgresHttpClient as Client } from '#postgres/effect/neon-http';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import type * as Result from 'effect/Result';
import type { SqlError } from 'effect/sql/SqlError';
import type { BatchItem } from '~/batch.ts';
import { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectSession, type PgEffectTransaction } from '~/pg-core/effect/session.ts';
import type { PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { buildHttpMulti } from '~/postgres/http/utils.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import {
	type EffectPostgresHttpBatchOptions,
	EffectPostgresHttpPreparedQuery,
	type EffectPostgresHttpQueryEffectHKT,
	type EffectPostgresHttpQueryResultHKT,
	type EffectPostgresHttpSessionOptions,
} from '../http/session.ts';

export {
	type EffectPostgresHttpBatchOptions,
	EffectPostgresHttpPreparedQuery,
	type EffectPostgresHttpQueryEffectHKT,
	type EffectPostgresHttpQueryResultHKT,
	type EffectPostgresHttpSessionOptions,
	type EffectPostgresHttpSettledResponse,
} from '../http/session.ts';

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

export class EffectPostgresNeonHttpSession<
	TRelations extends AnyRelations,
> extends PgEffectSession<EffectPostgresHttpQueryEffectHKT, EffectPostgresHttpQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'EffectPostgresNeonHttpSession';

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

	// No `pipeline`: Neon's multi-statement endpoint always wraps the set in a transaction (that is `batch`)

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
