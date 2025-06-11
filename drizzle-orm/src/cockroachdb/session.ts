import type { Client, PoolClient, QueryArrayConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import pg from 'pg';
import type { CockroachDbDialect } from '~/cockroachdb-core/dialect.ts';
import { CockroachDbTransaction } from '~/cockroachdb-core/index.ts';
import type { SelectedFieldsOrdered } from '~/cockroachdb-core/query-builders/select.types.ts';
import type {
	CockroachDbQueryResultHKT,
	CockroachDbTransactionConfig,
	PreparedQueryConfig,
} from '~/cockroachdb-core/session.ts';
import { CockroachDbPreparedQuery, CockroachDbSession } from '~/cockroachdb-core/session.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

const { Pool, types } = pg;

export type NodeCockroachDbClient = pg.Pool | PoolClient | Client;

export class NodeCockroachDbPreparedQuery<T extends PreparedQueryConfig> extends CockroachDbPreparedQuery<T> {
	static override readonly [entityKind]: string = 'NodeCockroachDbPreparedQuery';

	private rawQueryConfig: QueryConfig;
	private queryConfig: QueryArrayConfig;

	constructor(
		private client: NodeCockroachDbClient,
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
			types: {
				// @ts-ignore
				getTypeParser: (typeId, format) => {
					if (typeId === types.builtins.TIMESTAMPTZ) {
						return (val: any) => val;
					}
					if (typeId === types.builtins.TIMESTAMP) {
						return (val: any) => val;
					}
					if (typeId === types.builtins.DATE) {
						return (val: any) => val;
					}
					if (typeId === types.builtins.INTERVAL) {
						return (val: any) => val;
					}
					// numeric[]
					if (typeId as number === 1231) {
						return (val: any) => val;
					}
					// timestamp[]
					if (typeId as number === 1115) {
						return (val: any) => val;
					}
					// timestamp with timezone[]
					if (typeId as number === 1185) {
						return (val: any) => val;
					}
					// interval[]
					if (typeId as number === 1187) {
						return (val: any) => val;
					}
					// date[]
					if (typeId as number === 1182) {
						return (val: any) => val;
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
						return (val: any) => val;
					}
					if (typeId === types.builtins.TIMESTAMP) {
						return (val: any) => val;
					}
					if (typeId === types.builtins.DATE) {
						return (val: any) => val;
					}
					if (typeId === types.builtins.INTERVAL) {
						return (val: any) => val;
					}
					// numeric[]
					if (typeId as number === 1231) {
						return (val: any) => val;
					}
					// timestamp[]
					if (typeId as number === 1115) {
						return (val: any) => val;
					}
					// timestamp with timezone[]
					if (typeId as number === 1185) {
						return (val: any) => val;
					}
					// interval[]
					if (typeId as number === 1187) {
						return (val: any) => val;
					}
					// date[]
					if (typeId as number === 1182) {
						return (val: any) => val;
					}
					// @ts-ignore
					return types.getTypeParser(typeId, format);
				},
			},
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

export interface NodeCockroachDbSessionOptions {
	logger?: Logger;
}

export class NodeCockroachDbSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends CockroachDbSession<NodeCockroachDbQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodeCockroachDbSession';

	private logger: Logger;

	constructor(
		private client: NodeCockroachDbClient,
		dialect: CockroachDbDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: NodeCockroachDbSessionOptions = {},
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
	): CockroachDbPreparedQuery<T> {
		return new NodeCockroachDbPreparedQuery(
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
		transaction: (tx: NodeCockroachDbTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: CockroachDbTransactionConfig | undefined,
	): Promise<T> {
		const session = this.client instanceof Pool // eslint-disable-line no-instanceof/no-instanceof
			? new NodeCockroachDbSession(await this.client.connect(), this.dialect, this.schema, this.options)
			: this;
		const tx = new NodeCockroachDbTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema);
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

	override async count(sql: SQL): Promise<number> {
		const res = await this.execute<{ rows: [{ count: string }] }>(sql);
		return Number(
			res['rows'][0]['count'],
		);
	}
}

export class NodeCockroachDbTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends CockroachDbTransaction<NodeCockroachDbQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodeCockroachDbTransaction';

	override async transaction<T>(
		transaction: (tx: NodeCockroachDbTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodeCockroachDbTransaction<TFullSchema, TSchema>(
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

export interface NodeCockroachDbQueryResultHKT extends CockroachDbQueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
