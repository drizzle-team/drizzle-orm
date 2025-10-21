import type { Client, PoolClient, QueryArrayConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import pg from 'pg';
import type * as V1 from '~/_relations.ts';
import type { CockroachDialect } from '~/cockroach-core/dialect.ts';
import { CockroachTransaction } from '~/cockroach-core/index.ts';
import type { SelectedFieldsOrdered } from '~/cockroach-core/query-builders/select.types.ts';
import type {
	CockroachQueryResultHKT,
	CockroachTransactionConfig,
	PreparedQueryConfig,
} from '~/cockroach-core/session.ts';
import { CockroachPreparedQuery, CockroachSession } from '~/cockroach-core/session.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

const { Pool, types } = pg;

export type NodeCockroachClient = pg.Pool | PoolClient | Client;

export class NodeCockroachPreparedQuery<T extends PreparedQueryConfig> extends CockroachPreparedQuery<T> {
	static override readonly [entityKind]: string = 'NodeCockroachPreparedQuery';

	private rawQueryConfig: QueryConfig;
	private queryConfig: QueryArrayConfig;

	constructor(
		private client: NodeCockroachClient,
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

export interface NodeCockroachSessionOptions {
	logger?: Logger;
}

export class NodeCockroachSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends V1.TablesRelationalConfig,
> extends CockroachSession<NodeCockroachQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodeCockroachSession';

	private logger: Logger;

	constructor(
		private client: NodeCockroachClient,
		dialect: CockroachDialect,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: NodeCockroachSessionOptions = {},
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
	): CockroachPreparedQuery<T> {
		return new NodeCockroachPreparedQuery(
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
		transaction: (tx: NodeCockroachTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: CockroachTransactionConfig | undefined,
	): Promise<T> {
		const session = this.client instanceof Pool // oxlint-disable-line drizzle-internal/no-instanceof
			? new NodeCockroachSession(await this.client.connect(), this.dialect, this.schema, this.options)
			: this;
		const tx = new NodeCockroachTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema);
		await tx.execute(sql`begin${config ? sql` ${tx.getTransactionConfigSQL(config)}` : undefined}`);
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			await tx.execute(sql`rollback`);
			throw error;
		} finally {
			if (this.client instanceof Pool) { // oxlint-disable-line drizzle-internal/no-instanceof
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

export class NodeCockroachTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends V1.TablesRelationalConfig,
> extends CockroachTransaction<NodeCockroachQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodeCockroachTransaction';

	override async transaction<T>(
		transaction: (tx: NodeCockroachTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodeCockroachTransaction<TFullSchema, TSchema>(
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

export interface NodeCockroachQueryResultHKT extends CockroachQueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
