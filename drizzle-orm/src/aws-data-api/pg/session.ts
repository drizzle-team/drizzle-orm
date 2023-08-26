import type { ExecuteStatementCommandOutput, Field, RDSDataClient } from '@aws-sdk/client-rds-data';
import {
	BeginTransactionCommand,
	CommitTransactionCommand,
	ExecuteStatementCommand,
	RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import {
	type PgDialect,
	PgSession,
	PgTransaction,
	type PgTransactionConfig,
	PreparedQuery,
	type PreparedQueryConfig,
	type QueryResultHKT,
} from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import { type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, type QueryTypingsValue, type SQL, sql } from '~/sql/index.ts';
import { mapResultRow } from '~/utils.ts';
import { getValueFromDataApi, toValueParam } from '../common/index.ts';

export type AwsDataApiClient = RDSDataClient;

export class AwsDataApiPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	static readonly [entityKind]: string = 'AwsDataApiPreparedQuery';

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
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super();
		this.rawQuery = new ExecuteStatementCommand({
			sql: queryString,
			parameters: [],
			secretArn: options.secretArn,
			resourceArn: options.resourceArn,
			database: options.database,
			transactionId,
		});
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const { fields, joinsNotNullableMap, customResultMapper } = this;

		const rows = await this.values(placeholderValues) as unknown[][];
		if (!fields && !customResultMapper) {
			return rows as T['execute'];
		}
		return customResultMapper
			? customResultMapper(rows)
			: rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	all(placeholderValues?: Record<string, unknown> | undefined): Promise<T['all']> {
		return this.execute(placeholderValues);
	}

	async values(placeholderValues: Record<string, unknown> = {}): Promise<T['values']> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});

		this.rawQuery.input.parameters = params.map((param, index) => ({
			name: `${index + 1}`,
			...toValueParam(param, this.typings[index]),
		}));

		this.options.logger?.logQuery(this.rawQuery.input.sql!, this.rawQuery.input.parameters);

		const { fields, rawQuery, client, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const result = await client.send(rawQuery);
			return result.records ?? [];
		}

		const result = await client.send(rawQuery);

		return result.records?.map((row: any) => {
			return row.map((field: Field) => getValueFromDataApi(field));
		});
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
	TSchema extends TablesRelationalConfig,
> extends PgSession<AwsDataApiPgQueryResultHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'AwsDataApiSession';

	/** @internal */
	readonly rawQuery: AwsDataApiQueryBase;

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
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		transactionId?: string,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PreparedQuery<T> {
		return new AwsDataApiPreparedQuery(
			this.client,
			query.sql,
			query.params,
			query.typings ?? [],
			this.options,
			fields,
			transactionId,
			customResultMapper,
		);
	}

	override execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
			this.dialect.sqlToQuery(query),
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
		const tx = new AwsDataApiTransaction(this.dialect, session, this.schema);
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
	static readonly [entityKind]: string = 'AwsDataApiTransaction';

	override transaction<T>(transaction: (tx: AwsDataApiTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new AwsDataApiTransaction(this.dialect, this.session, this.schema, this.nestedIndex + 1);
		this.session.execute(sql`savepoint ${savepointName}`);
		try {
			const result = transaction(tx);
			this.session.execute(sql`release savepoint ${savepointName}`);
			return result;
		} catch (e) {
			this.session.execute(sql`rollback to savepoint ${savepointName}`);
			throw e;
		}
	}
}

export interface AwsDataApiPgQueryResultHKT extends QueryResultHKT {
	type: ExecuteStatementCommandOutput;
}
