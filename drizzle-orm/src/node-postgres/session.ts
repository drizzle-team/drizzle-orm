import type { Client, PoolClient, QueryArrayConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import pg from 'pg';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

const { Pool } = pg;

export type NodePgClient = pg.Pool | PoolClient | Client;

export class NodePgPreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
	static readonly [entityKind]: string = 'NodePgPreparedQuery';

	private rawQueryConfig: QueryConfig;
	private queryConfig: QueryArrayConfig;

	constructor(
		private client: NodePgClient,
		queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super({ sql: queryString, params });
		this.rawQueryConfig = {
			name,
			text: queryString,
		};
		this.queryConfig = {
			name,
			text: queryString,
			rowMode: 'array',
		};
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async () => {
			const params = fillPlaceholders(this.params, placeholderValues);

			this.logger.logQuery(this.rawQueryConfig.text, params);

			const { fields, rawQueryConfig: rawQuery, client, queryConfig: query, joinsNotNullableMap, customResultMapper } =
				this;
			if (!fields && !customResultMapper) {
				return tracer.startActiveSpan('drizzle.driver.execute', async (span) => {
					span?.setAttributes({
						'drizzle.query.name': rawQuery.name,
						'drizzle.query.text': rawQuery.text,
						'drizzle.query.params': JSON.stringify(params),
					});
					return client.query(rawQuery, params);
				});
			}

			const result = await tracer.startActiveSpan('drizzle.driver.execute', (span) => {
				span?.setAttributes({
					'drizzle.query.name': query.name,
					'drizzle.query.text': query.text,
					'drizzle.query.params': JSON.stringify(params),
				});
				return client.query(query, params);
			});

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return customResultMapper
					? customResultMapper(result.rows)
					: result.rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
			});
		});
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		return tracer.startActiveSpan('drizzle.execute', () => {
			const params = fillPlaceholders(this.params, placeholderValues);
			this.logger.logQuery(this.rawQueryConfig.text, params);
			return tracer.startActiveSpan('drizzle.driver.execute', (span) => {
				span?.setAttributes({
					'drizzle.query.name': this.rawQueryConfig.name,
					'drizzle.query.text': this.rawQueryConfig.text,
					'drizzle.query.params': JSON.stringify(params),
				});
				return this.client.query(this.rawQueryConfig, params).then((result) => result.rows);
			});
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface NodePgSessionOptions {
	logger?: Logger;
}

export class NodePgSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<NodePgQueryResultHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'NodePgSession';

	private logger: Logger;

	constructor(
		private client: NodePgClient,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: NodePgSessionOptions = {},
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
		return new NodePgPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			name,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	override async transaction<T>(
		transaction: (tx: NodePgTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		const session = this.client instanceof Pool // eslint-disable-line no-instanceof/no-instanceof
			? new NodePgSession(await this.client.connect(), this.dialect, this.schema, this.options)
			: this;
		const tx = new NodePgTransaction(this.dialect, session, this.schema);
		await tx.execute(sql`begin${config ? sql` ${tx.getTransactionConfigSQL(config)}` : undefined}`);
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			await tx.execute(sql`rollback`);
			throw error;
		} finally {
			if (this.client instanceof Pool) { // eslint-disable-line no-instanceof/no-instanceof
				(session.client as PoolClient).release();
			}
		}
	}
}

export class NodePgTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<NodePgQueryResultHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'NodePgTransaction';

	override async transaction<T>(transaction: (tx: NodePgTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodePgTransaction(this.dialect, this.session, this.schema, this.nestedIndex + 1);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export interface NodePgQueryResultHKT extends QueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
