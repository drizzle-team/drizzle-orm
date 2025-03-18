import type { Client, PoolClient, QueryArrayConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import pg from 'pg';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

const { Pool, types } = pg;

export type NodePgClient = pg.Pool | PoolClient | Client;

export class NodePgPreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
	static override readonly [entityKind]: string = 'NodePgPreparedQuery';

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
		private signal?: AbortSignal,
	) {
		super({ sql: queryString, params });
		this.rawQueryConfig = {
			name,
			text: queryString,
			types: {
				// @ts-ignore
				getTypeParser: (typeId, format) => {
					if (typeId === types.builtins.TIMESTAMPTZ) {
						return (val) => val;
					}
					if (typeId === types.builtins.TIMESTAMP) {
						return (val) => val;
					}
					if (typeId === types.builtins.DATE) {
						return (val) => val;
					}
					if (typeId === types.builtins.INTERVAL) {
						return (val) => val;
					}
					// @ts-ignore
					return types.getTypeParser(typeId, format);
				},
			},
		};
		this.queryConfig = {
			name,
			text: queryString,
			rowMode: 'array',
			types: {
				// @ts-ignore
				getTypeParser: (typeId, format) => {
					if (typeId === types.builtins.TIMESTAMPTZ) {
						return (val) => val;
					}
					if (typeId === types.builtins.TIMESTAMP) {
						return (val) => val;
					}
					if (typeId === types.builtins.DATE) {
						return (val) => val;
					}
					if (typeId === types.builtins.INTERVAL) {
						return (val) => val;
					}
					// @ts-ignore
					return types.getTypeParser(typeId, format);
				},
			},
		};
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async () => {
			try {
				this.signal?.throwIfAborted();
			} catch (e) {
				// Create new error to capture stack trace
				throw new Error('PostgreSQL connection experienced an error or has been closed', { cause: e });
			}

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
	static override readonly [entityKind]: string = 'NodePgSession';

	private abortController = new AbortController();
	private errorCallback = (err: unknown) => {
		this.abortController.abort(err);
	};

	private logger: Logger;

	constructor(
		private client: NodePgClient,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: NodePgSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.client.on('error', this.errorCallback);
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
			this.abortController.signal,
		);
	}

	override async transaction<T>(
		transaction: (tx: NodePgTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		const session = this.client instanceof Pool // eslint-disable-line no-instanceof/no-instanceof
			? new NodePgSession(await this.client.connect(), this.dialect, this.schema, this.options)
			: this;
		const tx = new NodePgTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema);
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
				session.end();
				(session.client as PoolClient).release();
			}
		}
	}

	override async count(sql: SQL): Promise<number> {
		const res = await this.execute<{ rows: [{ count: string }] }>(sql);
		return Number(
			res['rows'][0]['count'],
		);
	}

	end(): void {
		this.client.off('error', this.errorCallback);
		this.abortController.abort();
	}
}

export class NodePgTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<NodePgQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodePgTransaction';

	override async transaction<T>(transaction: (tx: NodePgTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodePgTransaction<TFullSchema, TSchema>(
			this.dialect,
			this.session,
			this.schema,
			this.nestedIndex + 1,
		);
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

export interface NodePgQueryResultHKT extends PgQueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
