// Effect's SqlClient contract implemented over the minipg pool and connections. This part is the same
// for every entry point; core-client.ts and the runtime client modules add make, layer and layerConfig.
import * as Arr from 'effect/Array';
import * as Context from 'effect/Context';
import type * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Reactivity from 'effect/reactivity/Reactivity';
import type * as Redacted from 'effect/Redacted';
import type * as Scope from 'effect/Scope';
import * as Client from 'effect/sql/SqlClient';
import type { Connection as SqlConnection } from 'effect/sql/SqlConnection';
import {
	AuthenticationError,
	AuthorizationError,
	ConnectionError,
	ConstraintError,
	DeadlockError,
	LockTimeoutError,
	SerializationError,
	SqlError,
	SqlSyntaxError,
	StatementTimeoutError,
	UniqueViolation,
	UnknownError,
} from 'effect/sql/SqlError';
import type { Custom, Fragment } from 'effect/sql/Statement';
import * as Statement from 'effect/sql/Statement';
import * as Stream from 'effect/Stream';
import type { ConnectionOptions } from 'node:tls';
import type { Connection } from '../connection.ts';
import { Cursor, type CursorOptions } from '../cursor.ts';
import type { RawParams } from '../encode.ts';
import { PgError } from '../errors.ts';
import { metricAttributes } from '../plugin.ts';
import type { Pool } from '../pool.ts';
import type { ConnectConfig, QueryOptions as MinipgQueryOptions, QueryResult } from '../types.ts';

export const TypeId = '~@drizzle-team/minipg/MinipgClient';
export type TypeId = typeof TypeId;

/** A SqlClient that runs on minipg. Its layers provide it under both this service and SqlClient. */
export interface MinipgClient extends Client.SqlClient {
	readonly [TypeId]: TypeId;
	readonly config: MinipgClientConfig;
	/** The minipg pool that runs every statement. */
	readonly pool: Pool;
	/** Binds a value as jsonb, with the same signature as PgClient.json. */
	readonly json: (value: unknown) => Fragment;
	/** SqlClient.withTransaction with transaction settings. A nested call becomes a savepoint and
	 *  ignores the settings, because they apply to the whole transaction. */
	readonly withTransaction: <R, E, A>(
		self: Effect.Effect<A, E, R>,
		options?: TransactionOptions,
	) => Effect.Effect<A, E | SqlError, R>;
	/** Runs one minipg query with minipg's options. The result type follows `mode`, as in the async entry
	 *  point. Inside withTransaction it runs on the transaction's connection. */
	readonly query: MinipgQuery;
	/** Runs the Effects as a Batch: one transaction, every statement pipelined on its connection, all or nothing. */
	readonly batch: <A, E, R>(effects: Iterable<Effect.Effect<A, E, R>>) => Effect.Effect<Array<A>, E | SqlError, R>;
	/** Runs the Effects as a Pipeline: concurrently on one connection, without a transaction, so each
	 *  statement commits on its own. An interrupted statement that waits behind another one still runs
	 *  on the server. Inside withTransaction it uses the transaction's connection. */
	readonly pipeline: <A, E, R>(effects: Iterable<Effect.Effect<A, E, R>>) => Effect.Effect<Array<A>, E | SqlError, R>;
	/** Connection.bulkInsert as an Effect. Inside withTransaction or a Pipeline it uses that connection. */
	readonly bulkInsert: (...args: Parameters<Connection['bulkInsert']>) => Effect.Effect<QueryResult<never>, SqlError>;
	/** Connection.bulkUpdate as an Effect. Inside withTransaction or a Pipeline it uses that connection. */
	readonly bulkUpdate: (...args: Parameters<Connection['bulkUpdate']>) => Effect.Effect<QueryResult<never>, SqlError>;
	/** Connection.copyMany as an Effect. Inside withTransaction or a Pipeline it uses that connection. */
	readonly copyMany: (...args: Parameters<Connection['copyMany']>) => Effect.Effect<QueryResult<never>, SqlError>;
	/** COPY … FROM STDIN with the COPY payload read from a Stream. An interrupt or a failed source sends
	 *  CopyFail, so no rows from the COPY remain. */
	readonly copyFrom: <E, R>(
		sql: string,
		source: Stream.Stream<Uint8Array | string, E, R>,
	) => Effect.Effect<QueryResult<never>, SqlError | E, R>;
	/** COPY … TO STDOUT as a Stream of raw bytes. Closing the Stream early cancels the COPY on the server,
	 *  except inside a transaction, where the rest of the COPY is read and dropped. */
	readonly copyTo: (sql: string, options?: { readonly highWaterMark?: number }) => Stream.Stream<Uint8Array, SqlError>;
	/** A server-side cursor on a dedicated connection, as a Stream of row batches of up to `fetchSize` rows. */
	readonly cursor: <Row = Record<string, unknown>>(options: CursorOptions) => Stream.Stream<Row[], SqlError>;
}

