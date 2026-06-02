import type { Client, Connection, ExecutedQuery, Transaction } from '@planetscale/database';
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
} from '~/mysql-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';

export interface PlanetscaleSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class PlanetscaleSession<TRelations extends AnyRelations> extends MySqlSession<
	MySqlQueryResultHKT,
	TRelations
> {
	static override readonly [entityKind]: string = 'PlanetscaleSession';

	private logger: Logger;
	private client: Client | Transaction | Connection;
	private cache: Cache;

	constructor(
		private baseClient: Client | Connection,
		dialect: MySqlDialect,
		tx: Transaction | undefined,
		private relations: TRelations,
		private options: PlanetscaleSessionOptions = {},
	) {
		super(dialect);
		this.client = tx ?? baseClient;
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
		const queryConfig = {
			as: mode === 'arrays' ? 'array' : 'object' as any,
		};

		const executor = async (params: any[] = []) => {
			const raw = client.execute(query.sql, params, queryConfig);

			if (mode !== 'raw') return raw.then(({ rows }) => rows);
			if (!mapper) return raw;

			return raw.then(({ insertId, rowsAffected }) => ({
				insertId: Number.parseFloat(insertId),
				affectedRows: rowsAffected,
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

	override transaction<T>(
		transaction: (tx: PlanetScaleTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		return this.baseClient.transaction((pstx) => {
			const session = new PlanetscaleSession(
				this.baseClient,
				this.dialect,
				pstx,
				this.relations,
				this.options,
			);
			const tx = new PlanetScaleTransaction<TRelations>(
				this.dialect,
				session as MySqlSession<any, any>,
				this.relations,
			);
			return transaction(tx);
		});
	}
}

export class PlanetScaleTransaction<
	TRelations extends AnyRelations,
> extends MySqlTransaction<
	PlanetscaleQueryResultHKT,
	TRelations
> {
	static override readonly [entityKind]: string = 'PlanetScaleTransaction';

	constructor(
		dialect: MySqlDialect,
		session: MySqlSession,
		relations: TRelations,
		nestedIndex = 0,
	) {
		super(dialect, session, relations, nestedIndex);
	}

	override async transaction<T>(
		transaction: (tx: PlanetScaleTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new PlanetScaleTransaction<TRelations>(
			this.dialect,
			this.session,
			this.relations,
			this.nestedIndex + 1,
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

export interface PlanetscaleQueryResultHKT extends MySqlQueryResultHKT {
	type: ExecutedQuery;
}
