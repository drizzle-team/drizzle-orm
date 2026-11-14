// Effect's SqlClient over the Aurora Data API (@drizzle-team/postgres/aurora). The Data API holds no connections:
// each statement is one HTTPS request, and a transaction is a transactionId that its statements carry. So a
// "connection" here is a client, and withTransaction's BEGIN, COMMIT and ROLLBACK become the Data API's
// BeginTransaction, CommitTransaction and RollbackTransaction calls; savepoints run as SQL inside the transaction.
import * as Config from 'effect/Config';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Reactivity from 'effect/reactivity/Reactivity';
import * as Redacted from 'effect/Redacted';
import * as Client from 'effect/sql/SqlClient';
import type { Connection as SqlConnection } from 'effect/sql/SqlConnection';
import type { SqlError } from 'effect/sql/SqlError';
import * as Statement from 'effect/sql/Statement';
import * as Stream from 'effect/Stream';
import { AuroraClient, type AuroraConfig, type AuroraQueryOptions as PlainAuroraQueryOptions } from '../aurora.ts';
import { addBrand } from '../brand.ts';
import type { QueryResult } from '../types.ts';
import { makeCompiler, toSqlError } from './DrizzlePostgresClient.ts';
import { setTransaction, type TransactionOptions } from './shared.ts';

export type { TransactionOptions };

export const TypeId = '~@drizzle/postgres/DrizzleAuroraClient';
export type TypeId = typeof TypeId;

/** A SqlClient over the Aurora Data API. Its layers provide it under both this service and SqlClient. */
export interface DrizzleAuroraClient extends Client.SqlClient {
	readonly [TypeId]: TypeId;
	readonly config: DrizzleAuroraClientConfig;
	/** The Data API client that runs statements outside transactions. */
	readonly client: AuroraClient;
	/** SqlClient.withTransaction with transaction settings, in a Data API transaction. A nested call becomes a
	 *  savepoint and ignores the settings, because they apply to the whole transaction. */
	readonly withTransaction: <R, E, A>(
		self: Effect.Effect<A, E, R>,
		options?: TransactionOptions,
	) => Effect.Effect<A, E | SqlError, R>;
	/** Runs one statement with the Aurora client's options. The result type follows `mode`. Inside withTransaction it
	 *  runs in the transaction. */
	readonly query: AuroraQuery;
	/** Runs the Effects in one transaction, one statement at a time (the Data API runs a transaction's statements in
	 *  turn), all or nothing. */
	readonly batch: <A, E, R>(effects: Iterable<Effect.Effect<A, E, R>>) => Effect.Effect<Array<A>, E | SqlError, R>;
	/** Runs the Effects concurrently, without a transaction, so each statement commits on its own. Every statement
	 *  runs to the end, and the first failure in statement order fails the result. Inside withTransaction they run in
	 *  the transaction, in turn. */
	readonly pipeline: <A, E, R>(effects: Iterable<Effect.Effect<A, E, R>>) => Effect.Effect<Array<A>, E | SqlError, R>;
	/** BatchExecuteStatement: one statement over many parameter sets, for insert, update and delete. Inside
	 *  withTransaction it runs in the transaction. */
	readonly batchExecute: (
		sql: string,
		paramSets: unknown[][],
	) => Effect.Effect<{ updateResults: Array<{ generatedFields: unknown[] }> }, SqlError>;
}

/** The Aurora client's query options without the ones that Effect replaces: interrupt the Effect to cancel it. */
export type AuroraQueryOptions = Omit<PlainAuroraQueryOptions, 'signal' | 'timeout'>;

export interface AuroraQuery {
	(
		sql: string,
		params: unknown[],
		options: AuroraQueryOptions & { mode: 'buffer' },
	): Effect.Effect<QueryResult<(Buffer | null)[]>, SqlError>;
	(sql: string, params: unknown[], options: AuroraQueryOptions & { mode: 'raw' }): Effect.Effect<
		QueryResult<Buffer>,
		SqlError
	>;
	(
		sql: string,
		params: unknown[],
		options:
			| (AuroraQueryOptions & { mode: 'object' })
			| (AuroraQueryOptions & { mode?: 'object'; shape: NonNullable<AuroraQueryOptions['shape']> }),
	): Effect.Effect<QueryResult<Record<string, unknown>>, SqlError>;
	(
		sql: string,
		params?: unknown[],
		options?: AuroraQueryOptions & { mode?: 'array' },
	): Effect.Effect<QueryResult<unknown[]>, SqlError>;
}

export const DrizzleAuroraClient = Context.Service<DrizzleAuroraClient>('@drizzle/postgres/DrizzleAuroraClient');