/** minipg query options without the ones that Effect replaces: interrupt the Effect to cancel it. */
export type QueryOptions = Omit<MinipgQueryOptions, 'signal' | 'timeout' | 'trace'>;
type Params = unknown[] | RawParams;

export interface MinipgQuery {
	(sql: string, params: Params, options: QueryOptions & { mode: 'wire' }): Effect.Effect<Uint8Array[], SqlError>;
	(
		sql: string,
		params: Params,
		options: QueryOptions & { mode: 'buffer' },
	): Effect.Effect<QueryResult<(Buffer | null)[]>, SqlError>;
	(sql: string, params: Params, options: QueryOptions & { mode: 'raw' }): Effect.Effect<QueryResult<Buffer>, SqlError>;
	(
		sql: string,
		params: Params,
		options:
			| (QueryOptions & { mode: 'object' })
			| (QueryOptions & { mode?: 'object'; shape: NonNullable<QueryOptions['shape']> }),
	): Effect.Effect<QueryResult<Record<string, unknown>>, SqlError>;
	(
		sql: string,
		params?: Params,
		options?: QueryOptions & { mode?: 'array' },
	): Effect.Effect<QueryResult<unknown[]>, SqlError>;
}

export interface TransactionOptions {
	readonly isolation?: 'serializable' | 'repeatable read' | 'read committed' | 'read uncommitted' | undefined;
	readonly readOnly?: boolean | undefined;
	readonly deferrable?: boolean | undefined;
}

const ISOLATION_LEVELS = new Set(['serializable', 'repeatable read', 'read committed', 'read uncommitted']);

const setTransaction = (options: TransactionOptions) => {
	const parts: string[] = [];
	if (options.isolation !== undefined) {
		if (!ISOLATION_LEVELS.has(options.isolation)) {
			throw new Error(
				`MinipgClient: the isolation level "${options.isolation}" is unknown. Use serializable, repeatable read, read committed or read uncommitted.`,
			);
		}
		parts.push(`isolation level ${options.isolation}`);
	}
	if (options.readOnly !== undefined) parts.push(options.readOnly ? 'read only' : 'read write');
	if (options.deferrable !== undefined) parts.push(options.deferrable ? 'deferrable' : 'not deferrable');
	return parts.length ? 'set transaction ' + parts.join(' ') : undefined;
};

export const MinipgClient = Context.Service<MinipgClient>('@drizzle-team/minipg/MinipgClient');

