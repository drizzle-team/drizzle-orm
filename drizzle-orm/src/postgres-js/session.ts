import type { Row, RowList, Sql, TransactionSql } from 'postgres';
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
import type { Assume } from '~/utils.ts';

export interface PostgresJsSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export class PostgresJsSession<TSQL extends Sql, TRelations extends AnyRelations>
	extends PgAsyncSession<PostgresJsQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'PostgresJsSession';

	logger: Logger;
	private cache: Cache;

	constructor(
		public client: TSQL,
		dialect: PgDialect,
		private relations: TRelations,
		/** @internal */
		readonly options: PostgresJsSessionOptions = {},
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
				return this.client.unsafe(query.sql, params ?? [] as any[]).then((rows) => Object.values(rows));
			}
			if (mode === 'raw') return this.client.unsafe(query.sql, params ?? [] as any[]);
			return this.client.unsafe(query.sql, params ?? [] as any[]).values();
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
		transaction: (tx: PostgresJsTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.client.begin(async (client) => {
			const session = new PostgresJsSession<TransactionSql, TRelations>(
				client,
				this.dialect,
				this.relations,
				this.options,
			);
			const tx = new PostgresJsTransaction(this.dialect, session, this.relations);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class PostgresJsTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<PostgresJsQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresJsTransaction';

	constructor(
		dialect: PgDialect,
		/** @internal */
		override readonly session: PostgresJsSession<TransactionSql, TRelations>,
		relations: TRelations,
		nestedIndex = 0,
	) {
		super(dialect, session, relations, nestedIndex, false);
	}

	override transaction = <T>(
		transaction: (tx: PostgresJsTransaction<TRelations>) => Promise<T>,
	): Promise<T> => {
		return this.session.client.savepoint((client) => {
			const session = new PostgresJsSession<TransactionSql, TRelations>(
				client,
				this.dialect,
				this._.relations,
				this.session.options,
			);
			const tx = new PostgresJsTransaction<TRelations>(
				this.dialect,
				session,
				this._.relations,
			);
			return transaction(tx);
		}) as Promise<T>;
	};
}

export interface PostgresJsQueryResultHKT extends PgQueryResultHKT {
	type: RowList<Assume<this['row'], Row>[]>;
}
