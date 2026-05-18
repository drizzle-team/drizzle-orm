import type { Connection as CallbackConnection, TypeCast } from 'mysql2';
import type {
	Connection,
	FieldPacket,
	OkPacket,
	Pool,
	PoolConnection,
	ResultSetHeader,
	RowDataPacket,
} from 'mysql2/promise';
import { once } from 'node:events';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import {
	type AnyMySqlMapper,
	MySqlPreparedQuery,
	type MySqlPreparedQueryConfig,
	type MySqlQueryResultHKT,
	MySqlSession,
	MySqlTransaction,
	type MySqlTransactionConfig,
} from '~/mysql-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import type { Query } from '~/sql/sql.ts';
export type MySql2Client = Pool | Connection;

export type MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]];
export type MySqlQueryResultType = RowDataPacket[][] | RowDataPacket[] | OkPacket | OkPacket[] | ResultSetHeader;
export type MySqlQueryResult<
	T = any,
> = [T extends ResultSetHeader ? T : T[], FieldPacket[]];

export interface MySql2SessionOptions {
	logger?: Logger;
	cache?: Cache;
}

const typeCast: TypeCast = function(field, next) {
	if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
		return field.string();
	}
	return next();
};

export class MySql2Session<
	TRelations extends AnyRelations,
> extends MySqlSession<MySqlQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'MySql2Session';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: MySql2Client,
		dialect: MySqlDialect,
		private relations: TRelations,
		private options: MySql2SessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: AnyMySqlMapper,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): MySqlPreparedQuery<T> {
		const { client } = this;

		const executor = async (params: any[] = []) => {
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

		const iterator = async function*(params: any[] = []): AsyncGenerator<any> {
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

		return new MySqlPreparedQuery(
			executor,
			iterator,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
		);
	}

	override async transaction<T>(
		transaction: (tx: MySql2Transaction<TRelations>) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T> {
		const session = isPool(this.client)
			? new MySql2Session(
				await this.client.getConnection(),
				this.dialect,
				this.relations,
				this.options,
			)
			: this;
		const tx = new MySql2Transaction<TRelations>(
			this.dialect,
			session as MySqlSession<any, any>,
			this.relations,
			0,
		);
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
		try {
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

export class MySql2Transaction<
	TRelations extends AnyRelations,
> extends MySqlTransaction<
	MySql2QueryResultHKT,
	TRelations
> {
	static override readonly [entityKind]: string = 'MySql2Transaction';

	override async transaction<T>(
		transaction: (tx: MySql2Transaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new MySql2Transaction<TRelations>(
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
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

function isPool(client: MySql2Client): client is Pool {
	return 'getConnection' in client;
}

export interface MySql2QueryResultHKT extends MySqlQueryResultHKT {
	type: MySqlRawQueryResult;
}