/** Effect-style names and types, as in @effect/sql-pg, plus the minipg settings that have no Effect equivalent. */
export interface MinipgClientConfig {
	readonly url?: Redacted.Redacted | undefined;
	readonly host?: string | undefined;
	readonly port?: number | undefined;
	/** A unix-domain socket path, used instead of host and port. */
	readonly path?: string | undefined;
	/** `true` verifies the server certificate and host name, as in @effect/sql-pg. */
	readonly ssl?: boolean | ConnectionOptions | undefined;
	readonly database?: string | undefined;
	readonly username?: string | undefined;
	readonly password?: Redacted.Redacted | undefined;
	readonly connectTimeout?: Duration.Input | undefined;
	readonly idleTimeout?: Duration.Input | undefined;
	readonly maxConnections?: number | undefined;
	readonly applicationName?: string | undefined;
	readonly spanAttributes?: Record<string, unknown> | undefined;
	readonly transformResultNames?: ((str: string) => string) | undefined;
	readonly transformQueryNames?: ((str: string) => string) | undefined;
	readonly transformJson?: boolean | undefined;
	/** Adds minipg's per-query timings and sizes to each statement span, and turns on Effect's
	 *  SpanPropagationEnabled for the layer. Off by default, and then the driver collects no timings. */
	readonly metrics?: boolean | undefined;

	readonly decode?: ConnectConfig['decode'];
	readonly temporal?: ConnectConfig['temporal'];
	readonly prepare?: ConnectConfig['prepare'];
	readonly pooler?: ConnectConfig['pooler'];
	readonly pipeline?: ConnectConfig['pipeline'];
	readonly types?: ConnectConfig['types'];
}

/** The client settings that apply on top of an existing pool. */
export type FromPoolOptions = Pick<
	MinipgClientConfig,
	'spanAttributes' | 'transformResultNames' | 'transformQueryNames' | 'transformJson' | 'metrics'
>;

let clientIdCounter = 0;

/** Creates a client over the pool that `acquire` yields, as `PgClient.fromPool` does. `acquire` runs in
 *  the client's scope, so `Effect.acquireRelease` ties the pool's lifetime to it, and `Effect.succeed`
 *  passes a pool that the caller owns and keeps open. */
