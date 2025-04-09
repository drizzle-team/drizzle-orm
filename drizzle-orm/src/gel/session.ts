import type { Client } from 'gel';
import type { Transaction } from 'gel/dist/transaction';
import { entityKind } from '~/entity.ts';
import type { GelDialect } from '~/gel-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/gel-core/query-builders/select.types.ts';
import { GelPreparedQuery, GelSession, GelTransaction, type PreparedQueryConfig } from '~/gel-core/session.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { mapResultRow } from '~/utils.ts';

export type GelClient = Client | Transaction;

export class GelDbPreparedQuery<T extends PreparedQueryConfig> extends GelPreparedQuery<T> {
	static override readonly [entityKind]: string = 'GelPreparedQuery';

	constructor(
		private client: GelClient,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
		private transaction: boolean = false,
	) {
		super({ sql: queryString, params });
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async () => {
			const params = fillPlaceholders(this.params, placeholderValues);

			this.logger.logQuery(this.queryString, params);
			const { fields, queryString: query, client, joinsNotNullableMap, customResultMapper } = this;
			if (!fields && !customResultMapper) {
				return tracer.startActiveSpan('drizzle.driver.execute', async (span) => {
					span?.setAttributes({
						'drizzle.query.text': query,
						'drizzle.query.params': JSON.stringify(params),
					});

					return client.querySQL(query, params.length ? params : undefined);
				});
			}

			const result = (await tracer.startActiveSpan('drizzle.driver.execute', (span) => {
				span?.setAttributes({
					'drizzle.query.text': query,
					'drizzle.query.params': JSON.stringify(params),
				});

				return client.withSQLRowMode('array').querySQL(query, params.length ? params : undefined);
			})) as unknown[][];

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return customResultMapper
					? customResultMapper(result)
					: result.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
			});
		});
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		return tracer.startActiveSpan('drizzle.execute', () => {
			const params = fillPlaceholders(this.params, placeholderValues);
			this.logger.logQuery(this.queryString, params);
			return tracer.startActiveSpan('drizzle.driver.execute', (span) => {
				span?.setAttributes({
					'drizzle.query.text': this.queryString,
					'drizzle.query.params': JSON.stringify(params),
				});
				return this.client.withSQLRowMode('array').querySQL(this.queryString, params.length ? params : undefined).then((
					result,
				) => result);
			});
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface GelSessionOptions {
	logger?: Logger;
}

export class GelDbSession<TFullSchema extends Record<string, unknown>, TSchema extends TablesRelationalConfig>
	extends GelSession<GelQueryResultHKT, TFullSchema, TSchema>
{
	static override readonly [entityKind]: string = 'GelDbSession';

	private logger: Logger;

	constructor(
		private client: GelClient,
		dialect: GelDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: GelSessionOptions = {},
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
	): GelDbPreparedQuery<T> {
		return new GelDbPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	override async transaction<T>(
		transaction: (tx: GelTransaction<GelQueryResultHKT, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		return await (this.client as Client).transaction(async (clientTx) => {
			const session = new GelDbSession(clientTx, this.dialect, this.schema, this.options);
			const tx = new GelDbTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema);
			return await transaction(tx);
		});
	}

	override async count(sql: SQL): Promise<number> {
		const res = await this.execute<[{ count: string }]>(sql);
		return Number(res[0]['count']);
	}
}

export class GelDbTransaction<TFullSchema extends Record<string, unknown>, TSchema extends TablesRelationalConfig>
	extends GelTransaction<GelQueryResultHKT, TFullSchema, TSchema>
{
	static override readonly [entityKind]: string = 'GelDbTransaction';

	override async transaction<T>(transaction: (tx: GelDbTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const tx = new GelDbTransaction<TFullSchema, TSchema>(
			this.dialect,
			this.session,
			this.schema,
		);
		return await transaction(tx);
	}
}

// TODO fix this
export interface GelQueryResultHKT {
	readonly $brand: 'GelQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}
