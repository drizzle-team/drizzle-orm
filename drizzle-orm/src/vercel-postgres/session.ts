import {
	type QueryResult,
	type QueryResultRow,
	types,
	type VercelClient,
	VercelPool,
	type VercelPoolClient,
} from '@vercel/postgres';
import type { CustomTypesConfig } from 'pg';
import type * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/index.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';

export type VercelPgClient = VercelPool | VercelClient | VercelPoolClient;

export interface VercelPgSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

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
				return types.getTypeParser(typeId, format);
		}
	}),
};

export class VercelPgSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<VercelPgQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'VercelPgSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: VercelPgClient,
		dialect: PgDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: VercelPgSessionOptions = {},
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
		transaction: (tx: VercelPgTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		const session = typeof this.client === 'function' || this.client instanceof VercelPool // oxlint-disable-line drizzle-internal/no-instanceof
			? new VercelPgSession(await this.client.connect(), this.dialect, this.relations, this.schema, this.options)
			: this;
		const tx = new VercelPgTransaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			session,
			this.relations,
			this.schema,
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
			if (typeof this.client === 'function' || this.client instanceof VercelPool) { // oxlint-disable-line drizzle-internal/no-instanceof
				(session.client as VercelPoolClient).release();
			}
		}
	}
}

export class VercelPgTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncTransaction<VercelPgQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'VercelPgTransaction';

	override transaction = async <T>(
		transaction: (tx: VercelPgTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> => {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new VercelPgTransaction<TFullSchema, TRelations, TSchema>(
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
		} catch (err) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	};
}

export interface VercelPgQueryResultHKT extends PgQueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
