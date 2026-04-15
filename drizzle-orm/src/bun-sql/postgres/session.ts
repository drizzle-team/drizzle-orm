/// <reference types="bun-types" />

import type { SavepointSQL, SQL, TransactionSQL } from 'bun';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';

export interface BunSQLSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class BunSQLSession<
	TSQL extends SQL,
	TRelations extends AnyRelations,
> extends PgAsyncSession<BunSQLQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'BunSQLSession';

	logger: Logger;
	private cache: Cache;

	constructor(
		readonly client: TSQL,
		dialect: PgDialect,
		private relations: TRelations,
		/** @internal */
		readonly options: BunSQLSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		_name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgAsyncPreparedQuery<T> {
		const executor = async (params?: unknown[]) => {
			if (mode === 'arrays') {
				return this.client.unsafe(query.sql, params).values();
			}
			if (mode === 'objects') {
				return this.client.unsafe(query.sql, params);
			}

			return this.client.unsafe(query.sql, params);
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

	override transaction<T>(
		transaction: (tx: BunSQLTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.client.begin(async (client) => {
			const session = new BunSQLSession<TransactionSQL, TRelations>(
				client,
				this.dialect,
				this.relations,
				this.options,
			);
			const tx = new BunSQLTransaction(this.dialect, session, this.relations);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class BunSQLTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<BunSQLQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'BunSQLTransaction';

	constructor(
		dialect: PgDialect,
		/** @internal */
		override readonly session: BunSQLSession<
			TransactionSQL | SavepointSQL,
			TRelations
		>,
		relations: TRelations,
		nestedIndex = 0,
	) {
		super(dialect, session, relations, nestedIndex, false);
	}

	override transaction = <T>(
		transaction: (tx: BunSQLTransaction<TRelations>) => Promise<T>,
	): Promise<T> => {
		return (this.session.client as TransactionSQL).savepoint((client) => {
			const session = new BunSQLSession<SavepointSQL, TRelations>(
				client,
				this.dialect,
				this._.relations,
				this.session.options,
			);
			const tx = new BunSQLTransaction<TRelations>(
				this.dialect,
				session,
				this._.relations,
			);
			return transaction(tx);
		}) as Promise<T>;
	};
}

export interface BunSQLQueryResultHKT extends PgQueryResultHKT {
	type: this['row'][];
}