/** The Aurora client's settings, with the AWS secrets as Redacted, plus the SqlClient settings. */
export interface DrizzleAuroraClientConfig extends Omit<AuroraConfig, 'credentials'> {
	readonly credentials?: {
		readonly accessKeyId: string;
		readonly secretAccessKey: Redacted.Redacted;
		readonly sessionToken?: Redacted.Redacted | undefined;
	} | undefined;
	readonly spanAttributes?: Record<string, unknown> | undefined;
	readonly transformResultNames?: ((str: string) => string) | undefined;
	readonly transformQueryNames?: ((str: string) => string) | undefined;
	readonly transformJson?: boolean | undefined;
}

/** The client settings that apply on top of an existing AuroraClient. */
export type FromClientOptions = Pick<
	DrizzleAuroraClientConfig,
	'spanAttributes' | 'transformResultNames' | 'transformQueryNames' | 'transformJson'
>;

// BEGIN with its settings (`BEGIN ISOLATION LEVEL …`, from SqlClient's BeginTransaction), and ROLLBACK, as
// SqlClient sends them. ROLLBACK TO SAVEPOINT runs as SQL in the transaction.
const BEGIN_SQL = /^\s*(?:begin|start\s+transaction)(?:\s+(?:transaction|work)\b)?\s*(.*?)\s*;?\s*$/is;
const ROLLBACK_SQL = /^\s*(?:rollback|abort)(?:\s+(?:transaction|work))?\s*;?\s*$/i;

/** One SqlClient connection: the base client, or a transaction once BEGIN has run on it. */
class AuroraConnection implements SqlConnection {
	tx: AuroraClient | undefined;

	constructor(readonly base: AuroraClient) {}

	get current(): AuroraClient {
		return this.tx ?? this.base;
	}

	private run<A>(operation: string, f: (client: AuroraClient, signal: AbortSignal) => Promise<A>) {
		const client = this.current;
		return Effect.tryPromise({
			try: (signal) => f(client, signal),
			catch: (e) => toSqlError(e, operation, client),
		});
	}

	private begin(settings: string) {
		return this.run('begin', async (client) => {
			const tx = await client.openTransaction();
			this.tx = tx;
			if (settings) await tx.query(`set transaction ${settings}`);
			return [];
		});
	}

	/** CommitTransaction or RollbackTransaction. The transaction is over either way, so the connection is too. */
	end(operation: 'commit' | 'rollback') {
		return this.run(operation, async (tx) => {
			this.tx = undefined;
			await (operation === 'commit' ? tx.commitTransaction() : tx.rollbackTransaction());
		});
	}

	execute(
		sql: string,
		params: ReadonlyArray<unknown>,
		transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
	) {
		const rows = Effect.map(
			this.run('execute', (client, signal) => client.query(sql, [...params], { mode: 'object', signal })),
			(r) => r.rows,
		);
		return transformRows ? Effect.map(rows, transformRows) : rows;
	}
	executeUnprepared(
		sql: string,
		params: ReadonlyArray<unknown>,
		transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
	) {
		if (params.length === 0 && this.tx === undefined) {
			const begin = BEGIN_SQL.exec(sql);
			if (begin) return this.begin(begin[1]!);
		}
		if (params.length === 0 && this.tx !== undefined && ROLLBACK_SQL.test(sql)) {
			return Effect.as(this.end('rollback'), []);
		}
		return this.execute(sql, params, transformRows);
	}
	executeValues(sql: string, params: ReadonlyArray<unknown>) {
		return Effect.map(
			this.run('execute', (client, signal) => client.query(sql, [...params], { mode: 'array', signal })),
			(r) => r.rows,
		);
	}
	executeValuesUnprepared(sql: string, params: ReadonlyArray<unknown>) {
		return this.executeValues(sql, params);
	}
	executeRaw(sql: string, params: ReadonlyArray<unknown>) {
		return this.run('executeRaw', (client, signal) => client.query(sql, [...params], { mode: 'object', signal }));
	}
	/** The Data API returns a statement's rows in one response, so the Stream emits them from it. */
	executeStream(
		sql: string,
		params: ReadonlyArray<unknown>,
		transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
	) {
		return Stream.fromIterableEffect(this.execute(sql, params, transformRows));
	}
}
addBrand(AuroraConnection, 'AuroraConnection');

const spanHost = (client: AuroraClient) => {
	try {
		return new URL(client.endpoint).host;
	} catch {
		return undefined;
	}
};

