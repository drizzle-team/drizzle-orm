
import type { Row, RowList, Sql, TransactionSql } from 'postgres';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';
import { PostgresJsTracer } from './tracer.ts';
import type { TransactionConfig } from '~/session.ts';

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

			const { fields, queryString, client, joinsNotNullableMap, customResultMapper } = this;
			if (!fields && !customResultMapper) {
				const query = client.unsafe(queryString, params as any[]);
				const traced = PostgresJsTracer.traceQuery(
					query,
					this.logger,
					this.queryString,
					params
				);

				return tracer.startActiveSpan('drizzle.driver.execute', () => traced);
			}

			const query = client.unsafe(queryString, params as any[]).values();
			const traced = PostgresJsTracer.traceQuery(
				query,
				this.logger,
				this.queryString,
				params
			);

			const rows = await tracer.startActiveSpan('drizzle.driver.execute', () => {
				span?.setAttributes({
					'drizzle.query.text': queryString,
					'drizzle.query.params': JSON.stringify(params),
				});

				return traced;
			});

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
			return await PostgresJsTracer.traceQuery(
				tracer.startActiveSpan('drizzle.driver.execute', () => {
					span?.setAttributes({
						'drizzle.query.text': this.queryString,
						'drizzle.query.params': JSON.stringify(params),
					});
					return this.client.unsafe(this.queryString, params as any[]);
				}),
				this.logger,
				this.queryString,
				params
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
		return PostgresJsTracer.traceQuery(
			this.client.unsafe(query, params as any[]).values(),
			this.logger,
			query,
			params
		);
	}

	queryObjects<T extends Row>(
		query: string,
		params: unknown[],
	): Promise<RowList<T[]>> {
		return PostgresJsTracer.traceQuery(
			this.client.unsafe(query, params as any[]),
			this.logger,
			query,
			params
		);
	}

	override transaction<T>(
		transaction: (tx: PostgresJsTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		const name = config?.name ?? PostgresJsTracer.generateTransactionName();
		const tx = this.client.begin(async (client) => {
			const session = new PostgresJsSession<TransactionSql, TFullSchema, TSchema>(
				client,
				this.dialect,
				this.schema,
				this.options,
			);
			session.logger.setTransactionName(name);
			
			const tx = new PostgresJsTransaction(this.dialect, session, this.schema);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;

		return PostgresJsTracer.traceTransaction(
			tx,
			this.logger,
			name,
			'transaction'
		);
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
		config?: TransactionConfig,
	): Promise<T> {
		const name = config?.name ?? PostgresJsTracer.generateTransactionName();
		const tx = this.session.client.savepoint((client) => {
			const session = new PostgresJsSession<TransactionSql, TFullSchema, TSchema>(
				client,
				this.dialect,
				this.schema,
				this.session.options,
			);
			session.logger.setTransactionName(name);
			const tx = new PostgresJsTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema);
			return transaction(tx);
		}) as Promise<T>;

		return PostgresJsTracer.traceTransaction(
			tx,
			this.session.logger,
			name,
			'savepoint'
		);
	}
}

export interface PostgresJsQueryResultHKT extends PgQueryResultHKT {
	type: RowList<Assume<this['row'], Row>[]>;
}
