import type { ParserOptions, PGlite, Results, Row, Transaction } from '@electric-sql/pglite';
import { types } from '@electric-sql/pglite';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession } from '~/pg-core/async/session.ts';
import { PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';

export type PgliteClient = PGlite;

const parsers: ParserOptions = {
	[types.TIMESTAMP]: (value) => value,
	[types.TIMESTAMPTZ]: (value) => value,
	[types.INTERVAL]: (value) => value,
	[types.DATE]: (value) => value,
	// numeric[]
	[1231]: (value) => value,
	// timestamp[]
	[1115]: (value) => value,
	// timestamp with timezone[]
	[1185]: (value) => value,
	// interval[]
	[1187]: (value) => value,
	// date[]
	[1182]: (value) => value,
};

export interface PgliteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class PgliteSession<TRelations extends AnyRelations> extends PgAsyncSession<PgliteQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PgliteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: PgliteClient | Transaction,
		dialect: PgDialect,
		private relations: TRelations,
		private options: PgliteSessionOptions = {},
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
			return this.client.query(query.sql, params, {
				rowMode: mode === 'arrays' ? 'array' : 'object',
				parsers,
			}).then((r) => mode === 'raw' ? r : r.rows);
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
		transaction: (tx: PgliteTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		return (this.client as PgliteClient).transaction(async (client) => {
			const session = new PgliteSession<TRelations>(
				client,
				this.dialect,
				this.relations,
				this.options,
			);
			const tx = new PgliteTransaction<TRelations>(
				this.dialect,
				session,
				this.relations,
				undefined,
				false,
			);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class PgliteTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<PgliteQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PgliteTransaction';

	override transaction = async <T>(
		transaction: (tx: PgliteTransaction<TRelations>) => Promise<T>,
	): Promise<T> => {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new PgliteTransaction<TRelations>(
			this.dialect,
			this.session,
			this._.relations,
			this.nestedIndex + 1,
			false,
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
	};
}

export interface PgliteQueryResultHKT extends PgQueryResultHKT {
	type: Results<Assume<this['row'], Row>>;
}
