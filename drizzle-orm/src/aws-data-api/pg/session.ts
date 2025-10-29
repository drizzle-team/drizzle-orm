import type { ColumnMetadata, ExecuteStatementCommandOutput, Field, RDSDataClient } from '@aws-sdk/client-rds-data';
import {
	BeginTransactionCommand,
	CommitTransactionCommand,
	ExecuteStatementCommand,
	RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import type { Cache } from '~/cache/core/cache.ts';
import { NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import {
	type PgDialect,
	PgPreparedQuery,
	type PgQueryResultHKT,
	PgSession,
	PgTransaction,
	type PgTransactionConfig,
	type PreparedQueryConfig,
} from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type QueryTypingsValue, type QueryWithTypings, type SQL, sql } from '~/sql/sql.ts';
import { mapResultRow } from '~/utils.ts';
import { getValueFromDataApi, toValueParam } from '../common/index.ts';

export type AwsDataApiClient = RDSDataClient;

export class AwsDataApiPreparedQuery<
	T extends PreparedQueryConfig & { values: AwsDataApiPgQueryResult<unknown[]> },
> extends PgPreparedQuery<T> {
	static override readonly [entityKind]: string = 'AwsDataApiPreparedQuery';

	private rawQuery: ExecuteStatementCommand;

	constructor(
		private client: AwsDataApiClient,
		private queryString: string,
		private params: unknown[],
		private typings: QueryTypingsValue[],
		private options: AwsDataApiSessionOptions,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		/** @internal */
		readonly transactionId: string | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super({ sql: queryString, params }, cache, queryMetadata, cacheConfig);
		this.rawQuery = new ExecuteStatementCommand({
			sql: queryString,
			parameters: [],
			secretArn: options.secretArn,
			resourceArn: options.resourceArn,
			database: options.database,
			transactionId,
			includeResultMetadata: !fields && !customResultMapper,
		});
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const { fields, joinsNotNullableMap, customResultMapper } = this;

		const result = await this.values(placeholderValues);
		if (!fields && !customResultMapper) {
			const { columnMetadata, rows } = result;
			if (!columnMetadata) {
				return result;
			}
			const mappedRows = rows.map((sourceRow) => {
				const row: Record<string, unknown> = {};
				for (const [index, value] of sourceRow.entries()) {
					const metadata = columnMetadata[index];
					if (!metadata) {
						throw new Error(
							`Unexpected state: no column metadata found for index ${index}. Please report this issue on GitHub: https://github.com/drizzle-team/drizzle-orm/issues/new/choose`,
						);
					}
					if (!metadata.name) {
						throw new Error(
							`Unexpected state: no column name for index ${index} found in the column metadata. Please report this issue on GitHub: https://github.com/drizzle-team/drizzle-orm/issues/new/choose`,
						);
					}
					row[metadata.name] = value;
				}
				return row;
			});
			return Object.assign(result, { rows: mappedRows });
		}

		return customResultMapper
			? customResultMapper(result.rows!)
			: result.rows!.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	async all(placeholderValues?: Record<string, unknown> | undefined): Promise<T['all']> {
		const result = await this.execute(placeholderValues);
		if (!this.fields && !this.customResultMapper) {
			return (result as AwsDataApiPgQueryResult<unknown>).rows;
		}
		return result;
	}

	async values(placeholderValues: Record<string, unknown> = {}): Promise<T['values']> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});

		this.rawQuery.input.parameters = params.map((param, index) => ({
			name: `${index + 1}`,
			...toValueParam(param, this.typings[index]),
		}));

		this.options.logger?.logQuery(this.rawQuery.input.sql!, this.rawQuery.input.parameters);

		const result = await this.queryWithCache(this.queryString, params, async () => {
			return await this.client.send(this.rawQuery);
		});
		const rows = result.records?.map((row) => {
			return row.map((field) => getValueFromDataApi(field));
		}) ?? [];

		return {
			...result,
			rows,
		};
	}

	/** @internal */
	mapResultRows(records: Field[][], columnMetadata: ColumnMetadata[]) {
		return records.map((record) => {
			const row: Record<string, unknown> = {};
			for (const [index, field] of record.entries()) {
				const { name } = columnMetadata[index]!;
				row[name ?? index] = getValueFromDataApi(field); // not what to default if name is undefined
			}
			return row;
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface AwsDataApiSessionOptions {
	logger?: Logger;
	cache?: Cache;
	database: string;
	resourceArn: string;
	secretArn: string;
}

interface AwsDataApiQueryBase {
	resourceArn: string;
	secretArn: string;
	database: string;
}

export class AwsDataApiSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<AwsDataApiPgQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'AwsDataApiSession';

	/** @internal */
	readonly rawQuery: AwsDataApiQueryBase;
	private cache: Cache;

	constructor(
		/** @internal */
		readonly client: AwsDataApiClient,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: AwsDataApiSessionOptions,
		/** @internal */
		readonly transactionId: string | undefined,
	) {
		super(dialect);
		this.rawQuery = {
			secretArn: options.secretArn,
			resourceArn: options.resourceArn,
			database: options.database,
		};
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<
		T extends PreparedQueryConfig & {
			values: AwsDataApiPgQueryResult<unknown[]>;
		} = PreparedQueryConfig & {
			values: AwsDataApiPgQueryResult<unknown[]>;
		},
	>(
		query: QueryWithTypings,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		queryMetadata?: { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] },
		cacheConfig?: WithCacheConfig,
		transactionId?: string,
	): AwsDataApiPreparedQuery<T> {
		return new AwsDataApiPreparedQuery(
			this.client,
			query.sql,
			query.params,
			query.typings ?? [],
			this.options,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			transactionId ?? this.transactionId,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	override execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T; values: AwsDataApiPgQueryResult<unknown[]> }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			undefined,
			this.transactionId,
		).execute();
	}

	override async transaction<T>(
		transaction: (tx: AwsDataApiTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		const { transactionId } = await this.client.send(new BeginTransactionCommand(this.rawQuery));
		const session = new AwsDataApiSession(this.client, this.dialect, this.schema, this.options, transactionId);
		const tx = new AwsDataApiTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema);
		if (config) {
			await tx.setTransaction(config);
		}
		try {
			const result = await transaction(tx);
			await this.client.send(new CommitTransactionCommand({ ...this.rawQuery, transactionId }));
			return result;
		} catch (e) {
			await this.client.send(new RollbackTransactionCommand({ ...this.rawQuery, transactionId }));
			throw e;
		}
	}
}

export class AwsDataApiTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<AwsDataApiPgQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'AwsDataApiTransaction';

	override async transaction<T>(
		transaction: (tx: AwsDataApiTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new AwsDataApiTransaction<TFullSchema, TSchema>(
			this.dialect,
			this.session,
			this.schema,
			this.nestedIndex + 1,
		);
		await this.session.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await this.session.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (e) {
			await this.session.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw e;
		}
	}
}

export type AwsDataApiPgQueryResult<T> = ExecuteStatementCommandOutput & { rows: T[] };

export interface AwsDataApiPgQueryResultHKT extends PgQueryResultHKT {
	type: AwsDataApiPgQueryResult<any>;
}
