import type { Sql, TransactionSql } from 'postgres';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig } from '~/pg-core/session.ts';
import type { PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';

export class PostgresJsPreparedQuery<T extends PreparedQueryConfig> extends PgAsyncPreparedQuery<T, Sql> {
	static override readonly [entityKind]: string = 'PostgresJsPreparedQuery';

	/** @internal */
	override objects(params?: any[]): Promise<T['objects']> {
		return this.client.unsafe(this.query.sql, params).then((rows) => Object.values(rows));
	}

	/** @internal */
	override arrays(params?: any[]): Promise<T['arrays']> {
		return this.client.unsafe(this.query.sql, params).values();
	}
}

export interface PostgresJsSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export class PostgresJsSession<
	TSQL extends Sql,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<PostgresJsQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'PostgresJsSession';

	logger: Logger;
	private cache: Cache;

	constructor(
		public client: TSQL,
		dialect: PgDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		/** @internal */
		readonly options: PostgresJsSessionOptions = {},
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
		return new PostgresJsPreparedQuery(
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
		transaction: (tx: PostgresJsTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.client.begin(async (client) => {
			const session = new PostgresJsSession<TransactionSql, TFullSchema, TRelations, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				this.options,
			);
			const tx = new PostgresJsTransaction(this.dialect, session, this.schema, this.relations);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class PostgresJsTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncTransaction<PostgresJsQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'PostgresJsTransaction';

	constructor(
		dialect: PgDialect,
		/** @internal */
		override readonly session: PostgresJsSession<TransactionSql, TFullSchema, TRelations, TSchema>,
		schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		relations: TRelations,
		nestedIndex = 0,
	) {
		super(dialect, session, relations, schema, nestedIndex);
	}

	override transaction<T>(
		transaction: (tx: PostgresJsTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		return this.session.client.savepoint((client) => {
			const session = new PostgresJsSession<TransactionSql, TFullSchema, TRelations, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				this.session.options,
			);
			const tx = new PostgresJsTransaction<TFullSchema, TRelations, TSchema>(
				this.dialect,
				session,
				this.schema,
				this.relations,
			);
			return transaction(tx);
		}) as Promise<T>;
	}
}

export interface PostgresJsQueryResultHKT extends PgQueryResultHKT {
	type: this['row'][];
}
