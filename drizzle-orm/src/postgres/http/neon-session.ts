import type { ShapeSpec } from '#postgres';
import type { NeonHttpClient } from '#postgres/neon-http';
import type { BatchItem, SettledQueryResult } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import {
	mapBatchResults,
	mapSettledResults,
	PgAsyncSession,
	type PgAsyncTransaction,
} from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import {
	buildHttpMulti,
	httpQueryError,
	type PostgresHttpBatchOptions,
	PostgresHttpPreparedQuery,
	type PostgresHttpQueryResultHKT,
	type PostgresHttpRequestOptions,
	type PostgresHttpSessionOptions,
} from './session.ts';

export class PostgresNeonHttpSession<
	TRelations extends AnyRelations,
> extends PgAsyncSession<PostgresHttpQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresNeonHttpSession';

	private logger: Logger;

	constructor(
		private client: NeonHttpClient,
		dialect: PgDialect,
		_relations: TRelations,
		private options: PostgresHttpSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		_name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		shape?: ShapeSpec,
	) {
		const executor = async (params?: unknown[]) => {
			const q = mode === 'arrays'
				? this.client.query(
					query.sql,
					params ?? [],
					{ mode: 'array', shape },
				)
				: this.client.query(
					query.sql,
					params ?? [],
					{ mode: 'object', shape },
				);

			if (mode === 'raw') return q;
			return q.then((r) => r.rows);
		};

		return new PostgresHttpPreparedQuery<T>(
			executor,
			query,
			mapper,
			mode,
			this.logger,
			shape,
			this.options.paramsInErrors,
		);
	}

	/** Atomic: runs all queries in one transaction, in a single request */
	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		queries: T,
		options?: PostgresHttpBatchOptions,
	): Promise<any[]> {
		const { prepared, built } = buildHttpMulti(queries);
		return this.client.transaction(built, options).then((results) => mapBatchResults(prepared, results));
	}

	// No `pipeline`: Neon's multi-statement endpoint always wraps the set in a transaction (that is `batch`)

	/**
	 * Non-atomic: sends every query as its own concurrent request
	 *
	 * Never throws on a query failure: resolves with one `PromiseSettledResult` per query, in input order
	 */
	async parallel<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		queries: T,
		options?: PostgresHttpRequestOptions,
	): Promise<SettledQueryResult<any>[]> {
		const { prepared, built } = buildHttpMulti(queries);
		return this.client.parallel(built, options).then((results) =>
			mapSettledResults(
				prepared,
				results,
				(i, cause) => httpQueryError(prepared[i]!, cause, this.options.paramsInErrors),
			)
		);
	}

	override async transaction<T>(
		_transaction: (tx: PgAsyncTransaction<PostgresHttpQueryResultHKT, TRelations>) => Promise<T>,
		_config?: PgTransactionConfig,
	): Promise<T> {
		throw new Error(
			'No interactive transactions support in postgres HTTP drivers. Use `db.batch(...)` for an atomic set of statements, or a wire-protocol driver (`postgres`, `postgres/neon-ws`, `postgres/cf`, `postgres/deno`) for interactive transactions',
		);
	}
}
