import type { Connection, FullResult, Tx } from '@tidbcloud/serverless';
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

export interface TiDBServerlessSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class TiDBServerlessSession<
	TRelations extends AnyRelations,
> extends MySqlSession<
	TiDBServerlessQueryResultHKT,
	TRelations
> {
	static override readonly [entityKind]: string = 'TiDBServerlessSession';

	private logger: Logger;
	private client: Tx | Connection;
	private cache: Cache;

	constructor(
		private baseClient: Connection,
		dialect: MySqlDialect,
		tx: Tx | undefined,
		private relations: TRelations,
		private options: TiDBServerlessSessionOptions = {},
	) {
		super(dialect);
		this.client = tx ?? baseClient;
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends MySqlPreparedQueryConfig = MySqlPreparedQueryConfig>(
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
		const queryConfig = mode === 'arrays'
			? { arrayMode: true }
			: { fullResult: true };

		const executor = async (params: any[] = []) => {
			const raw = client.execute(
				query.sql,
				params,
				queryConfig,
			);

			if (mode === 'arrays') return raw;
			if (mode === 'objects') return raw.then((res) => (<FullResult> res).rows);
			if (!mapper) return raw;

			return raw.then((res) => ({
				insertId: (<FullResult> res).lastInsertId ?? 0,
				affectedRows: (<FullResult> res).rowsAffected ?? 0,
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
		transaction: (tx: TiDBServerlessTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const nativeTx = await this.baseClient.begin();
		try {
			const session = new TiDBServerlessSession(
				this.baseClient,
				this.dialect,
				nativeTx,
				this.relations,
				this.options,
			);
			const tx = new TiDBServerlessTransaction<TRelations>(
				this.dialect,
				session as MySqlSession<any, any>,
				this.relations,
			);
			const result = await transaction(tx);
			await nativeTx.commit();
			return result;
		} catch (err) {
			await nativeTx.rollback();
			throw err;
		}
	}
}

export class TiDBServerlessTransaction<
	TRelations extends AnyRelations,
> extends MySqlTransaction<
	TiDBServerlessQueryResultHKT,
	TRelations
> {
	static override readonly [entityKind]: string = 'TiDBServerlessTransaction';

	constructor(
		dialect: MySqlDialect,
		session: MySqlSession,
		relations: TRelations,
		nestedIndex = 0,
	) {
		super(dialect, session, relations, nestedIndex);
	}

	override async transaction<T>(
		transaction: (tx: TiDBServerlessTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new TiDBServerlessTransaction<TRelations>(
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

export interface TiDBServerlessQueryResultHKT extends MySqlQueryResultHKT {
	type: FullResult;
}
