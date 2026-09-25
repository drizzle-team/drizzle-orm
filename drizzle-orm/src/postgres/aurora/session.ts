import type { QueryResult } from '@drizzle-team/minipg';
import type { AuroraClient } from '@drizzle-team/minipg/aurora';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { Simplify } from '~/utils.ts';

export type PostgresAuroraClient = AuroraClient;

export interface PostgresAuroraSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class PostgresAuroraSession<
	TRelations extends AnyRelations,
> extends PgAsyncSession<PostgresAuroraQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresAuroraSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: PostgresAuroraClient,
		dialect: PgDialect,
		private relations: TRelations,
		private options: PostgresAuroraSessionOptions = {},
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
	) {
		const executor = async (params?: unknown[]) => {
			const q = mode === 'arrays'
				? this.client.query(query.sql, params ?? [], { mode: 'array' })
				: this.client.query(query.sql, params ?? [], { mode: 'object' });

			if (mode === 'raw') return q;
			return q.then((r) => r.rows);
		};

		return new PostgresAuroraPreparedQuery<T>(
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
		transaction: (tx: PostgresAuroraTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		return this.client.transaction({
			deferrable: config?.deferrable,
			isolation: config?.isolationLevel,
			readOnly: config?.accessMode === 'read only',
		}, async (clTx) => {
			const session = new PostgresAuroraSession(clTx, this.dialect, this.relations, this.options);
			const tx = new PostgresAuroraTransaction<TRelations>(
				this.dialect,
				session,
				this.relations,
				undefined,
				false,
			);

			if (typeof config?.snapshot === 'string') {
				await tx.execute(tx.setTransactionSnapshotSQL(config.snapshot));
			}

			return transaction(tx);
		});
	}
}

export class PostgresAuroraTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<PostgresAuroraQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresAuroraTransaction';

	override async transaction<T>(
		transaction: (tx: PostgresAuroraTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		return this.session.transaction(transaction as any);
	}
}

export type PostgresAuroraQueryResult<T> = Omit<QueryResult<T>, 'metrics' | 'debug'>;

export interface PostgresAuroraQueryResultHKT extends PgQueryResultHKT {
	type: Simplify<Omit<QueryResult<this['row']>, 'metrics' | 'debug'>>;
}

export class PostgresAuroraPreparedQuery<T extends PreparedQueryConfig> extends PgAsyncPreparedQuery<T> {
	static override readonly [entityKind]: string = 'PostgresAuroraPreparedQuery';
}
