import type { Span } from '@opentelemetry/api';
import type { Client, PoolClient, QueryArrayConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import pg from 'pg';
import Cursor from 'pg-cursor';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session.ts';
import { PgSession, PreparedQuery } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { SelectAsyncGenerator } from '~/select-iterator';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

const { Pool } = pg;

export type NodePgClient = pg.Pool | PoolClient | Client;

export class NodePgPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	static readonly [entityKind]: string = 'NodePgPreparedQuery';

	private rawQuery: QueryConfig;
	private query: QueryArrayConfig;

	constructor(
		private client: NodePgClient,
		queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super();
		this.rawQuery = {
			name,
			text: queryString,
		};
		this.query = {
			name,
			text: queryString,
			rowMode: 'array',
		};
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async () => {
			const params = fillPlaceholders(this.params, placeholderValues);

			this.logger.logQuery(this.rawQuery.text, params);

			const { fields, rawQuery, client, query, joinsNotNullableMap, customResultMapper } = this;
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

	override iterator(span?: Span): SelectAsyncGenerator<T['iterator']> {
		const params = fillPlaceholders(this.params, {});
		this.logger.logQuery(this.rawQuery.text, params);
		if (!this.fields && !this.customResultMapper) {
			throw new Error('no fields or customResultMapper')
		}
		return new NodePgSelectIterator<T['iterator']>(span, this.client, this.query, params, this.fields,
			this.customResultMapper as () => T['iterator'][], this.joinsNotNullableMap);
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		return tracer.startActiveSpan('drizzle.execute', () => {
			const params = fillPlaceholders(this.params, placeholderValues);
			this.logger.logQuery(this.rawQuery.text, params);
			return tracer.startActiveSpan('drizzle.driver.execute', (span) => {
				span?.setAttributes({
					'drizzle.query.name': this.rawQuery.name,
					'drizzle.query.text': this.rawQuery.text,
					'drizzle.query.params': JSON.stringify(params),
				});
				return this.client.query(this.rawQuery, params).then((result) => result.rows);
			});
		});
	}
}


// eslint-disable-next-line drizzle/require-entity-kind
class NodePgSelectIterator<T> implements AsyncGenerator<T> {
	needConnect = true
	// the 100 has to be configurable
	readonly chunkSize = 100
	rows: unknown[][] = []
	pclient?: PoolClient
	cursor?: Cursor
	pClient?: PoolClient
	readonly span?: Span
	readonly params: unknown[]
	readonly query: QueryArrayConfig
	readonly client: NodePgClient

	readonly customResultMapper: (rows: unknown[][]) => T[] | undefined
	readonly fields?: SelectedFieldsOrdered
	readonly joinsNotNullableMap?: Record<string, boolean>

	constructor(
		span: Span|undefined,
		client: NodePgClient,
		query: QueryArrayConfig,
		params: unknown[],
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper: (rows: unknown[][]) => T[] | undefined,
		joinsNotNullableMap: Record<string, boolean> | undefined) {
		this.span = span
		this.client = client
		this.params = params
		this.query = query
		this.fields = fields
		this.customResultMapper = customResultMapper
		this.joinsNotNullableMap = joinsNotNullableMap
	}
	async next(): Promise<IteratorResult<T>>  {
		if (this.needConnect) {
			await tracer.startActiveSpan('drizzle.driver.iterator', async (span) => {
				span?.setAttributes({
					'drizzle.query.name': this.query.name,
					'drizzle.query.text': this.query.text,
					'drizzle.query.params': JSON.stringify(this.params),
				});
				this.pClient = this.client as PoolClient
				const qcursor = new Cursor(this.query.text, this.params, this.query)
				this.cursor = this.pClient.query(qcursor);
				this.needConnect = false
			})
		}

		if (this.rows.length === 0) {
			const dbRows = await this.cursor!.read(this.chunkSize)
			if (dbRows.length === 0) {
				await this.cursor!.close()
				// this.pClient!.release()
				this.span?.end()
				return { done: true, value: undefined }
			}
			this.rows = tracer.startActiveSpan('drizzle.mapResponse', () => {
				return (this.customResultMapper ?
					this.customResultMapper(dbRows) :
					dbRows.map((row) => mapResultRow<T>(this.fields!, row, this.joinsNotNullableMap))
				) as unknown as unknown[][];
			})
		}
		// eslint-disable-next-line unicorn/consistent-destructuring
		const row = this.rows.shift()
		if (!row) {
			throw new Error('row is undefined')
		}
		return { done: false, value: row as unknown as T }
	}
	async return(): Promise<IteratorResult<T>> {
		await this.cursor!.close()
		this.span?.end()
		return { done: true, value: undefined }
	}
	async throw(): Promise<IteratorResult<T>> {
		await this.cursor!.close()
		this.span?.end()
		return { done: true, value: undefined }
	}

	[Symbol.asyncIterator]()  {
		return this
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
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PreparedQuery<T> {
		return new NodePgPreparedQuery(this.client, query.sql, query.params, this.logger, fields, name, customResultMapper);
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
