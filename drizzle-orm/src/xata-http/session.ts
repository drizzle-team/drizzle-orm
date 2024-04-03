import type { SQLPluginResult, SQLQueryResult } from '@xata.io/client';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { mapResultRow } from '~/utils.ts';

export type XataHttpClient = {
	sql: SQLPluginResult;
};

export interface QueryResults<ArrayMode extends 'json' | 'array'> {
	rowCount: number;
	rows: ArrayMode extends 'array' ? any[][] : Record<string, any>[];
	rowAsArray: ArrayMode extends 'array' ? true : false;
}

export class XataHttpPreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
	static readonly [entityKind]: string = 'XataHttpPreparedQuery';

	constructor(
		private client: XataHttpClient,
		query: Query,
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super(query);
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.query.params, placeholderValues);

		this.logger.logQuery(this.query.sql, params);

		const { fields, client, query, customResultMapper, joinsNotNullableMap } = this;

		if (!fields && !customResultMapper) {
			return await client.sql<Record<string, any>>({ statement: query.sql, params });
			// return { rowCount: result.records.length, rows: result.records, rowAsArray: false };
		}

		const { rows, warning } = await client.sql({ statement: query.sql, params, responseType: 'array' });
		if (warning) console.warn(warning);

		return customResultMapper
			? customResultMapper(rows as unknown[][])
			: rows.map((row) => mapResultRow<T['execute']>(fields!, row as unknown[], joinsNotNullableMap));
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.query.params, placeholderValues);
		this.logger.logQuery(this.query.sql, params);
		return this.client.sql({ statement: this.query.sql, params, responseType: 'array' }).then((result) => result.rows);
	}

	values(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['values']> {
		const params = fillPlaceholders(this.query.params, placeholderValues);
		this.logger.logQuery(this.query.sql, params);
		return this.client.sql({ statement: this.query.sql, params }).then((result) => result.records);
	}

	/** @internal */
	isResponseInArrayMode() {
		return this._isResponseInArrayMode;
	}
}

export interface XataHttpSessionOptions {
	logger?: Logger;
}

export class XataHttpSession<TFullSchema extends Record<string, unknown>, TSchema extends TablesRelationalConfig>
	extends PgSession<
		XataHttpQueryResultHKT,
		TFullSchema,
		TSchema
	>
{
	static readonly [entityKind]: string = 'XataHttpSession';

	private logger: Logger;

	constructor(
		private client: XataHttpClient,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: XataHttpSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PgPreparedQuery<T> {
		return new XataHttpPreparedQuery(
			this.client,
			query,
			this.logger,
			fields,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	async query(query: string, params: unknown[]): Promise<QueryResults<'array'>> {
		this.logger.logQuery(query, params);
		const result = await this.client.sql({ statement: query, params, responseType: 'array' });

		return {
			rowCount: result.rows.length,
			rows: result.rows,
			rowAsArray: true,
		};
	}

	async queryObjects(query: string, params: unknown[]): Promise<QueryResults<'json'>> {
		const result = await this.client.sql<Record<string, any>>({ statement: query, params });

		return {
			rowCount: result.records.length,
			rows: result.records,
			rowAsArray: false,
		};
	}

	override async transaction<T>(
		_transaction: (tx: XataTransaction<TFullSchema, TSchema>) => Promise<T>,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_config: PgTransactionConfig = {},
	): Promise<T> {
		throw new Error('No transactions support in Xata Http driver');
	}
}

export class XataTransaction<TFullSchema extends Record<string, unknown>, TSchema extends TablesRelationalConfig>
	extends PgTransaction<
		XataHttpQueryResultHKT,
		TFullSchema,
		TSchema
	>
{
	static readonly [entityKind]: string = 'XataHttpTransaction';

	override async transaction<T>(_transaction: (tx: XataTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		throw new Error('No transactions support in Xata Http driver');
	}
}

export interface XataHttpQueryResultHKT extends QueryResultHKT {
	type: SQLQueryResult<this['row']>;
}
