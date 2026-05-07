/// <reference types="bun-types" />

import type { SavepointSQL, SQL as BunSQL, TransactionSQL } from 'bun';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import {
	MySqlPreparedQuery,
	type MySqlPreparedQueryConfig,
	type MySqlQueryResultHKT,
	MySqlSession,
	MySqlTransaction,
	type MySqlTransactionConfig,
} from '~/mysql-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
export interface BunMySqlSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class BunMySqlSession<
	TSQL extends BunSQL,
	TRelations extends AnyRelations,
> extends MySqlSession<MySqlQueryResultHKT, TRelations> {
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
	): MySqlPreparedQuery<T> {
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

		return new MySqlPreparedQuery(
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

		if (config?.isolationLevel) throw new Error("Driver doesn't support setting isolation level on transaction");

		return this.client.begin(startTransactionSql, async (client) => {
			const session = new BunMySqlSession<TransactionSQL, TRelations>(
				client,
				this.dialect,
				this.relations,
				this.options,
			);
			const tx = new BunMySqlTransaction<TRelations>(
				this.dialect,
				session as MySqlSession<any, any>,
				this.relations,
				0,
			);
			// if (config) {
			// 	const setTransactionConfigSql = this.getSetTransactionSQL(config);
			// 	if (setTransactionConfigSql) {
			// 		await tx.execute(setTransactionConfigSql);
			// 	}
			// }
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class BunMySqlTransaction<
	TRelations extends AnyRelations,
> extends MySqlTransaction<
	BunMySqlQueryResultHKT,
	TRelations
> {
	static override readonly [entityKind]: string = 'BunMySqlTransaction';

	override async transaction<T>(
		transaction: (tx: BunMySqlTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		return (<BunMySqlSession<TransactionSQL, any>> this.session).client.savepoint((client) => {
			const session = new BunMySqlSession<SavepointSQL, TRelations>(
				client,
				this.dialect,
				this.relations,
				(<BunMySqlSession<any, any>> this.session).options,
			);
			const tx = new BunMySqlTransaction<TRelations>(
				this.dialect,
				session as MySqlSession<any, any>,
				this.relations,
				this.nestedIndex + 1,
			);
			return transaction(tx);
		}) as Promise<T>;
	}
}

export interface BunMySqlQueryResultHKT extends MySqlQueryResultHKT {
	type: Record<string, unknown>[] & Record<string, unknown>;
}
