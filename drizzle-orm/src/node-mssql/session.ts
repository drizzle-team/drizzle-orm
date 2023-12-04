import type { ConnectionPool, IResult, Request } from 'mssql';
import mssql from 'mssql';
import { once } from 'node:events';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MsSqlDialect } from '~/mssql-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/mssql-core/query-builders/select.types.ts';
import {
	MsSqlSession,
	MsSqlTransaction,
	type MsSqlTransactionConfig,
	PreparedQuery,
	type PreparedQueryConfig,
	type PreparedQueryHKT,
	type PreparedQueryKind,
	type QueryResultHKT,
} from '~/mssql-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export type NodeMsSqlClient = Pick<ConnectionPool, 'request'>;

export type MsSqlQueryResult<
	T = any,
> = IResult<T>;

export class NodeMsSqlPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	static readonly [entityKind]: string = 'NodeMsSqlPreparedQuery';

	private rawQuery: {
		sql: string;
		parameters: unknown[];
	};

	constructor(
		private client: NodeMsSqlClient,
		queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super();
		this.rawQuery = {
			sql: queryString,
			parameters: params,
		};
	}

	async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.rawQuery.sql, params);

		const { fields, client, rawQuery, joinsNotNullableMap, customResultMapper } = this;
		const request = client.request() as Request & { arrayRowMode: boolean };
		for (const [index, param] of params.entries()) {
			request.input(`par${index}`, param);
		}

		if (!fields && !customResultMapper) {
			return request.query(rawQuery.sql) as Promise<T['execute']>;
		}

		request.arrayRowMode = true;
		const rows = await request.query<any[]>(rawQuery.sql);

		if (customResultMapper) {
			return customResultMapper(rows.recordset);
		}

		return rows.recordset.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	async *iterator(
		placeholderValues: Record<string, unknown> = {},
	): AsyncGenerator<T['execute'] extends any[] ? T['execute'][number] : T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		const { fields, rawQuery, joinsNotNullableMap, client, customResultMapper } = this;
		const request = client.request() as Request & { arrayRowMode: boolean };
		request.stream = true;
		const hasRowsMapper = Boolean(fields || customResultMapper);

		if (hasRowsMapper) {
			request.arrayRowMode = true;
		}

		for (const [index, param] of params.entries()) {
			request.input(`par${index}`, param);
		}

		const stream = request.toReadableStream();

		request.query(rawQuery.sql);

		function dataListener() {
			stream.pause();
		}

		stream.on('data', dataListener);

		try {
			const onEnd = once(stream, 'end');
			const onError = once(stream, 'error');

			while (true) {
				stream.resume();
				const row = await Promise.race([onEnd, onError, new Promise((resolve) => stream.once('data', resolve))]);
				if (row === undefined || (Array.isArray(row) && row.length === 0)) {
					break;
				} else if (row instanceof Error) { // eslint-disable-line no-instanceof/no-instanceof
					throw row;
				} else {
					if (hasRowsMapper) {
						if (customResultMapper) {
							const mappedRow = customResultMapper([row as unknown[]]);
							yield (Array.isArray(mappedRow) ? mappedRow[0] : mappedRow);
						} else {
							yield mapResultRow(fields!, row as unknown[], joinsNotNullableMap);
						}
					} else {
						yield row as T['execute'];
					}
				}
			}
		} finally {
			stream.off('data', dataListener);
			request.cancel();
		}
	}
}

export interface NodeMsSqlSessionOptions {
	logger?: Logger;
}

export class NodeMsSqlSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MsSqlSession<NodeMsSqlQueryResultHKT, NodeMsSqlPreparedQueryHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'NodeMsSqlSession';

	private logger: Logger;

	constructor(
		private client: NodeMsSqlClient,
		dialect: MsSqlDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: NodeMsSqlSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PreparedQueryKind<NodeMsSqlPreparedQueryHKT, T> {
		return new NodeMsSqlPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			customResultMapper,
		) as PreparedQueryKind<NodeMsSqlPreparedQueryHKT, T>;
	}

	/**
	 * @internal
	 * What is its purpose?
	 */
	query<T = any[]>(query: string, params: unknown[]): Promise<IResult<T>> {
		this.logger.logQuery(query, params);

		const request = this.client.request() as Request & { arrayRowMode: boolean };
		request.arrayRowMode = true;

		for (const [index, param] of params.entries()) {
			request.input(`par${index}`, param);
		}

		return request.query(query);
	}

	override async all<T = unknown>(query: SQL): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);
		return this.query<T[]>(querySql.sql, querySql.params).then((result) => result.recordset);
	}

	override async transaction<T>(
		transaction: (tx: NodeMsSqlTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: MsSqlTransactionConfig,
	): Promise<T> {
		const mssqlTransaction = (this.client as ConnectionPool).transaction();
		const session = new NodeMsSqlSession(mssqlTransaction, this.dialect, this.schema, this.options);
		const tx = new NodeMsSqlTransaction(
			this.dialect,
			session as MsSqlSession<any, any, any, any>,
			this.schema,
			0,
		);

		await mssqlTransaction.begin(config?.isolationLevel ? isolationLevelMap[config.isolationLevel] : undefined);

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
	TSchema extends TablesRelationalConfig,
> extends MsSqlTransaction<NodeMsSqlQueryResultHKT, NodeMsSqlPreparedQueryHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'NodeMsSqlTransaction';

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

		await tx.execute(sql.raw(`save ${savepointName}`));
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
	typeof mssql.ISOLATION_LEVEL[keyof typeof mssql['ISOLATION_LEVEL']]
> = {
	'read uncommitted': mssql.ISOLATION_LEVEL.READ_UNCOMMITTED,
	'read committed': mssql.ISOLATION_LEVEL.READ_COMMITTED,
	'repeatable read': mssql.ISOLATION_LEVEL.REPEATABLE_READ,
	serializable: mssql.ISOLATION_LEVEL.SERIALIZABLE,
	snapshot: mssql.ISOLATION_LEVEL.SNAPSHOT,
};

export interface NodeMsSqlQueryResultHKT extends QueryResultHKT {
	type: MsSqlQueryResult;
}

export interface NodeMsSqlPreparedQueryHKT extends PreparedQueryHKT {
	type: NodeMsSqlPreparedQuery<Assume<this['config'], PreparedQueryConfig>>;
}
