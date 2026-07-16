import type { Connection, Pool, QueryResult, ShapeSpec } from 'minipg';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { Simplify } from '~/utils.ts';
export type PostgresClient = Pool | Connection;

export interface PostgresSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class PostgresSession<
	TRelations extends AnyRelations,
> extends PgAsyncSession<PostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: PostgresClient,
		dialect: PgDialect,
		private relations: TRelations,
		private options: PostgresSessionOptions = {},
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
		shape?: ShapeSpec,
	) {
		const queryName = typeof name === 'string'
			? name
			: name === true
			? preparedStatementName(query.sql, query.params)
			: undefined;

		const executor = async (params?: unknown[]) => {
			const q = mode === 'arrays'
				? this.client.query(
					query.sql,
					params ?? [],
					{ name: queryName, mode: 'array', shape },
				)
				: this.client.query(
					query.sql,
					params ?? [],
					{ name: queryName, mode: 'object', shape },
				);

			if (mode === 'raw') return q;
			return q.then((r) => r.rows);
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
		transaction: (tx: PostgresTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		return this.client.transaction({
			deferrable: config?.deferrable,
			isolation: config?.isolationLevel,
			readOnly: config?.accessMode === 'read only',
		}, (clTx) => {
			const session = new PostgresSession(clTx, this.dialect, this.relations, this.options);
			const tx = new PostgresTransaction<TRelations>(
				this.dialect,
				session,
				this.relations,
				undefined,
				false,
			);

			return transaction(tx);
		});
	}
}

export class PostgresTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<PostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresTransaction';

	override async transaction<T>(
		transaction: (tx: PostgresTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		return this.session.transaction(transaction as any);
	}
}

export interface PostgresQueryResultHKT extends PgQueryResultHKT {
	type: Simplify<Omit<QueryResult<this['row']>, 'metrics' | 'debug'>>;
}