export const fromPool = Effect.fnUntraced(
	function*(options: FromPoolOptions & { readonly acquire: Effect.Effect<Pool, SqlError, Scope.Scope> }) {
		const { acquire: acquirePool, ...config } = options;
		const pool = yield* acquirePool;
		// Connect once, so a wrong config fails when the layer is built and not at the first statement.
		const target = yield* Effect.tryPromise({
			try: () =>
				pool.acquire().then((conn) => {
					pool.release(conn);
					return { host: conn.cfg.path ?? conn.cfg.host, port: conn.cfg.port, database: conn.cfg.database };
				}),
			catch: (e) => toSqlError(e, 'connect'),
		});
		const compiler = makeCompiler(config.transformQueryNames, config.transformJson);
		const transformRows = config.transformResultNames
			? Statement.defaultTransforms(config.transformResultNames, config.transformJson).array
			: undefined;

		const poolConnection = Effect.uninterruptibleMask((restore) => {
			let acquired: Connection | undefined;
			return restore(acquire(pool, (conn) => {
				acquired = conn;
			})).pipe(
				Effect.onInterrupt(() =>
					Effect.sync(() => {
						if (acquired) pool.release(acquired);
					})
				),
				Effect.tap((conn) => Effect.addFinalizer(() => Effect.sync(() => pool.release(conn)))),
			);
		});
		// Inside `pipeline`, every statement borrows the pipeline's connection instead of the pool.
		const pipelineConnection = Context.Service<Connection>(
			`@drizzle-team/minipg/MinipgClient/Pipeline/${clientIdCounter++}`,
		);
		const toSqlConnection = (conn: Connection) => new ConnectionImpl(conn, config.metrics === true);
		const acquirer = Effect.flatMap(
			Effect.serviceOption(pipelineConnection),
			(pinned) => Effect.map(Option.isSome(pinned) ? Effect.succeed(pinned.value) : poolConnection, toSqlConnection),
		);

		const spanAttributes = [
			...(config.spanAttributes ? Object.entries(config.spanAttributes) : []),
			['db.system.name', 'postgresql'],
			['db.namespace', target.database],
			['server.address', target.host],
			['server.port', target.port],
			['driver', 'minipg'],
		] satisfies ReadonlyArray<readonly [string, unknown]>;
		const client = yield* Client.make({
			acquirer,
			// A transaction always takes its own connection, so it never pulls the pipeline's statements into it.
			transactionAcquirer: Effect.map(poolConnection, toSqlConnection),
			compiler,
			prepareTransactionControls: true,
			commit,
			releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
			spanAttributes,
			transformRows,
		});

		const scopedConnection = Effect.flatMap(
			Effect.serviceOption(client.transactionService),
			(tx) =>
				Effect.map(
					Option.isSome(tx) ? Effect.succeed(tx.value[0]) : acquirer,
					(sqlConnection) => (sqlConnection as ConnectionImpl).conn,
				),
		);
		const withConnection = <A, E>(f: (conn: Connection) => Effect.Effect<A, E>) =>
			Effect.scoped(Effect.flatMap(scopedConnection, f));

		// A span per operation, named and attributed as Effect names the spans of sql statements.
		const spanName = Statement.spanName(spanAttributes);
		const spanOptions = (operation: string, text: string) => ({
			kind: 'client' as const,
			attributes: { ...Object.fromEntries(spanAttributes), 'db.operation.name': operation, 'db.query.text': text },
		});
		const traced = <A, E, R>(operation: string, text: string, effect: Effect.Effect<A, E, R>) =>
			Effect.withSpan(effect, spanName, spanOptions(operation, text));

		const metrics = config.metrics === true;
		// oxlint-disable-next-line typescript/no-useless-default-assignment -- JavaScript callers can omit both
		const query = ((sql: string, params: Params = [], options: QueryOptions = {}) =>
			traced(
				'query',
				sql,
				withConnection((conn) =>
					annotateMetrics(Effect.tryPromise({
						try: (signal) =>
							conn.query(sql, params, { metrics, ...options, signal } as never) as Promise<
								QueryResult<unknown> | Uint8Array[]
							>,
						catch: (e) => toSqlError(e, 'query', conn),
					}))
				),
			)) as MinipgQuery;

		const plainWithTransaction = client.withTransaction;
		const withTransaction = <R, E, A>(self: Effect.Effect<A, E, R>, options?: TransactionOptions) =>
			Effect.suspend(() => {
				const set = options && setTransaction(options);
				if (!set) {
					return plainWithTransaction(self);
				}
				return Effect.flatMap(Effect.serviceOption(client.transactionService), (outer) =>
					Option.isSome(outer)
						? plainWithTransaction(self)
						: plainWithTransaction(Effect.andThen(client.unsafe(set), self)));
			});

		const bulk = <O extends object>(
			operation: 'bulkInsert' | 'bulkUpdate' | 'copyMany',
			table: string,
			f: (conn: Connection, options: O & { signal: AbortSignal; metrics: boolean }) => Promise<QueryResult<never>>,
			options: O,
		) =>
			traced(
				operation,
				table,
				withConnection((conn) =>
					annotateMetrics(
						Effect.tryPromise({
							try: (signal) => f(conn, { metrics, ...options, signal }),
							catch: (e) => toSqlError(e, operation, conn),
						}),
					)
				),
			);
		const bulkInsert = (...[table, columns, rows, options]: Parameters<Connection['bulkInsert']>) =>
			bulk('bulkInsert', table, (conn, withSignal) => conn.bulkInsert(table, columns, rows, withSignal), options ?? {});
		const bulkUpdate = (...[table, columns, rows, options]: Parameters<Connection['bulkUpdate']>) =>
			bulk('bulkUpdate', table, (conn, withSignal) => conn.bulkUpdate(table, columns, rows, withSignal), options);
		const copyMany = (...[table, columns, rows, options]: Parameters<Connection['copyMany']>) =>
			bulk('copyMany', table, (conn, withSignal) => conn.copyMany(table, columns, rows, withSignal), options ?? {});

		const copyFrom = <E, R>(sql: string, source: Stream.Stream<Uint8Array | string, E, R>) =>
			traced(
				'copyFrom',
				sql,
				Effect.flatMap(Effect.context<R>(), (context) => {
					// minipg turns a failed source into CopyFail and reports the server's error, so the source's own
					// failure is kept here to fail with it instead.
					let sourceFailure: { error: unknown } | undefined;
					const inner = Stream.toAsyncIterableWith(Stream.mapError(source, (e) => new SourceFailure(e)), context);
					const payload = {
						[Symbol.asyncIterator]: () => {
							const it = inner[Symbol.asyncIterator]();
							return {
								next: () =>
									it.next().catch((e: unknown) => {
										sourceFailure = { error: e };
										throw e;
									}),
								return: () => it.return!(),
							};
						},
					};
					return withConnection((conn) =>
						annotateMetrics(Effect.tryPromise({
							try: (signal) => conn.copyFrom(sql, payload, { signal, metrics }),
							catch: (e) => sourceFailure ? sourceFailure.error : toSqlError(e, 'copyFrom', conn),
						})).pipe(Effect.catch((e): Effect.Effect<never, SqlError | E> =>
							e instanceof SourceFailure
								? Effect.fail(e.error as E)
								: e instanceof SqlError
								? Effect.fail(e)
								: Effect.die(e)
						))
					);
				}),
			);

		const copyTo = (sql: string, options: { readonly highWaterMark?: number } = {}) =>
			Stream.unwrap(Effect.map(scopedConnection, (conn) =>
				Stream.fromAsyncIterable({
					[Symbol.asyncIterator]: () => conn.copyTo(sql, options),
				}, (e) => toSqlError(e, 'copyTo', conn)))).pipe(Stream.withSpan(spanName, spanOptions('copyTo', sql)));

		const cursor = <Row = Record<string, unknown>>(options: CursorOptions) =>
			Stream.unwrap(Effect.map(poolConnection, (conn) => {
				const serverCursor = new Cursor<Row>(() => Promise.resolve({ conn, release: () => {} }), options);
				const batches = {
					[Symbol.asyncIterator]: () => ({
						next: async () => {
							const rows = await serverCursor.next();
							return rows === null ? { done: true, value: undefined } : { done: false, value: rows };
						},
						return: async () => {
							await serverCursor.close();
							return { done: true, value: undefined };
						},
					}),
				};
				return Stream.fromAsyncIterable(batches, (e) => toSqlError(e, 'cursor', conn));
			})).pipe(Stream.withSpan(spanName, spanOptions('cursor', options.sql)));

		const all = <A, E, R>(effects: Iterable<Effect.Effect<A, E, R>>) =>
			Effect.all(effects, { concurrency: 'unbounded' });
		const batch = <A, E, R>(effects: Iterable<Effect.Effect<A, E, R>>) => withTransaction(all(effects));
		const pipeline = <A, E, R>(effects: Iterable<Effect.Effect<A, E, R>>) =>
			Effect.flatMap(Effect.serviceOption(client.transactionService), (tx) =>
				Option.isSome(tx)
					? all(effects)
					: Effect.scoped(
						Effect.flatMap(poolConnection, (conn) => Effect.provideService(all(effects), pipelineConnection, conn)),
					));

		return Object.assign(client, {
			[TypeId]: TypeId,
			config,
			pool,
			json: (value: unknown) => Statement.fragment([MinipgJson(value)]),
			withTransaction,
			query,
			batch,
			pipeline,
			bulkInsert,
			bulkUpdate,
			copyMany,
			copyFrom,
			copyTo,
			cursor,
		}) as MinipgClient;
	},
);

