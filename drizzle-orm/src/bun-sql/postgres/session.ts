/// <reference types="bun-types" />

import type { SavepointSQL, SQL, TransactionSQL } from 'bun';
import type * as V1 from '~/_relations.ts';
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

export class BunSQLPreparedQuery<T extends PreparedQueryConfig> extends PgAsyncPreparedQuery<T, SQL> {
	static override readonly [entityKind]: string = 'BunSQLPreparedQuery';

	/** @internal */
	override objects(params?: unknown[]): Promise<T['objects']> {
		return this.client.unsafe(this.query.sql, params);
	}

	/** @internal */
	override arrays(params?: unknown[]): Promise<T['arrays']> {
		return this.client.unsafe(this.query.sql, params).values();
	}
}

export interface BunSQLSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export class BunSQLSession<
	TSQL extends SQL,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<BunSQLQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'BunSQLSession';

	logger: Logger;
	private cache: Cache;

	constructor(
		readonly client: TSQL,
		dialect: PgDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		/** @internal */
		readonly options: BunSQLSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		arrayMode: boolean,
		name: string | undefined,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgAsyncPreparedQuery<T> {
		return new BunSQLPreparedQuery<T>(
			this.client,
			query,
			arrayMode,
			mapper,
			name,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
		);
	}

	override transaction<T>(
		transaction: (tx: BunSQLTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.client.begin(async (client) => {
			const session = new BunSQLSession<TransactionSQL, TFullSchema, TRelations, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				this.options,
			);
			const tx = new BunSQLTransaction(this.dialect, session, this.relations, this.schema);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class BunSQLTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncTransaction<BunSQLQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'BunSQLTransaction';

	constructor(
		dialect: PgDialect,
		/** @internal */
		override readonly session: BunSQLSession<
			TransactionSQL | SavepointSQL,
			TFullSchema,
			TRelations,
			TSchema
		>,
		relations: TRelations,
		schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		nestedIndex = 0,
	) {
		super(dialect, session, relations, schema, nestedIndex);
	}

	override transaction<T>(
		transaction: (tx: BunSQLTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		return (this.session.client as TransactionSQL).savepoint((client) => {
			const session = new BunSQLSession<SavepointSQL, TFullSchema, TRelations, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				this.session.options,
			);
			const tx = new BunSQLTransaction<TFullSchema, TRelations, TSchema>(
				this.dialect,
				session,
				this.relations,
				this.schema,
			);
			return transaction(tx);
		}) as Promise<T>;
	}
}

export interface BunSQLQueryResultHKT extends PgQueryResultHKT {
	type: this['row'][];
}
