import type { Client, CustomTypesConfig, PoolClient, QueryResult, QueryResultRow } from 'pg';
import pg from 'pg';
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
import type { AnyRelations } from '~/relations.ts';
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
	paramsInErrors?: boolean;
}

export class NodeCockroachSession<
	TRelations extends AnyRelations,
> extends CockroachSession<NodeCockroachQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'NodeCockroachSession';

	private logger: Logger;

	constructor(
		private client: NodeCockroachClient,
		dialect: CockroachDialect,
		private relations: TRelations,
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
			this.options.paramsInErrors,
		);
	}

	override async transaction<T>(
		transaction: (tx: NodeCockroachTransaction<TRelations>) => Promise<T>,
		config?: CockroachTransactionConfig | undefined,
	): Promise<T> {
		const poolClient = this.client instanceof Pool // oxlint-disable-line drizzle-internal/no-instanceof
			? await this.client.connect()
			: undefined;
		// pool detaches its own `error` listener from checked-out clients, so a connection dropped mid-transaction would crash the process
		let connectionError: Error | undefined;
		let rollbackError: Error | undefined;
		const onConnectionError = (e: Error) => {
			connectionError ??= e;
		};
		poolClient?.on('error', onConnectionError);
		const release = () => {
			if (!poolClient) return;
			// broken client is destroyed by the pool, listener stays to absorb any trailing errors
			if (!connectionError) poolClient.off('error', onConnectionError);
			poolClient.release(connectionError ?? rollbackError);
		};
		const session = poolClient
			? new NodeCockroachSession(poolClient, this.dialect, this.relations, this.options)
			: this;
		const tx = new NodeCockroachTransaction<TRelations>(this.dialect, session, this.relations);

		try {
			await tx.execute(sql`begin${config ? sql` ${tx.getTransactionConfigSQL(config)}` : undefined}`);
		} catch (e) {
			release();
			throw e;
		}

		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			// nothing to roll back on a dead connection; failed rollback must not mask the original error
			if (!connectionError) {
				await tx.execute(sql`rollback`).catch((e) => {
					rollbackError = e;
				});
			}
			throw error;
		} finally {
			release();
		}
	}
}

export class NodeCockroachTransaction<
	TRelations extends AnyRelations,
> extends CockroachTransaction<NodeCockroachQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'NodeCockroachTransaction';

	override async transaction<T>(
		transaction: (tx: NodeCockroachTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodeCockroachTransaction<TRelations>(
			this.dialect,
			this.session,
			this._.relations,
			this.nestedIndex + 1,
		);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`)).catch(() => {});
			throw err;
		}
	}
}

export type NodeCockroachRawExecuteResult = QueryResult<Record<string, unknown>> | QueryResult<
	Record<string, unknown>
>[];

export interface NodeCockroachQueryResultHKT extends CockroachQueryResultHKT {
	type: [this['row']] extends [never] ? QueryResult<never>
		: [this['row']] extends ['unknown'] ? NodeCockroachRawExecuteResult
		: QueryResult<Assume<this['row'], QueryResultRow>>;
}
