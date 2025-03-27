import type { ColumnMetadata, ExecuteStatementCommandOutput, Field, RDSDataClient } from '@aws-sdk/client-rds-data';
import {
	BeginTransactionCommand,
	CommitTransactionCommand,
	ExecuteStatementCommand,
	RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import type * as V1 from '~/_relations.ts';
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
import type { AnyRelations, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type QueryTypingsValue, type QueryWithTypings, type SQL, sql } from '~/sql/sql.ts';
import { mapResultRow } from '~/utils.ts';
import { getValueFromDataApi, toValueParam } from '../common/index.ts';

export type AwsDataApiClient = RDSDataClient;

export class AwsDataApiPreparedQuery<
	T extends PreparedQueryConfig & { values: AwsDataApiPgQueryResult<unknown[]> },
	TIsRqbV2 extends boolean = false,
> extends PgPreparedQuery<T> {
	static override readonly [entityKind]: string = 'AwsDataApiPreparedQuery';

	private rawQuery: ExecuteStatementCommand;

	constructor(
		private client: AwsDataApiClient,
		queryString: string,
		private params: unknown[],
		private typings: QueryTypingsValue[],
		private options: AwsDataApiSessionOptions,
		private fields: SelectedFieldsOrdered | undefined,
		/** @internal */
		readonly transactionId: string | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		private isRqbV2Query?: TIsRqbV2,
	) {
		super({ sql: queryString, params });
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
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

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
			? (customResultMapper as (rows: unknown[][]) => T['execute'])(result.rows!)
			: result.rows!.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	private async executeRqbV2(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const { customResultMapper } = this;

		const result = await this.values(placeholderValues);
		const { columnMetadata, rows } = result;
		if (!columnMetadata) {
			return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(
				rows as any as Record<string, unknown>[],
			);
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

		Object.assign(result, { rows: mappedRows });

		return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(
			mappedRows,
		);
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

		const result = await this.client.send(this.rawQuery);
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
	TRelations extends AnyRelations,
	TTablesConfig extends TablesRelationalConfig,
	TSchema extends V1.TablesRelationalConfig,
> extends PgSession<AwsDataApiPgQueryResultHKT, TFullSchema, TRelations, TTablesConfig, TSchema> {
	static override readonly [entityKind]: string = 'AwsDataApiSession';

	/** @internal */
	readonly rawQuery: AwsDataApiQueryBase;

	constructor(
		/** @internal */
		readonly client: AwsDataApiClient,
		dialect: PgDialect,
		private relations: AnyRelations | undefined,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
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
		transactionId?: string,
	): AwsDataApiPreparedQuery<T> {
		return new AwsDataApiPreparedQuery(
			this.client,
			query.sql,
			query.params,
			query.typings ?? [],
			this.options,
			fields,
			transactionId ?? this.transactionId,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: QueryWithTypings,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (rows: Record<string, unknown>[]) => T['execute'],
		transactionId?: string,
	): PgPreparedQuery<T> {
		return new AwsDataApiPreparedQuery(
			this.client,
			query.sql,
			query.params,
			query.typings ?? [],
			this.options,
			fields,
			transactionId ?? this.transactionId,
			false,
			customResultMapper,
			true,
		);
	}

	override execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T; values: AwsDataApiPgQueryResult<unknown[]> }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
			undefined,
			this.transactionId,
		).execute();
	}

	override async transaction<T>(
		transaction: (tx: AwsDataApiTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		const { transactionId } = await this.client.send(new BeginTransactionCommand(this.rawQuery));
		const session = new AwsDataApiSession(
			this.client,
			this.dialect,
			this.relations,
			this.schema,
			this.options,
			transactionId,
		);
		const tx = new AwsDataApiTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>(
			this.dialect,
			session,
			this.relations,
			this.schema,
		);
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
	TRelations extends AnyRelations,
	TTablesConfig extends TablesRelationalConfig,
	TSchema extends V1.TablesRelationalConfig,
> extends PgTransaction<AwsDataApiPgQueryResultHKT, TFullSchema, TRelations, TTablesConfig, TSchema> {
	static override readonly [entityKind]: string = 'AwsDataApiTransaction';

	override async transaction<T>(
		transaction: (tx: AwsDataApiTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new AwsDataApiTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>(
			this.dialect,
			this.session,
			this.relations,
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
