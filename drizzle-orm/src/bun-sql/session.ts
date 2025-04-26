/// <reference types="bun-types" />

import type { SavepointSQL, SQL, TransactionSQL } from 'bun';
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

export class BunSQLPreparedQuery<T extends PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends PgPreparedQuery<T>
{
	static override readonly [entityKind]: string = 'BunSQLPreparedQuery';

	constructor(
		private client: SQL,
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

			const rows: any[] = await tracer.startActiveSpan('drizzle.driver.execute', () => {
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

	async executeRqbV2(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
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

export interface BunSQLSessionOptions {
	logger?: Logger;
}

export class BunSQLSession<
	TSQL extends SQL,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TTablesConfig extends TablesRelationalConfig,
	TSchema extends V1.TablesRelationalConfig,
> extends PgSession<BunSQLQueryResultHKT, TFullSchema, TRelations, TTablesConfig, TSchema> {
	static override readonly [entityKind]: string = 'BunSQLSession';

	logger: Logger;

	constructor(
		public client: TSQL,
		dialect: PgDialect,
		private relations: AnyRelations | undefined,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		/** @internal */
		readonly options: BunSQLSessionOptions = {},
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
		return new BunSQLPreparedQuery(
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
		customResultMapper?: (rows: Record<string, unknown>[]) => T['execute'],
	): PgPreparedQuery<T> {
		return new BunSQLPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			true,
			customResultMapper,
			true,
		);
	}

	query(query: string, params: unknown[]): Promise<any> {
		this.logger.logQuery(query, params);
		return this.client.unsafe(query, params as any[]).values();
	}

	queryObjects(
		query: string,
		params: unknown[],
	): Promise<any> {
		return this.client.unsafe(query, params as any[]);
	}

	override transaction<T>(
		transaction: (tx: BunSQLTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.client.begin(async (client) => {
			const session = new BunSQLSession<TransactionSQL, TFullSchema, TRelations, TTablesConfig, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				this.options,
			);
			const tx = new BunSQLTransaction(this.dialect, session, this.relations, this.schema);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class BunSQLTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TTablesConfig extends TablesRelationalConfig,
	TSchema extends V1.TablesRelationalConfig,
> extends PgTransaction<BunSQLQueryResultHKT, TFullSchema, TRelations, TTablesConfig, TSchema> {
	static override readonly [entityKind]: string = 'BunSQLTransaction';

	constructor(
		dialect: PgDialect,
		/** @internal */
		override readonly session: BunSQLSession<
			TransactionSQL | SavepointSQL,
			TFullSchema,
			TRelations,
			TTablesConfig,
			TSchema
		>,
		relations: AnyRelations | undefined,
		schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		nestedIndex = 0,
	) {
		super(dialect, session, relations, schema, nestedIndex);
	}

	override transaction<T>(
		transaction: (tx: BunSQLTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>) => Promise<T>,
	): Promise<T> {
		return (this.session.client as TransactionSQL).savepoint((client) => {
			const session = new BunSQLSession<SavepointSQL, TFullSchema, TRelations, TTablesConfig, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				this.session.options,
			);
			const tx = new BunSQLTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>(
				this.dialect,
				session,
				this.relations,
				this.schema,
			);
			return transaction(tx);
		}) as Promise<T>;
	}
}

export interface BunSQLQueryResultHKT extends PgQueryResultHKT {
	type: Assume<this['row'], Record<string, any>[]>;
}
