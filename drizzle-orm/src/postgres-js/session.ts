import type { Row, RowList, Sql, TransactionSql } from 'postgres';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session.ts';
import { PgSession, PreparedQuery } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export class PostgresJsPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	static readonly [entityKind]: string = 'PostgresJsPreparedQuery';

	constructor(
		private client: Sql,
		private query: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super();
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(this.params, placeholderValues);

			span?.setAttributes({
				'drizzle.query.text': this.query,
				'drizzle.query.params': JSON.stringify(params),
			});

			this.logger.logQuery(this.query, params);

			const { fields, query, client, joinsNotNullableMap, customResultMapper } = this;
			if (!fields && !customResultMapper) {
				return tracer.startActiveSpan('drizzle.driver.execute', () => {
					return client.unsafe(query, params as any[]);
				});
			}

			const rows = await tracer.startActiveSpan('drizzle.driver.execute', () => {
				span?.setAttributes({
					'drizzle.query.text': query,
					'drizzle.query.params': JSON.stringify(params),
				});

				return client.unsafe(query, params as any[]).values();
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
				'drizzle.query.text': this.query,
				'drizzle.query.params': JSON.stringify(params),
			});
			this.logger.logQuery(this.query, params);
			return tracer.startActiveSpan('drizzle.driver.execute', () => {
				span?.setAttributes({
					'drizzle.query.text': this.query,
					'drizzle.query.params': JSON.stringify(params),
				});
				return this.client.unsafe(this.query, params as any[]);
			});
		});
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
	static readonly [entityKind]: string = 'PostgresJsSession';

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
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PreparedQuery<T> {
		return new PostgresJsPreparedQuery(this.client, query.sql, query.params, this.logger, fields, customResultMapper);
	}

	query(query: string, params: unknown[]): Promise<RowList<Row[]>> {
		this.logger.logQuery(query, params);
		return this.client.unsafe(query, params as any[]).values();
	}

	queryObjects<T extends Row>(
		query: string,
		params: unknown[],
	): Promise<RowList<T[]>> {
		return this.client.unsafe(query, params as any[]);
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
	static readonly [entityKind]: string = 'PostgresJsTransaction';

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
			const session = new PostgresJsSession(client, this.dialect, this.schema, this.session.options);
			const tx = new PostgresJsTransaction(this.dialect, session, this.schema);
			return transaction(tx);
		}) as Promise<T>;
	}
}

export interface PostgresJsQueryResultHKT extends QueryResultHKT {
	type: RowList<Assume<this['row'], Row>[]>;
}
