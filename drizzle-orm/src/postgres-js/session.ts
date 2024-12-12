import type { Row, RowList, Sql, TransactionSql } from 'postgres';
import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { AnyRelations, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export class PostgresJsPreparedQuery<
	T extends PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends PgPreparedQuery<T> {
	static override readonly [entityKind]: string = 'PostgresJsPreparedQuery';

	constructor(
		private client: Sql,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		private isRqbV2Query?: TIsRqbV2,
	) {
		super({ sql: queryString, params });
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(this.params, placeholderValues);

			span?.setAttributes({
				'drizzle.query.text': this.queryString,
				'drizzle.query.params': JSON.stringify(params),
			});

			this.logger.logQuery(this.queryString, params);

			const { fields, queryString: query, client, joinsNotNullableMap, customResultMapper } = this;
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
					? (customResultMapper as (rows: unknown[][]) => T['execute'])(rows)
					: rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
			});
		});
	}

	private async executeRqbV2(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(this.params, placeholderValues);

			span?.setAttributes({
				'drizzle.query.text': this.queryString,
				'drizzle.query.params': JSON.stringify(params),
			});

			this.logger.logQuery(this.queryString, params);

			const { queryString: query, client, customResultMapper } = this;

			const rows = await tracer.startActiveSpan('drizzle.driver.execute', () => {
				span?.setAttributes({
					'drizzle.query.text': query,
					'drizzle.query.params': JSON.stringify(params),
				});

				return client.unsafe(query, params as any[]);
			});

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(rows);
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
			this.logger.logQuery(this.queryString, params);
			return tracer.startActiveSpan('drizzle.driver.execute', () => {
				span?.setAttributes({
					'drizzle.query.text': this.queryString,
					'drizzle.query.params': JSON.stringify(params),
				});
				return this.client.unsafe(this.queryString, params as any[]);
			});
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
	TRelations extends AnyRelations,
	TTablesConfig extends TablesRelationalConfig,
	TSchema extends V1.TablesRelationalConfig,
> extends PgSession<PostgresJsQueryResultHKT, TFullSchema, TRelations, TTablesConfig, TSchema> {
	static override readonly [entityKind]: string = 'PostgresJsSession';

	logger: Logger;

	constructor(
		public client: TSQL,
		dialect: PgDialect,
		private relations: AnyRelations | undefined,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
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

	prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (rows: Record<string, unknown>[]) => T['execute'],
	): PgPreparedQuery<T> {
		return new PostgresJsPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			false,
			customResultMapper,
			true,
		);
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
		transaction: (tx: PostgresJsTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.client.begin(async (client) => {
			const session = new PostgresJsSession<TransactionSql, TFullSchema, TRelations, TTablesConfig, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				this.options,
			);
			const tx = new PostgresJsTransaction(this.dialect, session, this.schema, this.relations);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class PostgresJsTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TTablesConfig extends TablesRelationalConfig,
	TSchema extends V1.TablesRelationalConfig,
> extends PgTransaction<PostgresJsQueryResultHKT, TFullSchema, TRelations, TTablesConfig, TSchema> {
	static override readonly [entityKind]: string = 'PostgresJsTransaction';

	constructor(
		dialect: PgDialect,
		/** @internal */
		override readonly session: PostgresJsSession<TransactionSql, TFullSchema, TRelations, TTablesConfig, TSchema>,
		schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		protected override relations: AnyRelations | undefined,
		nestedIndex = 0,
	) {
		super(dialect, session, relations, schema, nestedIndex);
	}

	override transaction<T>(
		transaction: (tx: PostgresJsTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>) => Promise<T>,
	): Promise<T> {
		return this.session.client.savepoint((client) => {
			const session = new PostgresJsSession<TransactionSql, TFullSchema, TRelations, TTablesConfig, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				this.session.options,
			);
			const tx = new PostgresJsTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>(
				this.dialect,
				session,
				this.schema,
				this.relations,
			);
			return transaction(tx);
		}) as Promise<T>;
	}
}

export interface PostgresJsQueryResultHKT extends PgQueryResultHKT {
	type: RowList<Assume<this['row'], Row>[]>;
}