/** Creates a client over an AuroraClient. */
export const fromClient = Effect.fnUntraced(
	function*(base: AuroraClient, options: FromClientOptions & Partial<DrizzleAuroraClientConfig> = {}) {
		const config = options as DrizzleAuroraClientConfig;
		const compiler = makeCompiler(config.transformQueryNames, config.transformJson);
		const transformRows = config.transformResultNames
			? Statement.defaultTransforms(config.transformResultNames, config.transformJson).array
			: undefined;
		const spanAttributes = [
			...(config.spanAttributes ? Object.entries(config.spanAttributes) : []),
			['db.system.name', 'postgresql'],
			['db.namespace', config.database],
			['server.address', spanHost(base)],
			['driver', 'drizzle-postgres-aurora'],
		] satisfies ReadonlyArray<readonly [string, unknown]>;

		// Statements outside transactions share one stateless connection; a transaction gets one of its own.
		const shared = new AuroraConnection(base);
		const client = yield* Client.make({
			acquirer: Effect.succeed(shared),
			transactionAcquirer: Effect.sync(() => new AuroraConnection(base)),
			compiler,
			commit: (conn) => (conn as AuroraConnection).end('commit'),
			isTransaction: (conn) => (conn as AuroraConnection).tx !== undefined,
			releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
			spanAttributes,
			transformRows,
			driver: 'drizzle-postgres-aurora',
		});

		const current = Effect.map(
			Effect.serviceOption(client.transactionService),
			(tx) => Option.isSome(tx) ? (tx.value[0] as AuroraConnection).current : base,
		);
		const spanName = Statement.spanName(spanAttributes);
		const traced = <A, E, R>(operation: string, text: string, effect: Effect.Effect<A, E, R>) =>
			Effect.withSpan(effect, spanName, {
				kind: 'client',
				attributes: { ...Object.fromEntries(spanAttributes), 'db.operation.name': operation, 'db.query.text': text },
			});
		const run = <A>(operation: string, text: string, f: (client: AuroraClient, signal: AbortSignal) => Promise<A>) =>
			traced(
				operation,
				text,
				Effect.flatMap(current, (aurora) =>
					Effect.tryPromise({
						try: (signal) => f(aurora, signal),
						catch: (e) => toSqlError(e, operation, aurora),
					})),
			);

		// oxlint-disable-next-line typescript/no-useless-default-assignment -- JavaScript callers can omit both
		const query = ((sql: string, params: unknown[] = [], options: AuroraQueryOptions = {}) =>
			run(
				'query',
				sql,
				(aurora, signal) => aurora.query(sql, params, { ...options, signal } as never),
			)) as AuroraQuery;

		const plainWithTransaction = client.withTransaction;
		const withTransaction = <R, E, A>(self: Effect.Effect<A, E, R>, options?: TransactionOptions) =>
			Effect.suspend(() => {
				const set = options && setTransaction(options);
				if (!set) return plainWithTransaction(self);
				return Effect.flatMap(Effect.serviceOption(client.transactionService), (outer) =>
					Option.isSome(outer)
						? plainWithTransaction(self)
						: plainWithTransaction(Effect.andThen(client.unsafe(set), self)));
			});

		const batch = <A, E, R>(effects: Iterable<Effect.Effect<A, E, R>>) => withTransaction(Effect.all(effects));
		const pipeline = <A, E, R>(effects: Iterable<Effect.Effect<A, E, R>>) =>
			Effect.flatMap(Effect.serviceOption(client.transactionService), (tx) =>
				Effect.flatMap(
					Effect.all(Array.from(effects, (effect) => Effect.exit(effect)), {
						concurrency: Option.isSome(tx) ? 1 : 'unbounded',
					}),
					(exits) => Effect.all(exits),
				));
		const batchExecute = (sql: string, paramSets: unknown[][]) =>
			run('batchExecute', sql, (aurora, signal) => aurora.batch(sql, paramSets, { signal }));

		return Object.assign(client, {
			[TypeId]: TypeId,
			config,
			client: base,
			withTransaction,
			query,
			batch,
			pipeline,
			batchExecute,
		}) as DrizzleAuroraClient;
	},
);

const toAuroraConfig = (config: DrizzleAuroraClientConfig): AuroraConfig => ({
	...config,
	credentials: config.credentials && {
		accessKeyId: config.credentials.accessKeyId,
		secretAccessKey: Redacted.value(config.credentials.secretAccessKey),
		sessionToken: config.credentials.sessionToken && Redacted.value(config.credentials.sessionToken),
	},
});

/** Creates a client with its own AuroraClient. The Data API holds no connections, so there is nothing to close. */
export const make = (config: DrizzleAuroraClientConfig) =>
	Effect.flatMap(
		Effect.try({ try: () => new AuroraClient(toAuroraConfig(config)), catch: (e) => toSqlError(e, 'connect') }),
		(base) => fromClient(base, config),
	);

const layerFrom = <E, R>(build: Effect.Effect<DrizzleAuroraClient, E, R>) =>
	Layer.effectContext(
		Effect.map(
			build,
			(client) => Context.make(DrizzleAuroraClient, client).pipe(Context.add(Client.SqlClient, client)),
		),
	).pipe(Layer.provide(Reactivity.layer));

/** A layer with its own AuroraClient. */
export const layer = (config: DrizzleAuroraClientConfig) => layerFrom(make(config));

/** Like `layer`, with the settings read from Effect Config. */
export const layerConfig = (config: Config.Wrap<DrizzleAuroraClientConfig>) =>
	layerFrom(Effect.flatMap(Config.unwrap(config), make));

/** A layer over an AuroraClient that the caller created. */
export const layerFromClient = (client: AuroraClient, options?: FromClientOptions) =>
	layerFrom(fromClient(client, options));