// Waits for a pool connection. If the fiber is interrupted while it waits, the connection that
// arrives later goes straight back to the pool.
const acquire = (pool: Pool, onAcquired: (conn: Connection) => void) =>
	Effect.callback<Connection, SqlError>((resume, signal) => {
		pool.acquire().then(
			(conn) => {
				if (signal.aborted) return pool.release(conn);
				onAcquired(conn);
				resume(Effect.succeed(conn));
			},
			(e: unknown) => {
				if (!signal.aborted) resume(Effect.fail(toSqlError(e, 'acquire')));
			},
		);
	});

class ConnectionImpl implements SqlConnection {
	constructor(readonly conn: Connection, readonly metrics = false) {}

	private query<Row>(
		operation: string,
		f: (options: { signal: AbortSignal; metrics: boolean }) => Promise<QueryResult<Row>>,
	) {
		const result = Effect.tryPromise({
			try: (signal) => f({ signal, metrics: this.metrics }),
			catch: (e) => toSqlError(e, operation, this.conn),
		});
		return this.metrics ? annotateMetrics(result) : result;
	}

	private rows<Row>(f: (options: { signal: AbortSignal; metrics: boolean }) => Promise<QueryResult<Row>>) {
		return Effect.map(this.query('execute', f), (r) => r.rows);
	}

