import type { ConnectionPool, IResult, Request } from 'mssql';
import mssql from 'mssql';
import { once } from 'node:events';
import type * as V1 from '~/_relations.ts';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MsSqlDialect } from '~/mssql-core/dialect.ts';
import {
	MsSqlPreparedQuery,
	MsSqlSession,
	MsSqlTransaction,
	type MsSqlTransactionConfig,
	type PreparedQueryConfig,
	type PreparedQueryHKT,
	type PreparedQueryKind,
	type QueryResultHKT,
} from '~/mssql-core/session.ts';
import type { Query } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';
import { AutoPool } from './pool.ts';

export type NodeMsSqlClient = Pick<ConnectionPool, 'request'> | AutoPool;

export type MsSqlQueryResult<T extends unknown | unknown[] = any> = IResult<T>;

export interface NodeMsSqlSessionOptions {
	logger?: Logger;
}

export class NodeMsSqlSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends V1.TablesRelationalConfig,
> extends MsSqlSession<
	NodeMsSqlQueryResultHKT,
	NodeMsSqlPreparedQueryHKT,
	TFullSchema,
	TSchema
> {
	static override readonly [entityKind]: string = 'NodeMsSqlSession';

	private logger: Logger;

	constructor(
		private client: NodeMsSqlClient,
		dialect: MsSqlDialect,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: NodeMsSqlSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	private async request(params: unknown[]): Promise<Request & { arrayRowMode: boolean }> {
		const { client } = this;
		const queryClient = is(client, AutoPool) ? await client.$instance() : client as ConnectionPool;
		const request = queryClient.request() as Request & { arrayRowMode: boolean };

		for (const [index, param] of params.entries()) {
			request.input(`par${index}`, param);
		}

		return request;
	}

	prepareQuery<T extends PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (rows: any[]) => any,
	): PreparedQueryKind<NodeMsSqlPreparedQueryHKT, T> {
		const self = this;

		const executor = async (params: unknown[] = []) => {
			const request = await self.request(params);
			if (mode === 'raw') return request.query(query.sql);

			request.arrayRowMode = mode === 'arrays';
			return request.query<any[]>(query.sql).then((res) => res.recordset);
		};

		const iterator = async function*(params: unknown[] = []): AsyncGenerator<any> {
			const request = await self.request(params);
			request.stream = true;
			request.arrayRowMode = mode === 'arrays';

			const stream = request.toReadableStream();

			request.query(query.sql);

			function dataListener() {
				stream.pause();
			}

			stream.on('data', dataListener);

			try {
				const onEnd = once(stream, 'end');
				const onError = once(stream, 'error');

				while (true) {
					stream.resume();
					const row = await Promise.race([
						onEnd,
						onError,
						new Promise((resolve) => stream.once('data', resolve)),
					]);
					if (row === undefined || (Array.isArray(row) && row.length === 0)) {
						break;
					}
					if (row instanceof Error) { // oxlint-disable-line drizzle-internal/no-instanceof
						throw row;
					}
					yield row;
				}
			} finally {
				stream.off('data', dataListener);
				request.cancel();
			}
		};

		return new MsSqlPreparedQuery<T>(
			executor,
			iterator,
			query,
			mapper,
			mode,
			this.logger,
		) as PreparedQueryKind<NodeMsSqlPreparedQueryHKT, T>;
	}

	override async transaction<T>(
		transaction: (tx: NodeMsSqlTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: MsSqlTransactionConfig,
	): Promise<T> {
		let queryClient = this.client as ConnectionPool;

		if (is(this.client, AutoPool)) {
			queryClient = await this.client.$instance();
		}

		const mssqlTransaction = queryClient.transaction();
		const session = new NodeMsSqlSession(
			mssqlTransaction,
			this.dialect,
			this.schema,
			this.options,
		);
		const tx = new NodeMsSqlTransaction(
			this.dialect,
			session as MsSqlSession<any, any, any, any>,
			this.schema,
			0,
		);

		await mssqlTransaction.begin(
			config?.isolationLevel
				? isolationLevelMap[config.isolationLevel]
				: undefined,
		);

		try {
			const result = await transaction(tx);
			await mssqlTransaction.commit();
			return result;
		} catch (err) {
			await mssqlTransaction.rollback();
			throw err;
		}
	}
}

export class NodeMsSqlTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends V1.TablesRelationalConfig,
> extends MsSqlTransaction<
	NodeMsSqlQueryResultHKT,
	NodeMsSqlPreparedQueryHKT,
	TFullSchema,
	TSchema
> {
	static override readonly [entityKind]: string = 'NodeMsSqlTransaction';

	override async transaction<T>(
		transaction: (tx: NodeMsSqlTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodeMsSqlTransaction(
			this.dialect,
			this.session,
			this.schema,
			this.nestedIndex + 1,
		);

		await tx.execute(sql.raw(`save transaction ${savepointName}`));
		try {
			const result = await transaction(tx);
			return result;
		} catch (err) {
			await tx.execute(sql.raw(`rollback transaction ${savepointName}`));
			throw err;
		}
	}
}

const isolationLevelMap: Record<
	MsSqlTransactionConfig['isolationLevel'],
	(typeof mssql.ISOLATION_LEVEL)[keyof (typeof mssql)['ISOLATION_LEVEL']]
> = {
	'read uncommitted': mssql.ISOLATION_LEVEL.READ_UNCOMMITTED,
	'read committed': mssql.ISOLATION_LEVEL.READ_COMMITTED,
	'repeatable read': mssql.ISOLATION_LEVEL.REPEATABLE_READ,
	serializable: mssql.ISOLATION_LEVEL.SERIALIZABLE,
	snapshot: mssql.ISOLATION_LEVEL.SNAPSHOT,
};

export interface NodeMsSqlQueryResultHKT extends QueryResultHKT {
	type: MsSqlQueryResult<this['row']>;
}

export interface NodeMsSqlPreparedQueryHKT extends PreparedQueryHKT {
	type: MsSqlPreparedQuery<Assume<this['config'], PreparedQueryConfig>>;
}
