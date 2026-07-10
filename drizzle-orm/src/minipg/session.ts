import { type Connection, Pool, type QueryResult, type ShapeSpec } from 'minipg';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery } from '~/pg-core/async/session.ts';
import { PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig } from '~/pg-core/session.ts';
import type { PreparedQueryConfig } from '~/pg-core/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';
import type { Simplify } from '~/utils.ts';
export type MiniPgClient = Pool | Connection;

export interface MiniPgSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class MiniPgSession<
	TRelations extends AnyRelations,
> extends PgAsyncSession<MiniPgQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'MiniPgSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: MiniPgClient,
		dialect: PgDialect,
		private relations: TRelations,
		private options: MiniPgSessionOptions = {},
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
			shape ? undefined : mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
		);
	}

	override async transaction<T>(
		transaction: (tx: MiniPgTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		const isPool = this.client instanceof Pool || Object.getPrototypeOf(this.client).constructor.name.includes('Pool'); // oxlint-disable-line drizzle-internal/no-instanceof
		const session = isPool
			? new MiniPgSession(
				await (this.client as Pool).acquire(),
				this.dialect,
				this.relations,
				this.options,
			)
			: this;
		const tx = new MiniPgTransaction<TRelations>(
			this.dialect,
			session,
			this.relations,
			undefined,
			false,
		);

		await tx.execute(sql`begin${config ? sql` ${tx.getTransactionConfigSQL(config)}` : undefined}`);
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			await tx.execute(sql`rollback`);
			throw error;
		} finally {
			if (isPool) (this.client as Pool).release(session.client as Connection);
		}
	}
}

export class MiniPgTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<MiniPgQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'MiniPgTransaction';

	override async transaction<T>(
		transaction: (tx: MiniPgTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new MiniPgTransaction<TRelations>(
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
	}
}

export interface MiniPgQueryResultHKT extends PgQueryResultHKT {
	type: Simplify<Omit<QueryResult<this['row']>, 'metrics' | 'debug'>>;
}
