import {
	BeginTransactionCommand,
	BeginTransactionCommandInput,
	CommitTransactionCommand,
	CommitTransactionCommandInput,
	ExecuteStatementCommand,
	ExecuteStatementRequest,
	Field,
	RDSDataClient,
	RollbackTransactionCommand,
	RollbackTransactionCommandInput,
} from '@aws-sdk/client-rds-data';
import { Logger } from 'drizzle-orm';
import { fillPlaceholders, Query, SQL } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { PgDialect } from '~/dialect';
import { SelectFieldsOrdered } from '~/operations';
import { PgSession, PreparedQuery, PreparedQueryConfig } from '~/session';

export type AwsDataApiClient = RDSDataClient;

export class AwsDataApiPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	private rawQuery: ExecuteStatementCommand;

	constructor(
		private client: AwsDataApiClient,
		queryString: string,
		private params: unknown[],
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

	private getValueFromDataApi(row: Field) {
		if (typeof row.stringValue !== 'undefined') {
			return row.stringValue;
		} else if (typeof row.booleanValue !== 'undefined') {
			return row.booleanValue;
		} else if (typeof row.doubleValue !== 'undefined') {
			return row.doubleValue;
		} else if (typeof row.isNull !== 'undefined') {
			return null;
		} else if (typeof row.longValue !== 'undefined') {
			return row.longValue;
		} else if (typeof row.blobValue !== 'undefined') {
			return row.blobValue;
		} else if (typeof row.arrayValue !== 'undefined') {
			if (typeof row.arrayValue.stringValues !== 'undefined') {
				return row.arrayValue.stringValues;
			}
			throw Error('Unknown array type');
		} else {
			throw Error('Unknown type');
		}
	}

	private toValueParam(row: any): Field {
		if (typeof row === 'string') {
			return { stringValue: row };
		} else if (typeof row === 'number' && Number.isInteger(row)) {
			return { longValue: row };
		} else if (typeof row === 'number' && !Number.isInteger(row)) {
			return { doubleValue: row };
		} else if (typeof row === 'boolean') {
			return { booleanValue: row };
		} else {
			throw Error('Unknown type');
		}
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.options.logger?.logQuery(this.rawQuery.input.sql!, params);

		this.rawQuery.input.parameters = params.map((param, _) => ({ name: `${_ + 1}`, value: this.toValueParam(param) }));

		const { fields } = this;
		if (!fields) {
			return (await this.client.send(this.rawQuery)).records;
		}

		const result = await this.client.send(this.rawQuery);

		return result.records?.map((result) => {
			const mappedResult = result.map((res) => this.getValueFromDataApi(res));
			return mapResultRow<T['execute']>(fields, mappedResult);
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
		return new AwsDataApiPreparedQuery(this.client, query.sql, query.params, this.options, fields, name, undefined);
	}

	prepareQueryWithTransaction<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
		transactionId: string | undefined,
	): PreparedQuery<T> {
		return new AwsDataApiPreparedQuery(this.client, query.sql, query.params, this.options, fields, name, transactionId);
	}

	executeWithTransaction<T>(query: SQL, transactionId: string | undefined): Promise<T> {
		return this.prepareQueryWithTransaction<PreparedQueryConfig & { execute: T }>(
			query.toQuery({
				escapeName: (num) => {
					return `"${num}"`;
				},
				escapeParam: (num) => {
					return `:${num + 1}`;
				},
			}),
			undefined,
			undefined,
			transactionId,
		).execute();
	}

	override execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
			query.toQuery({
				escapeName: (num) => {
					return `"${num}"`;
				},
				escapeParam: (num) => {
					return `:${num + 1}`;
				},
			}),
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
