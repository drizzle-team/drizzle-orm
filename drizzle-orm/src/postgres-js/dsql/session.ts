import type { Row, RowList, Sql, TransactionSql } from 'postgres';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import {
	DsqlAsyncSession,
	DsqlAsyncTransaction,
	type DsqlOccConfig,
	type DsqlTransactionConfig,
	surfaceDsqlOccCode,
} from '~/pg-core/async/dsql/session.ts';
import { PgAsyncPreparedQuery } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT } from '~/pg-core/session.ts';
import type { PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';

/**
 * Retries of a whole transaction on optimistic concurrency conflicts (`OC000`, `OC001`, `40001`)
 *
 * Delays grow exponentially from `baseDelayMs` up to `maxDelayMs`, each one extended by up to `jitterFactor` of itself.
 * The driver validates the values and fills the omitted ones with its defaults.
 */
export interface PostgresJsDsqlOccConfig extends DsqlOccConfig {
	/** Retries after the first attempt - `3` by default, `0` to `100`, `0` disables retries */
	maxRetries?: number | undefined;
	/** Delay before the first retry - `1` by default, greater than `0` */
	baseDelayMs?: number | undefined;
	/** Upper bound the growing delays are capped at - `100` by default, not less than `baseDelayMs` */
	maxDelayMs?: number | undefined;
	/** Share of a delay that is added to it at random - `0.25` by default, `0` to `1` */
	jitterFactor?: number | undefined;
}

export interface PostgresJsDsqlTransactionConfig extends DsqlTransactionConfig {
	/**
	 * Re-run the transaction when it fails on an optimistic concurrency conflict:
	 * - `true` - retry with the driver's defaults (see {@link PostgresJsDsqlOccConfig})
	 * - {@link PostgresJsDsqlOccConfig} - retry with these values, over the `retry` config of the client
	 * - `false` or `undefined` - don't retry
	 *
	 * Retrying needs a client created by `auroraDSQLPostgres()`
	 *
	 * The callback may be invoked several times, so it must be idempotent: no side effects outside the transaction that must not repeat.
	 */
	occ?: boolean | PostgresJsDsqlOccConfig | undefined;
}

export interface PostgresJsDsqlSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class PostgresJsDsqlSession<TSQL extends Sql, TRelations extends AnyRelations>
	extends DsqlAsyncSession<PostgresJsDsqlQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'PostgresJsDsqlSession';

	logger: Logger;
	private cache: Cache;

	constructor(
		public client: TSQL,
		dialect: PgDialect,
		private relations: TRelations,
		/** @internal */
		readonly options: PostgresJsDsqlSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	) {
		const executor = async (params?: unknown[]) => {
			if (mode === 'objects') {
				return this.client.unsafe(query.sql, params ?? [] as any[], {
					prepare: name !== false,
				}).then((rows) => Object.values(rows));
			}
			if (mode === 'raw') {
				return this.client.unsafe(query.sql, params ?? [] as any[], {
					prepare: name !== false,
				});
			}
			return this.client.unsafe(query.sql, params ?? [] as any[], {
				prepare: name !== false,
			}).values().then((rows) => Object.values(rows));
		};

		return new PgAsyncPreparedQuery<T>(
			executor,
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
		transaction: (tx: PostgresJsDsqlTransaction<TRelations>) => Promise<T>,
		config: PostgresJsDsqlTransactionConfig | undefined,
	): Promise<T> {
		type Begin = (
			cb: (client: TransactionSql) => Promise<T>,
			callOptions?: { retry: boolean | PostgresJsDsqlOccConfig },
		) => Promise<T>;

		let session: PostgresJsDsqlSession<TransactionSql, TRelations> | undefined;
		let tx: PostgresJsDsqlTransaction<TRelations> | undefined;

		return (this.client.begin as Begin)(
			async (client) => {
				if (session) {
					session.client = client;
				} else {
					session = new PostgresJsDsqlSession<TransactionSql, TRelations>(
						client,
						this.dialect,
						this.relations,
						this.options,
					);
					tx = new PostgresJsDsqlTransaction(this.dialect, session, this.relations);
				}

				return transaction(tx!).catch(surfaceDsqlOccCode);
			},
			{ retry: config?.occ ?? false },
		);
	}
}

export class PostgresJsDsqlTransaction<
	TRelations extends AnyRelations,
> extends DsqlAsyncTransaction<PostgresJsDsqlQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresJsDsqlTransaction';

	constructor(
		dialect: PgDialect,
		/** @internal */
		override readonly session: PostgresJsDsqlSession<TransactionSql, TRelations>,
		relations: TRelations,
	) {
		super(dialect, session, relations, false);
	}
}

export interface PostgresJsDsqlQueryResultHKT extends PgQueryResultHKT {
	type: RowList<Assume<this['row'], Row>[]>;
}
