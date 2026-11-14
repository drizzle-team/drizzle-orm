import type { Connection as CallbackConnection, TypeCast } from 'mysql2';
import type { Connection, FieldPacket, Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { QueryMetadata, WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import type { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import {
	type AnySingleStoreMapper,
	type PreparedQueryKind,
	SingleStorePreparedQuery,
	type SingleStorePreparedQueryConfig,
	type SingleStorePreparedQueryHKT,
	type SingleStoreQueryResultHKT,
	SingleStoreSession,
	SingleStoreTransaction,
	type SingleStoreTransactionConfig,
} from '~/singlestore-core/session.ts';
import type { Query } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';

/**
 * `bigint` as a number in the safe integer range (as `mysql2` returns it by default, e.g. for `count(*)`), exact text
 * outside of it - `supportBigNumbers` and `bigNumberStrings` don't apply
 */
const safeIntegerOrText = (value: string | null) => {
	if (value === null) return null;
	const number = Number(value);
	return Number.isSafeInteger(number) ? number : value;
};

const parseJsonField = (value: string | null) => value === null ? null : JSON.parse(value);

/** Field types returned as text for codecs to decode: their default decoding depends on client options and loses data */
const rawTextFieldTypes: ReadonlySet<string> = new Set([
	'DECIMAL',
	'NEWDECIMAL',
	'DATE',
	'DATETIME',
	'DATETIME2',
	'TIMESTAMP',
	'TIMESTAMP2',
]);

type TypeCastFunction = Exclude<TypeCast, boolean>;

/** Client's own `typeCast`, which a per-query `typeCast` replaces */
const clientTypeCast = (client: unknown): TypeCastFunction | undefined => {
	const c = client as {
		pool?: { config?: { connectionConfig?: { typeCast?: unknown } } };
		connection?: { config?: { typeCast?: unknown } };
	};
	const typeCast = c.pool?.config?.connectionConfig?.typeCast ?? c.connection?.config?.typeCast;
	return typeof typeCast === 'function' ? typeCast as TypeCastFunction : undefined;
};

/**
 * Per-query `typeCast` returning `rawTextFieldTypes` as text and `JSON` parsed whatever `jsonStrings` is set to
 * (relational queries' nested results are `JSON` values), other fields decoded by the client's own `typeCast`.
 * Applied to queries decoded by codecs (queries with a mapper), proxy servers apply it to such queries as well
 * @param client - client whose own `typeCast` decodes the remaining fields; without it, the driver's default decoding does
 */
export const makeSingleStoreRawTextTypeCast = (client?: unknown): TypeCastFunction => {
	const own = client === undefined ? undefined : clientTypeCast(client);
	return (field, next) =>
		rawTextFieldTypes.has(field.type)
			? field.string()
			: field.type === 'LONGLONG'
			? safeIntegerOrText(field.string())
			: field.type === 'JSON'
			? parseJsonField(field.string('utf8'))
			: own
			? own(field, next)
			: next();
};

export type SingleStoreDriverClient = Pool | Connection;

export type SingleStoreRawQueryResult = [ResultSetHeader, undefined];
export type SingleStoreRawExecuteResult =
	| SingleStoreRawQueryResult
	| [RowDataPacket[], FieldPacket[]]
	| [(ResultSetHeader | RowDataPacket[])[], (FieldPacket[] | undefined)[]];

export interface SingleStoreDriverSessionOptions {
	logger?: Logger;
	cache?: Cache;
	paramsInErrors?: boolean;
}

export class SingleStoreDriverSession<
	TRelations extends AnyRelations,
> extends SingleStoreSession<
	SingleStoreDriverQueryResultHKT,
	SingleStoreDriverPreparedQueryHKT,
	TRelations
> {
	static override readonly [entityKind]: string = 'SingleStoreDriverSession';

	private logger: Logger;
	private cache: Cache;
	private rawTextTypeCast: TypeCastFunction;

	constructor(
		private client: SingleStoreDriverClient,
		dialect: SingleStoreDialect,
		private relations: TRelations,
		private options: SingleStoreDriverSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
		this.rawTextTypeCast = makeSingleStoreRawTextTypeCast(client);
	}

	prepareQuery<T extends SingleStorePreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: AnySingleStoreMapper,
		queryMetadata?: QueryMetadata,
		cacheConfig?: WithCacheConfig,
	): PreparedQueryKind<SingleStoreDriverPreparedQueryHKT, T> {
		const { client } = this;
		const rawTextTypeCast = mapper ? this.rawTextTypeCast : undefined;

		const executor = async (params: unknown[] = []) => {
			const raw = client.query<any[]>({
				sql: query.sql,
				rowsAsArray: mode === 'arrays',
				...(rawTextTypeCast ? { typeCast: rawTextTypeCast } : undefined),
			}, params);
			if (mode !== 'raw') return raw.then((data) => data[0]);
			if (!mapper) return raw;

			return raw.then(([res]: [any, FieldPacket[]]) => ({
				insertId: res.insertId,
				affectedRows: res.affectedRows,
			}));
		};

		const iterator = async function*(params: unknown[] = []): AsyncGenerator<any> {
			const conn = ((isPool(client) ? await client.getConnection() : client) as {} as {
				connection: CallbackConnection;
			}).connection;
			const driverQuery = conn.query({
				sql: query.sql,
				rowsAsArray: mode === 'arrays',
				...(rawTextTypeCast ? { typeCast: rawTextTypeCast } : undefined),
			}, params);
			const stream = driverQuery.stream();
			// mysql2 reports a connection lost mid-stream on the connection only, stream would never end
			const onConnectionError = (err: Error) => stream.destroy(err);
			conn.on('error', onConnectionError);

			try {
				for await (const row of stream.iterator({ destroyOnReturn: false })) {
					yield row;
				}
			} finally {
				conn.off('error', onConnectionError);
				if (!stream.readableEnded && !stream.destroyed) {
					stream.resume();
					await new Promise<void>((resolve) => {
						stream.on('end', resolve);
						stream.on('error', resolve);
						stream.on('close', resolve);
					});
				}

				if (isPool(client)) {
					conn.end();
				}
			}
		};

		return new SingleStorePreparedQuery(
			executor,
			iterator,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			this.options.paramsInErrors,
		) as PreparedQueryKind<SingleStoreDriverPreparedQueryHKT, T>;
	}

	override async transaction<T>(
		transaction: (tx: SingleStoreDriverTransaction<TRelations>) => Promise<T>,
		config?: SingleStoreTransactionConfig,
	): Promise<T> {
		const session = isPool(this.client)
			? new SingleStoreDriverSession(
				await this.client.getConnection(),
				this.dialect,
				this.relations,
				this.options,
			)
			: this;
		const tx = new SingleStoreDriverTransaction<TRelations>(
			this.dialect,
			session as SingleStoreSession<any, any, any>,
			this.relations,
			0,
		);
		try {
			if (config) {
				const setTransactionConfigSql = this.getSetTransactionSQL(config);
				if (setTransactionConfigSql) {
					await tx.execute(setTransactionConfigSql);
				}
				const startTransactionSql = this.getStartTransactionSQL(config);
				await (startTransactionSql ? tx.execute(startTransactionSql) : tx.execute(sql`begin`));
			} else {
				await tx.execute(sql`begin`);
			}
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (err) {
			await tx.execute(sql`rollback`).catch(() => {});
			throw err;
		} finally {
			if (isPool(this.client)) {
				(session.client as PoolConnection).release();
			}
		}
	}
}

export class SingleStoreDriverTransaction<
	TRelations extends AnyRelations,
> extends SingleStoreTransaction<
	SingleStoreDriverQueryResultHKT,
	SingleStoreDriverPreparedQueryHKT,
	TRelations
> {
	static override readonly [entityKind]: string = 'SingleStoreDriverTransaction';

	override async transaction<T>(
		transaction: (tx: SingleStoreDriverTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new SingleStoreDriverTransaction<TRelations>(
			this.dialect,
			this.session,
			this.relations,
			this.nestedIndex + 1,
		);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`)).catch(() => {});
			throw err;
		}
	}
}

function isPool(client: SingleStoreDriverClient): client is Pool {
	return 'getConnection' in client;
}

export interface SingleStoreDriverQueryResultHKT extends SingleStoreQueryResultHKT {
	type: [this['row']] extends [never] ? SingleStoreRawQueryResult
		: [this['row']] extends ['unknown'] ? SingleStoreRawExecuteResult
		: [this['row'][], FieldPacket[]];
}

export interface SingleStoreDriverPreparedQueryHKT extends SingleStorePreparedQueryHKT {
	type: SingleStorePreparedQuery<Assume<this['config'], SingleStorePreparedQueryConfig>>;
}
