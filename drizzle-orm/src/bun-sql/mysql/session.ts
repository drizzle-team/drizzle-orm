/// <reference types="bun-types" />

import type { SavepointSQL, SQL as BunSQL, TransactionSQL } from 'bun';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { MySqlAsyncPreparedQuery, MySqlAsyncSession, MySqlAsyncTransaction } from '~/mysql-core/async/session.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { MySqlPreparedQueryConfig, MySqlQueryResultHKT, MySqlTransactionConfig } from '~/mysql-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
export interface BunMySqlSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class BunMySqlSession<
	TSQL extends BunSQL,
	TRelations extends AnyRelations,
> extends MySqlAsyncSession<MySqlQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'BunMySqlSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		readonly client: TSQL,
		dialect: MySqlDialect,
		private relations: TRelations,
		readonly options: BunMySqlSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (response: Record<string, unknown>[] | unknown[][] | { insertId: number; affectedRows: number }) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): MySqlAsyncPreparedQuery<T> {
		const { client } = this;

		const executor = async (params: any[] = []) => {
			const raw = client.unsafe(query.sql, params);
			if (mode === 'arrays') return raw.values();
			if (mode === 'objects') return raw;
			if (!mapper) return raw;

			return raw.then(({ lastInsertRowid, affectedRows }) => ({
				insertId: lastInsertRowid,
				affectedRows: affectedRows,
			}));
		};

		return new MySqlAsyncPreparedQuery(
			executor,
			undefined,
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
		transaction: (tx: BunMySqlTransaction<TRelations>) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T> {
		const startTransactionSql = config
			? this.getStartTransactionSQL(config)?.inlineParams().toQuery(this.dialect).sql.slice(18) ?? ''
			: '';

		const setTransactionSql = config?.isolationLevel
			? this.getSetTransactionSQL(config)?.inlineParams().toQuery(this.dialect).sql
			: undefined;

		const reserved = await this.client.reserve();

		try {
			if (setTransactionSql) await reserved.unsafe(setTransactionSql);
			await reserved.unsafe(`start transaction ${startTransactionSql}`.trimEnd());

			const session = new BunMySqlSession<TransactionSQL, TRelations>(
				reserved as unknown as TransactionSQL,
				this.dialect,
				this.relations,
				this.options,
			);
			const tx = new BunMySqlTransaction<TRelations>(
				this.dialect,
				session as MySqlAsyncSession<any, any>,
				this.relations,
				0,
			);

			try {
				const result = await transaction(tx);
				await reserved.unsafe('commit');
				return result;
			} catch (e) {
				await reserved.unsafe('rollback').catch(() => {});
				throw e;
			}
		} finally {
			reserved.release();
		}
	}
}

export class BunMySqlTransaction<
	TRelations extends AnyRelations,
> extends MySqlAsyncTransaction<
	BunMySqlQueryResultHKT,
	TRelations
> {
	static override readonly [entityKind]: string = 'BunMySqlTransaction';

	override async transaction<T>(
		transaction: (tx: BunMySqlTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const { client, options } = <BunMySqlSession<TransactionSQL, any>> this.session;

		const session = new BunMySqlSession<SavepointSQL, TRelations>(
			client as unknown as SavepointSQL,
			this.dialect,
			this.relations,
			options,
		);
		const tx = new BunMySqlTransaction<TRelations>(
			this.dialect,
			session as MySqlAsyncSession<any, any>,
			this.relations,
			this.nestedIndex + 1,
		);

		const name = `sp${this.nestedIndex + 1}`;
		await client.unsafe(`savepoint ${name}`);

		try {
			const result = await transaction(tx);
			await client.unsafe(`release savepoint ${name}`);
			return result;
		} catch (e) {
			await client.unsafe(`rollback to savepoint ${name}`).catch(() => {});
			throw e;
		}
	}
}

export interface BunMySqlQueryResultHKT extends MySqlQueryResultHKT {
	type: Record<string, unknown>[] & Record<string, unknown>;
}
