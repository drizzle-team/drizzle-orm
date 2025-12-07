import type { BigQuery, Query, QueryRowsResponse } from '@google-cloud/bigquery';
import type { BigQueryDialect } from '~/bigquery-core/dialect.ts';
import { BigQueryDatabase, BigQueryTransaction } from '~/bigquery-core/index.ts';
import type { SelectedFieldsOrdered } from '~/bigquery-core/query-builders/select.types.ts';
import type { BigQueryTransactionConfig, PreparedQueryConfig } from '~/bigquery-core/session.ts';
import { BigQueryPreparedQuery, BigQuerySession } from '~/bigquery-core/session.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query as DrizzleQuery, SQL, sql } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { mapResultRow } from '~/utils.ts';

export class BigQueryClientPreparedQuery<T extends PreparedQueryConfig> extends BigQueryPreparedQuery<T> {
	static override readonly [entityKind]: string = 'BigQueryClientPreparedQuery';

	constructor(
		private client: BigQuery,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super({ sql: queryString, params });
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async () => {
			const params = fillPlaceholders(this.params, placeholderValues);

			this.logger.logQuery(this.queryString, params);

			const { fields, client, queryString, joinsNotNullableMap, customResultMapper } = this;

			const options = {
				query: queryString,
				params: params,
			};

			if (!fields && !customResultMapper) {
				return tracer.startActiveSpan('drizzle.driver.execute', async (span) => {
					span?.setAttributes({
						'drizzle.query.text': queryString,
						'drizzle.query.params': JSON.stringify(params),
					});
					const [rows] = await client.query(options);
					return rows;
				});
			}

			const result = await tracer.startActiveSpan('drizzle.driver.execute', async (span) => {
				span?.setAttributes({
					'drizzle.query.text': queryString,
					'drizzle.query.params': JSON.stringify(params),
				});
				const [rows] = await client.query(options);
				return rows;
			});

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				if (customResultMapper) {
					return customResultMapper(result as unknown[][]);
				}
				return result.map((row: Record<string, unknown>) => {
					// BigQuery returns objects with keys in SELECT order
					// For columns, use the column name; for SQL expressions without aliases,
					// BigQuery uses auto-generated names like f0_, f1_, etc.
					const rowKeys = Object.keys(row);
					const values = fields!.map((f, index) => {
						const field = f.field;
						let key: string;
						if (is(field, Column)) {
							key = field.name;
						} else if (is(field, SQL.Aliased)) {
							key = field.fieldAlias;
						} else {
							// For unaliased SQL expressions, BigQuery uses positional keys like f0_, f1_, etc.
							// Try the path name first, then fall back to positional key
							const pathKey = f.path[f.path.length - 1]!;
							if (pathKey in row) {
								key = pathKey;
							} else {
								// Use positional key - BigQuery names unaliased columns as f0_, f1_, etc.
								key = rowKeys[index] ?? `f${index}_`;
							}
						}
						return row[key];
					});
					return mapResultRow<T['execute']>(fields!, values, joinsNotNullableMap);
				});
			});
		});
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		return tracer.startActiveSpan('drizzle.execute', async () => {
			const params = fillPlaceholders(this.params, placeholderValues);
			this.logger.logQuery(this.queryString, params);
			return tracer.startActiveSpan('drizzle.driver.execute', async (span) => {
				span?.setAttributes({
					'drizzle.query.text': this.queryString,
					'drizzle.query.params': JSON.stringify(params),
				});
				const [rows] = await this.client.query({
					query: this.queryString,
					params: params,
				});
				return rows;
			});
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface BigQuerySessionOptions {
	logger?: Logger;
}

export class BigQueryClientSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends BigQuerySession<BigQueryQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'BigQueryClientSession';

	private logger: Logger;

	constructor(
		private client: BigQuery,
		dialect: BigQueryDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: BigQuerySessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: DrizzleQuery,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): BigQueryPreparedQuery<T> {
		return new BigQueryClientPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	override async transaction<T>(
		transaction: (tx: BigQueryClientTransaction<TFullSchema, TSchema>) => Promise<T>,
		_config?: BigQueryTransactionConfig,
	): Promise<T> {
		const tx = new BigQueryClientTransaction<TFullSchema, TSchema>(
			this.dialect,
			this,
			this.schema,
		);

		// BigQuery uses multi-statement transactions
		await this.execute(sql`BEGIN TRANSACTION`);
		try {
			const result = await transaction(tx);
			await this.execute(sql`COMMIT TRANSACTION`);
			return result;
		} catch (error) {
			await this.execute(sql`ROLLBACK TRANSACTION`);
			throw error;
		}
	}

	override async count(sqlQuery: import('~/sql/sql.ts').SQL): Promise<number> {
		const res = await this.execute<{ f0_: number }[]>(sqlQuery);
		return Number(res[0]?.['f0_'] ?? 0);
	}
}

export class BigQueryClientTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends BigQueryTransaction<BigQueryQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'BigQueryClientTransaction';

	override async transaction<T>(
		transaction: (tx: BigQueryClientTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		// BigQuery doesn't support nested transactions/savepoints in the same way as other databases
		// For now, just execute the nested transaction in the same context
		const tx = new BigQueryClientTransaction<TFullSchema, TSchema>(
			this.dialect,
			this.session,
			this.schema,
			this.nestedIndex + 1,
		);
		return await transaction(tx);
	}
}

export interface BigQueryQueryResultHKT {
	readonly $brand: 'BigQueryQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown[];
}

export type BigQueryQueryResult<T = unknown> = T[];
