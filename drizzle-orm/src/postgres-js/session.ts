import client from 'postgres';
import type { Row, RowList, Sql, TransactionSql } from 'postgres';
import { entityKind } from '~/entity.ts';
import type { ErrorHandler } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgQueryError, PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { trace, PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

const handleError: ErrorHandler = (err, queryString, queryParams, duration) => {
  if (err instanceof client.PostgresError) {
    throw new PgQueryError(err, {
			code: err.code,
			message: err.message,
			file: err.file,
			line: err.line,
			routine: err.routine,
			position: err.position,
			severity: err.severity,
			severityLocal: err.severity_local,
			columnName: err.column_name,
			constraintName: err.constraint_name,
			dataTypeName: err.table_name,
			detail: err.detail,
			hint: err.hint,
			internalPosition: err.internal_position,
			internalQuery: err.internal_query,
			schemaName: err.schema_name,
			tableName: err.table_name,
			where: err.where,
		}, {
			params: queryParams,
			sql: queryString,
			duration
		});
  }
  throw err;
}

export class PostgresJsPreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
	static override readonly [entityKind]: string = 'PostgresJsPreparedQuery';

	constructor(
		private client: Sql,
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
		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(this.params, placeholderValues);

			span?.setAttributes({
				'drizzle.query.text': this.queryString,
				'drizzle.query.params': JSON.stringify(params),
			});

			const { fields, queryString: query, client, joinsNotNullableMap, customResultMapper } = this;
			if (!fields && !customResultMapper) {
				return trace(
					tracer.startActiveSpan('drizzle.driver.execute', () => {
						return client.unsafe(query, params as any[]);
					}),
					this.logger,
					this.queryString,
					params,
					handleError
				);
			}

			const rows = await trace(
				tracer.startActiveSpan('drizzle.driver.execute', () => {
					span?.setAttributes({
						'drizzle.query.text': query,
						'drizzle.query.params': JSON.stringify(params),
					});
	
					return client.unsafe(query, params as any[]).values();
				}),
				this.logger,
				this.queryString,
				params,
				handleError
			);

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return customResultMapper
					? customResultMapper(rows)
					: rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
			});
		});
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(this.params, placeholderValues);
			span?.setAttributes({
				'drizzle.query.text': this.queryString,
				'drizzle.query.params': JSON.stringify(params),
			});
			return await trace(
				tracer.startActiveSpan('drizzle.driver.execute', () => {
					span?.setAttributes({
						'drizzle.query.text': this.queryString,
						'drizzle.query.params': JSON.stringify(params),
					});
					return this.client.unsafe(this.queryString, params as any[]);
				}),
				this.logger,
				this.queryString,
				params,
				handleError
			);
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface PostgresJsSessionOptions {
	logger?: Logger;
}

export class PostgresJsSession<
	TSQL extends Sql,
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<PostgresJsQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'PostgresJsSession';

	logger: Logger;

	constructor(
		public client: TSQL,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		/** @internal */
		readonly options: PostgresJsSessionOptions = {},
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
		return new PostgresJsPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	query(query: string, params: unknown[]): Promise<RowList<Row[]>> {
		return trace(
			this.client.unsafe(query, params as any[]).values(),
			this.logger,
			query,
			params,
			handleError
		);
	}

	queryObjects<T extends Row>(
		query: string,
		params: unknown[],
	): Promise<RowList<T[]>> {
		return trace(
			this.client.unsafe(query, params as any[]),
			this.logger,
			query,
			params,
			handleError
		);
	}

	override transaction<T>(
		transaction: (tx: PostgresJsTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.client.begin(async (client) => {
			const session = new PostgresJsSession<TransactionSql, TFullSchema, TSchema>(
				client,
				this.dialect,
				this.schema,
				this.options,
			);
			const tx = new PostgresJsTransaction(this.dialect, session, this.schema);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class PostgresJsTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<PostgresJsQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'PostgresJsTransaction';

	constructor(
		dialect: PgDialect,
		/** @internal */
		override readonly session: PostgresJsSession<TransactionSql, TFullSchema, TSchema>,
		schema: RelationalSchemaConfig<TSchema> | undefined,
		nestedIndex = 0,
	) {
		super(dialect, session, schema, nestedIndex);
	}

	override transaction<T>(
		transaction: (tx: PostgresJsTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		return this.session.client.savepoint((client) => {
			const session = new PostgresJsSession<TransactionSql, TFullSchema, TSchema>(
				client,
				this.dialect,
				this.schema,
				this.session.options,
			);
			const tx = new PostgresJsTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema);
			return transaction(tx);
		}) as Promise<T>;
	}
}

export interface PostgresJsQueryResultHKT extends PgQueryResultHKT {
	type: RowList<Assume<this['row'], Row>[]>;
}
