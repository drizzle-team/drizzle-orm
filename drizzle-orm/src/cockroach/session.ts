import type { Client, CustomTypesConfig, PoolClient, QueryResult, QueryResultRow } from 'pg';
import pg from 'pg';
import type * as V1 from '~/_relations.ts';
import type { CockroachDialect } from '~/cockroach-core/dialect.ts';
import { CockroachTransaction } from '~/cockroach-core/index.ts';
import type {
	CockroachQueryResultHKT,
	CockroachTransactionConfig,
	PreparedQueryConfig,
} from '~/cockroach-core/session.ts';
import { CockroachPreparedQuery, CockroachSession } from '~/cockroach-core/session.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import { type Query, sql } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';

const { Pool, types } = pg;

export type NodeCockroachClient = pg.Pool | PoolClient | Client;

const noop = (val: any) => val;

const typeConfig: CustomTypesConfig = {
	getTypeParser: <CustomTypesConfig['getTypeParser']> ((typeId, format) => {
		switch (typeId as number) {
			case types.builtins.TIMESTAMPTZ:
			case types.builtins.TIMESTAMP:
			case types.builtins.DATE:
			case types.builtins.INTERVAL:
			case 1231: // numeric[]
			case 1115: // timestamp[]
			case 1185: // timestamp with timezone[]
			case 1187: // interval[]
			case 1182: // date[]
				return noop;
			default:
				return types.getTypeParser(typeId, format);
		}
	}),
};

export interface NodeCockroachSessionOptions {
	logger?: Logger;
}

export class NodeCockroachSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends V1.TablesRelationalConfig,
> extends CockroachSession<NodeCockroachQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodeCockroachSession';

	private logger: Logger;

	constructor(
		private client: NodeCockroachClient,
		dialect: CockroachDialect,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: NodeCockroachSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		name: string | boolean,
		mapper?: (rows: any[]) => any,
	): CockroachPreparedQuery<T> {
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

		return new CockroachPreparedQuery<T>(
			executor,
			query,
			mapper,
			mode,
			this.logger,
		);
	}

	override async transaction<T>(
		transaction: (tx: NodeCockroachTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: CockroachTransactionConfig | undefined,
	): Promise<T> {
		const session = this.client instanceof Pool // oxlint-disable-line drizzle-internal/no-instanceof
			? new NodeCockroachSession(await this.client.connect(), this.dialect, this.schema, this.options)
			: this;
		const tx = new NodeCockroachTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema);

		try {
			await tx.execute(sql`begin${config ? sql` ${tx.getTransactionConfigSQL(config)}` : undefined}`);
		} catch (e) {
			if (this.client instanceof Pool) (session.client as PoolClient).release(); // oxlint-disable-line drizzle-internal/no-instanceof
			throw e;
		}

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

export class NodeCockroachTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends V1.TablesRelationalConfig,
> extends CockroachTransaction<NodeCockroachQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodeCockroachTransaction';

	override async transaction<T>(
		transaction: (tx: NodeCockroachTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodeCockroachTransaction<TFullSchema, TSchema>(
			this.dialect,
			this.session,
			this.schema,
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

export interface NodeCockroachQueryResultHKT extends CockroachQueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