	execute(
		sql: string,
		params: ReadonlyArray<unknown>,
		transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
	) {
		const rows = this.rows((options) => this.conn.query(sql, params, { ...options, mode: 'object' }));
		return transformRows ? Effect.map(rows, transformRows) : rows;
	}
	executeUnprepared(
		sql: string,
		params: ReadonlyArray<unknown>,
		transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
	) {
		return this.execute(sql, params, transformRows);
	}
	executeValues(sql: string, params: ReadonlyArray<unknown>) {
		return this.rows((options) => this.conn.query(sql, params, { ...options, mode: 'array' }));
	}
	executeValuesUnprepared(sql: string, params: ReadonlyArray<unknown>) {
		return this.executeValues(sql, params);
	}
	executeRaw(sql: string, params: ReadonlyArray<unknown>) {
		return this.query('executeRaw', (options) => this.conn.query(sql, params, { ...options, mode: 'object' }));
	}
	executeStream(
		sql: string,
		params: ReadonlyArray<unknown>,
		transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
	) {
		const rows = Stream.fromAsyncIterable(
			{ [Symbol.asyncIterator]: () => this.conn.stream<Record<string, unknown>>(sql, params, { mode: 'object' }) },
			(e) => toSqlError(e, 'executeStream', this.conn),
		);
		// transformRows keeps every row, so the fallback to `chunk` only satisfies the non-empty type.
		return transformRows
			? Stream.mapArray(rows, (chunk) => {
				const renamed = transformRows(chunk);
				return Arr.isReadonlyArrayNonEmpty(renamed) ? renamed : chunk;
			})
			: rows;
	}
}

const annotateMetrics = <A extends QueryResult<unknown> | Uint8Array[], E>(effect: Effect.Effect<A, E>) =>
	Effect.tap(
		effect,
		(result) =>
			'metrics' in result && result.metrics
				? Effect.annotateCurrentSpan(metricAttributes(result.metrics))
				: Effect.void,
	);

class SourceFailure {
	constructor(readonly error: unknown) {}
}

/** Postgres answers COMMIT with the ROLLBACK tag when the transaction was already aborted. */
const commit = (conn: SqlConnection) =>
	Effect.flatMap(conn.executeRaw('COMMIT', []), (result) =>
		(result as QueryResult<never>).command === 'ROLLBACK'
			? Effect.fail(
				new SqlError({
					reason: new UnknownError({
						cause: new Error('COMMIT rolled back an aborted transaction'),
						message:
							'MinipgClient: COMMIT rolled back the transaction, because a statement in it failed earlier. Find that statement, fix it, and run the transaction again.',
						operation: 'commit',
					}),
				}),
			)
			: Effect.void);

