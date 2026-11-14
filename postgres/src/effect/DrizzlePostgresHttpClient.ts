// Drizzle Postgres over HTTP as an Effect service: the httpostgres gateway (@drizzle-team/postgres/http) and Neon's
// SQL-over-HTTP endpoint (@drizzle-team/postgres/neon-http). HTTP holds no session, so there are no interactive
// transactions, and this is no SqlClient: `batch` runs statements as one transaction in one request, and `pipeline`
// runs them without one. For transactions you write as code, use the TCP, Neon WebSocket or Aurora clients.
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Result from 'effect/Result';
import type { SqlError } from 'effect/sql/SqlError';
import type { HttpBatchQuery, HttpClient, HttpQueryOptions } from '../http.ts';
import type { NeonHttpClient } from '../neon-http.ts';
import type { BatchOptions, QueryResult } from '../types.ts';
import { toSqlError } from './DrizzlePostgresClient.ts';

export const TypeId = '~@drizzle/postgres/DrizzlePostgresHttpClient';
export type TypeId = typeof TypeId;

/** Drizzle Postgres over HTTP. Every statement is a request; `batch` and `pipeline` send theirs in one request
 *  (Neon runs a pipeline as one request per statement). Interrupting an Effect aborts its request. */
export interface DrizzlePostgresHttpClient {
	readonly [TypeId]: TypeId;
	readonly kind: 'gateway' | 'neon';
	/** The client that sends the requests. */
	readonly client: HttpClient | NeonHttpClient;
	/** Runs one statement, which commits on its own. The result type follows `mode`. */
	readonly query: HttpQuery;
	/** Runs the statements as one transaction, all or nothing, and gives their results in order. A failure fails the
	 *  whole batch, with the first error. */
	readonly batch: (
		queries: ReadonlyArray<HttpStatement>,
		options?: BatchOptions,
	) => Effect.Effect<Array<QueryResult>, SqlError>;
	/** Runs the statements without a transaction, so each commits on its own, and gives each one's outcome in order:
	 *  its result, or its error. Fails only when the request as a whole does. */
	readonly pipeline: (
		queries: ReadonlyArray<HttpStatement>,
	) => Effect.Effect<Array<Result.Result<QueryResult, SqlError>>, SqlError>;
}

/** One statement of `batch` or `pipeline`. `types` declares parameter types for the gateway; Neon infers them. */
export type HttpStatement = HttpBatchQuery;

/** The query options without the ones that Effect replaces: interrupt the Effect to cancel it. */
export type HttpStatementOptions = Omit<HttpQueryOptions, 'signal' | 'timeout'>;

export interface HttpQuery {
	(
		sql: string,
		params: unknown[],
		options:
			| (HttpStatementOptions & { mode: 'object' })
			| (HttpStatementOptions & { mode?: 'object'; shape: NonNullable<HttpStatementOptions['shape']> }),
	): Effect.Effect<QueryResult<Record<string, unknown>>, SqlError>;
	(
		sql: string,
		params?: unknown[],
		options?: HttpStatementOptions & { mode?: 'array' },
	): Effect.Effect<QueryResult<unknown[]>, SqlError>;
}

export const DrizzlePostgresHttpClient = Context.Service<DrizzlePostgresHttpClient>(
	'@drizzle/postgres/DrizzlePostgresHttpClient',
);

export interface FromClientOptions {
	readonly spanAttributes?: Record<string, unknown> | undefined;
}

// What the two clients share, under one name: the gateway's batch and pipeline are Neon's transaction and parallel.
interface Backend {
	query(sql: string, params: unknown[], options: HttpQueryOptions): Promise<QueryResult>;
	batch(queries: HttpStatement[], options: BatchOptions & { signal: AbortSignal }): Promise<QueryResult[]>;
	pipeline(queries: HttpStatement[], options: { signal: AbortSignal }): Promise<PromiseSettledResult<QueryResult>[]>;
}

const backendOf = (kind: 'gateway' | 'neon', client: HttpClient | NeonHttpClient): Backend => {
	const query = client.query.bind(client) as Backend['query'];
	if (kind === 'gateway') {
		const gateway = client as HttpClient;
		return { query, batch: gateway.batch.bind(gateway), pipeline: gateway.pipeline.bind(gateway) };
	}
	const neon = client as NeonHttpClient;
	return {
		query,
		batch: neon.transaction.bind(neon),
		pipeline: neon.parallel.bind(neon) as Backend['pipeline'],
	};
};

// No connection to lose: an error that is no PgError (a failed request, a rejected statement) is an UnknownError.
const READY = { state: 'ready' };

/** Creates the service over a client. `kind` says which one it is. */
export const fromClient = (
	kind: 'gateway' | 'neon',
	client: HttpClient | NeonHttpClient,
	options: FromClientOptions & { readonly host?: string | undefined } = {},
): DrizzlePostgresHttpClient => {
	const backend = backendOf(kind, client);
	const driver = kind === 'gateway' ? 'drizzle-postgres-http' : 'drizzle-postgres-neon-http';
	const attributes = {
		...options.spanAttributes,
		'db.system.name': 'postgresql',
		'server.address': options.host,
		driver,
	};
	const traced = <A>(operation: string, text: string, f: (signal: AbortSignal) => Promise<A>) =>
		Effect.withSpan(
			Effect.tryPromise({ try: f, catch: (e) => toSqlError(e, operation, READY) }),
			`sql.${operation}`,
			{ kind: 'client', attributes: { ...attributes, 'db.operation.name': operation, 'db.query.text': text } },
		);
	const texts = (queries: ReadonlyArray<HttpStatement>) => queries.map((q) => q.sql).join(';\n');

	// oxlint-disable-next-line typescript/no-useless-default-assignment -- JavaScript callers can omit both
	const query =
		((sql: string, params: unknown[] = [], options: HttpStatementOptions = {}) =>
			traced('query', sql, (signal) => backend.query(sql, params, { ...options, signal }))) as HttpQuery;
	const batch = (queries: ReadonlyArray<HttpStatement>, options: BatchOptions = {}) =>
		traced('batch', texts(queries), (signal) => backend.batch([...queries], { ...options, signal }));
	const pipeline = (queries: ReadonlyArray<HttpStatement>) =>
		Effect.map(
			traced('pipeline', texts(queries), (signal) => backend.pipeline([...queries], { signal })),
			(outcomes) =>
				outcomes.map((o) =>
					o.status === 'fulfilled' ? Result.succeed(o.value) : Result.fail(toSqlError(o.reason, 'pipeline', READY))
				),
		);

	return { [TypeId]: TypeId, kind, client, query, batch, pipeline };
};

/** A layer over a client that the caller created. */
export const layerFromClient = (
	kind: 'gateway' | 'neon',
	client: HttpClient | NeonHttpClient,
	options?: FromClientOptions,
) => Layer.succeed(DrizzlePostgresHttpClient, fromClient(kind, client, options));
