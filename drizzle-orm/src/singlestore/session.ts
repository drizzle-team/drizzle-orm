import type { Connection as CallbackConnection } from 'mysql2';
import type {
	Connection,
	FieldPacket,
	OkPacket,
	Pool,
	PoolConnection,
	ResultSetHeader,
	RowDataPacket,
	TypeCast,
} from 'mysql2/promise';
import { once } from 'node:events';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
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

export type SingleStoreDriverClient = Pool | Connection;

export type SingleStoreRawQueryResult = [ResultSetHeader, FieldPacket[]];
export type SingleStoreQueryResultType = RowDataPacket[][] | RowDataPacket[] | OkPacket | OkPacket[] | ResultSetHeader;
export type SingleStoreQueryResult<
	T = any,
> = [T extends ResultSetHeader ? T : T[], FieldPacket[]];

export interface SingleStoreDriverSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

const typeCast: TypeCast = function(field, next) {
	if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
		return field.string();
	}
	return next();
};

export class SingleStoreDriverSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SingleStoreSession<
	SingleStoreQueryResultHKT,
	SingleStoreDriverPreparedQueryHKT,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'SingleStoreDriverSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: SingleStoreDriverClient,
		dialect: SingleStoreDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: SingleStoreDriverSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends SingleStorePreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: AnySingleStoreMapper,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PreparedQueryKind<SingleStoreDriverPreparedQueryHKT, T> {
		const { client } = this;

		const executor = async (params: unknown[] = []) => {
			const raw = client.query<any[]>({
				sql: query.sql,
				typeCast,
				rowsAsArray: mode === 'arrays',
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
				typeCast,
				rowsAsArray: mode === 'arrays',
			}, params);
			const stream = driverQuery.stream();

			function dataListener() {
				stream.pause();
			}

			stream.on('data', dataListener);

			try {
				const onEnd = once(stream, 'end');
				const onError = once(stream, 'error');

				while (true) {
					stream.resume();

					const row = await Promise.race([onEnd, onError, new Promise((resolve) => stream.once('data', resolve))]);
					if (row === undefined || (Array.isArray(row) && row.length === 0)) {
						break;
					}
					if (row instanceof Error) { // oxlint-disable-line drizzle-internal/no-instanceof
						throw row;
					}
					yield row;
				}
			} finally {
				stream.off('data', dataListener);
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
		) as PreparedQueryKind<SingleStoreDriverPreparedQueryHKT, T>;
	}

	override async transaction<T>(
		transaction: (tx: SingleStoreDriverTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: SingleStoreTransactionConfig,
	): Promise<T> {
		const session = isPool(this.client)
			? new SingleStoreDriverSession(
				await this.client.getConnection(),
				this.dialect,
				this.relations,
				this.schema,
				this.options,
			)
			: this;
		const tx = new SingleStoreDriverTransaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			session as SingleStoreSession<any, any, any, any, any>,
			this.relations,
			this.schema,
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
			await tx.execute(sql`rollback`);
			throw err;
		} finally {
			if (isPool(this.client)) {
				(session.client as PoolConnection).release();
			}
		}
	}
}

export class SingleStoreDriverTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SingleStoreTransaction<
	SingleStoreDriverQueryResultHKT,
	SingleStoreDriverPreparedQueryHKT,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'SingleStoreDriverTransaction';

	override async transaction<T>(
		transaction: (tx: SingleStoreDriverTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new SingleStoreDriverTransaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			this.session,
			this.relations,
			this.schema,
			this.nestedIndex + 1,
		);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

function isPool(client: SingleStoreDriverClient): client is Pool {
	return 'getConnection' in client;
}

export interface SingleStoreDriverQueryResultHKT extends SingleStoreQueryResultHKT {
	type: SingleStoreRawQueryResult;
}

export interface SingleStoreDriverPreparedQueryHKT extends SingleStorePreparedQueryHKT {
	type: SingleStorePreparedQuery<Assume<this['config'], SingleStorePreparedQueryConfig>>;
}