/** Maps a minipg failure to a SqlError. A failure that leaves the connection closed is a ConnectionError. */
export const toSqlError = (cause: unknown, operation: string, conn?: Connection) => {
	const isConnectionLost = conn !== undefined && conn.state !== 'ready';
	const message = cause instanceof Error ? cause.message : String(cause);
	if (cause instanceof PgError && !isConnectionLost) {
		if (cause.code === '42601' && /multiple commands/.test(message)) {
			return new SqlError({
				reason: new SqlSyntaxError({
					cause,
					message:
						'SQL with several statements is not supported: minipg sends each query as one statement. Run the statements one by one.',
					operation,
				}),
			});
		}
		return new SqlError({ reason: classifySqlState(cause.code, cause.constraint, { cause, message, operation }) });
	}
	const props = { cause, message, operation };
	if (isConnectionLost || conn === undefined) return new SqlError({ reason: new ConnectionError(props) });
	return new SqlError({ reason: new UnknownError(props) });
};

// The same SQLSTATE table as @effect/sql-pg.
const classifySqlState = (
	code: string | undefined,
	constraint: unknown,
	props: { cause: unknown; message: string; operation: string },
) => {
	if (code !== undefined) {
		if (code.startsWith('08')) return new ConnectionError(props);
		if (code.startsWith('28')) return new AuthenticationError(props);
		if (code === '42501') return new AuthorizationError(props);
		if (code.startsWith('42')) return new SqlSyntaxError(props);
		if (code === '23505') {
			const name = typeof constraint === 'string' && constraint.trim() !== '' ? constraint.trim() : 'unknown';
			return new UniqueViolation({ ...props, constraint: name });
		}
		if (code.startsWith('23')) return new ConstraintError(props);
		if (code === '40P01') return new DeadlockError(props);
		if (code === '40001') return new SerializationError(props);
		if (code === '55P03') return new LockTimeoutError(props);
		if (code === '57014') return new StatementTimeoutError(props);
	}
	return new UnknownError(props);
};

export const layerFrom = <E, R>(
	build: Effect.Effect<MinipgClient, E, R>,
) =>
	Layer.effectContext(
		Effect.map(build, (client) => {
			const context = Context.make(MinipgClient, client).pipe(Context.add(Client.SqlClient, client));
			// The driver can reach the statement span only when Effect propagates it.
			return client.config.metrics ? Context.add(context, Statement.SpanPropagationEnabled, true) : context;
		}),
	).pipe(Layer.provide(Reactivity.layer));

/** A layer over a pool that the caller owns. Closing the layer's scope leaves the pool open. */
export const layerFromPool = (pool: Pool, options?: FromPoolOptions) =>
	layerFrom(fromPool({ ...options, acquire: Effect.succeed(pool) }));

/** The Postgres statement compiler: $n placeholders, double-quoted identifiers, and json fragments as jsonb. */
export const makeCompiler = (transform?: (_: string) => string, transformJson = true) => {
	const transformValue = transformJson && transform ? Statement.defaultTransforms(transform).value : undefined;
	return Statement.makeCompiler<MinipgJson>({
		dialect: 'pg',
		placeholder: (i) => `$${i}`,
		onIdentifier: transform
			? (value, withoutTransform) => escape(withoutTransform ? value : transform(value))
			: escape,
		onRecordUpdate(placeholders, valueAlias, valueColumns, values, returning) {
			return [
				`(values ${placeholders}) AS ${valueAlias}${valueColumns}${returning ? ` RETURNING ${returning[0]}` : ''}`,
				returning ? values.flat().concat(returning[1]) : values.flat(),
			];
		},
		onCustom(type, placeholder, withoutTransform) {
			const value = withoutTransform || transformValue === undefined ? type.paramA : transformValue(type.paramA);
			return [`${placeholder(undefined)}::jsonb`, [JSON.stringify(value)]];
		},
	});
};

const escape = Statement.defaultEscape('"');

interface MinipgJson extends Custom<'MinipgJson', unknown> {}
const MinipgJson = Statement.custom<MinipgJson>('MinipgJson');
