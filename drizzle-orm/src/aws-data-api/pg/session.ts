import type {
	BeginTransactionCommandInput,
	CommitTransactionCommandInput,
	ExecuteStatementCommandOutput,
	RDSDataClient,
	RollbackTransactionCommandInput} from '@aws-sdk/client-rds-data';
import {
	BeginTransactionCommand,
	CommitTransactionCommand,
	ExecuteStatementCommand,
	RollbackTransactionCommand
} from '@aws-sdk/client-rds-data';
import type { Logger } from '~/logger';
import type { PgDialect, PreparedQueryConfig, QueryResultHKT } from '~/pg-core';
import { PgSession, PreparedQuery } from '~/pg-core';
import type { SelectFieldsOrdered } from '~/pg-core/query-builders/select.types';
import type { Query, QueryTypingsValue, SQL } from '~/sql';
import { fillPlaceholders } from '~/sql';
import { mapResultRow } from '~/utils';
import { getValueFromDataApi, toValueParam } from '../common';

export type AwsDataApiClient = RDSDataClient;

export class AwsDataApiPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	private rawQuery: ExecuteStatementCommand;

	constructor(
		private client: AwsDataApiClient,
		queryString: string,
		private params: unknown[],
		private typings: QueryTypingsValue[],
		private options: AwsDataApiSessionOptions,
		private fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
		transactionId: string | undefined,
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
		const params = fillPlaceholders(this.params, placeholderValues);

		this.rawQuery.input.parameters = params.map((param, index) => ({
			name: `${index + 1}`,
			...toValueParam(param, this.typings[index]),
		}));

		this.options.logger?.logQuery(this.rawQuery.input.sql!, this.rawQuery.input.parameters);

		const { fields } = this;
		if (!fields) {
			return await this.client.send(this.rawQuery);
		}

		const result = await this.client.send(this.rawQuery);

		return result.records?.map((result) => {
			const mappedResult = result.map((res) => getValueFromDataApi(res));
			return mapResultRow<T['execute']>(fields, mappedResult, this.joinsNotNullableMap);
		});
	}

	all(placeholderValues?: Record<string, unknown> | undefined): Promise<T['all']> {
		throw new Error('Method not implemented.');
	}

	values(placeholderValues?: Record<string, unknown> | undefined): Promise<T['values']> {
		throw new Error('Method not implemented.');
	}
}

export interface AwsDataApiSessionOptions {
	logger?: Logger;
	database: string;
	resourceArn: string;
	secretArn: string;
}

export class AwsDataApiSession extends PgSession {
	private rawQuery: BeginTransactionCommandInput | CommitTransactionCommandInput | RollbackTransactionCommandInput;

	constructor(
		private client: AwsDataApiClient,
		dialect: PgDialect,
		private options: AwsDataApiSessionOptions,
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
		fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
	): PreparedQuery<T> {
		return new AwsDataApiPreparedQuery(
			this.client,
			query.sql,
			query.params,
			query.typings ?? [],
			this.options,
			fields,
			name,
			undefined,
		);
	}

	prepareQueryWithTransaction<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
		transactionId: string | undefined,
	): PreparedQuery<T> {
		return new AwsDataApiPreparedQuery(
			this.client,
			query.sql,
			query.params,
			query.typings ?? [],
			this.options,
			fields,
			name,
			transactionId,
		);
	}

	executeWithTransaction<T>(query: SQL, transactionId: string | undefined): Promise<T> {
		return this.prepareQueryWithTransaction<PreparedQueryConfig & { execute: T }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			transactionId,
		).execute();
	}

	override execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
		).execute();
	}

	async beginTransaction(): Promise<string | undefined> {
		const transactionRes = await this.client.send(new BeginTransactionCommand(this.rawQuery));
		return transactionRes.transactionId;
	}

	async commitTransaction(transactionId: string): Promise<void> {
		await this.client.send(new CommitTransactionCommand({ ...this.rawQuery, transactionId }));
	}

	async rollbackTransaction(transactionId: string): Promise<void> {
		await this.client.send(new RollbackTransactionCommand({ ...this.rawQuery, transactionId }));
	}
}

export interface AwsDataApiPgQueryResultHKT extends QueryResultHKT {
	type: ExecuteStatementCommandOutput;
}
