import {
	type Client,
	type CustomTypesConfig,
	Pool,
	type PoolClient,
	type QueryResult,
	type QueryResultRow,
	types,
} from '@neondatabase/serverless';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';

export type NeonClient = Pool | PoolClient | Client;

const noop = (val: any) => val;
const typeConfig: CustomTypesConfig = {
	getTypeParser: <CustomTypesConfig['getTypeParser']> ((typeId, format) => {
		switch (typeId as number) {
			case types.builtins.TIMESTAMPTZ:
				return noop;
			case types.builtins.TIMESTAMP:
				return noop;
			case types.builtins.DATE:
				return noop;
			case types.builtins.INTERVAL:
				return noop;
			// numeric[]
			case 1231:
				return noop;
			// timestamp[]
			case 1115:
				return noop;
			// timestamp with timezone[]
			case 1185:
				return noop;
			// interval[]
			case 1187:
				return noop;
			// date[]
			case 1182:
				return noop;
			default:
				return types.getTypeParser(typeId, format as any);
		}
	}),
};

export interface NeonSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export class NeonSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<NeonQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'NeonSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: NeonClient,
		dialect: PgDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: NeonSessionOptions = {},
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
	): PgAsyncPreparedQuery<T> {
		const queryName = typeof name === 'string'
			? name
			: name === true
			? preparedStatementName(query.sql, query.params)
			: undefined;

		const executor = async (params?: unknown[]) => {
			return this.client.query({
				name: queryName,
				rowMode: mode === 'arrays' ? 'array' : undefined as any,
				text: query.sql,
				types: typeConfig,
			}, params).then((r) => mode === 'raw' ? r : r.rows);
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
		transaction: (tx: NeonTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config: PgTransactionConfig = {},
	): Promise<T> {
		const session = this.client instanceof Pool // oxlint-disable-line drizzle-internal/no-instanceof
			? new NeonSession(await this.client.connect(), this.dialect, this.relations, this.schema, this.options)
			: this;
		const tx = new NeonTransaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			session,
			this.relations,
			this.schema,
			undefined,
			false,
		);
		await tx.execute(sql`begin ${tx.getTransactionConfigSQL(config)}`);
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			await tx.execute(sql`rollback`);
			throw error;
		} finally {
			if (this.client instanceof Pool) { // oxlint-disable-line drizzle-internal/no-instanceof
				(session.client as PoolClient).release();
			}
		}
	}
}

export class NeonTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncTransaction<NeonQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'NeonTransaction';

	override transaction = async <T>(
		transaction: (tx: NeonTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> => {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NeonTransaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			this.session,
			this._.relations,
			this.schema,
			this.nestedIndex + 1,
			false,
		);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (e) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw e;
		}
	};
}

export interface NeonQueryResultHKT extends PgQueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
