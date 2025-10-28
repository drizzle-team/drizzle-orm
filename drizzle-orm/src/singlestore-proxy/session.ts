import type { FieldPacket, ResultSetHeader } from 'mysql2/promise';
import type * as V1 from '~/_relations.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import type { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import { SingleStoreTransaction } from '~/singlestore-core/index.ts';
import type { SelectedFieldsOrdered } from '~/singlestore-core/query-builders/select.types.ts';
import type {
	PreparedQueryKind,
	SingleStorePreparedQueryConfig,
	SingleStorePreparedQueryHKT,
	SingleStoreQueryResultHKT,
	SingleStoreTransactionConfig,
} from '~/singlestore-core/session.ts';
import { SingleStorePreparedQuery as PreparedQueryBase, SingleStoreSession } from '~/singlestore-core/session.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';
import type { RemoteCallback } from './driver.ts';

export type SingleStoreRawQueryResult = [ResultSetHeader, FieldPacket[]];

export interface SingleStoreRemoteSessionOptions {
	logger?: Logger;
}

export class SingleStoreRemoteSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SingleStoreSession<
	SingleStoreRemoteQueryResultHKT,
	SingleStoreRemotePreparedQueryHKT,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'SingleStoreRemoteSession';

	private logger: Logger;

	constructor(
		private client: RemoteCallback,
		dialect: SingleStoreDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		options: SingleStoreRemoteSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends SingleStorePreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
	): PreparedQueryKind<SingleStoreRemotePreparedQueryHKT, T> {
		return new PreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			customResultMapper,
			generatedIds,
			returningIds,
		) as PreparedQueryKind<SingleStoreRemotePreparedQueryHKT, T>;
	}

	prepareRelationalQuery<T extends SingleStorePreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper: (rows: Record<string, unknown>[]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
	): PreparedQueryKind<SingleStoreRemotePreparedQueryHKT, T> {
		return new PreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			customResultMapper,
			generatedIds,
			returningIds,
			true,
		) as any;
	}

	override all<T = unknown>(query: SQL): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);
		return this.client(querySql.sql, querySql.params, 'all').then(({ rows }) => rows) as Promise<T[]>;
	}

	override async transaction<T>(
		_transaction: (tx: SingleStoreProxyTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		_config?: SingleStoreTransactionConfig,
	): Promise<T> {
		throw new Error('Transactions are not supported by the SingleStore Proxy driver');
	}
}

export class SingleStoreProxyTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SingleStoreTransaction<
	SingleStoreRemoteQueryResultHKT,
	SingleStoreRemotePreparedQueryHKT,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'SingleStoreProxyTransaction';

	override async transaction<T>(
		_transaction: (tx: SingleStoreProxyTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		throw new Error('Transactions are not supported by the SingleStore Proxy driver');
	}
}

export class PreparedQuery<T extends SingleStorePreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends PreparedQueryBase<T>
{
	static override readonly [entityKind]: string = 'SingleStoreProxyPreparedQuery';

	constructor(
		private client: RemoteCallback,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		// Keys that were used in $default and the value that was generated for them
		private generatedIds?: Record<string, unknown>[],
		// Keys that should be returned, it has the column with all properries + key from object
		private returningIds?: SelectedFieldsOrdered,
		private isRqbV2Query?: TIsRqbV2,
	) {
		super();
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

		const params = fillPlaceholders(this.params, placeholderValues);

		const { fields, client, queryString, logger, joinsNotNullableMap, customResultMapper, returningIds, generatedIds } =
			this;

		logger.logQuery(queryString, params);

		if (!fields && !customResultMapper) {
			const { rows: data } = await client(queryString, params, 'execute');

			const insertId = data[0].insertId as number;
			const affectedRows = data[0].affectedRows;

			if (returningIds) {
				const returningResponse = [];
				let j = 0;
				for (let i = insertId; i < insertId + affectedRows; i++) {
					for (const column of returningIds) {
						const key = returningIds[0]!.path[0]!;
						if (is(column.field, Column)) {
							// @ts-ignore
							if (column.field.primary && column.field.autoIncrement) {
								returningResponse.push({ [key]: i });
							}
							if (column.field.defaultFn && generatedIds) {
								// generatedIds[rowIdx][key]
								returningResponse.push({ [key]: generatedIds[j]![key] });
							}
						}
					}
					j++;
				}

				return returningResponse;
			}

			return data;
		}

		const { rows } = await client(queryString, params, 'all');

		if (customResultMapper) {
			return customResultMapper(rows);
		}

		return rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	private async executeRqbV2(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		const { client, queryString, logger, customResultMapper } = this;

		logger.logQuery(queryString, params);

		const { rows: res } = await client(queryString, params, 'execute');
		const rows = res[0];

		return customResultMapper!(rows);
	}

	override iterator(
		_placeholderValues: Record<string, unknown> = {},
	): AsyncGenerator<T['iterator']> {
		throw new Error('Streaming is not supported by the SingleStore Proxy driver');
	}
}

export interface SingleStoreRemoteQueryResultHKT extends SingleStoreQueryResultHKT {
	type: SingleStoreRawQueryResult;
}

export interface SingleStoreRemotePreparedQueryHKT extends SingleStorePreparedQueryHKT {
	type: PreparedQuery<Assume<this['config'], SingleStorePreparedQueryConfig>>;
}
