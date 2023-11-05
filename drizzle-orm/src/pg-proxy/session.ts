import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session.ts';
import { PgSession, PreparedQuery as PreparedQueryBase } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';
import type { RemoteCallback } from './driver.ts';

export interface PgRemoteSessionOptions {
	logger?: Logger;
}

export class PgRemoteSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<PgRemoteQueryResultHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'PgRemoteSession';

	private logger: Logger;

	constructor(
		private client: RemoteCallback,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		options: PgRemoteSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PreparedQuery<T> {
		return new PreparedQuery(this.client, query.sql, query.params, this.logger, fields, customResultMapper);
	}

	override async transaction<T>(
		_transaction: (tx: PgProxyTransaction<TFullSchema, TSchema>) => Promise<T>,
		_config?: PgTransactionConfig,
	): Promise<T> {
		throw new Error('Transactions are not supported by the Postgres Proxy driver');
	}
}

export class PgProxyTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<PgRemoteQueryResultHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'PgProxyTransaction';

	override async transaction<T>(
		_transaction: (tx: PgProxyTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		throw new Error('Transactions are not supported by the Postgres Proxy driver');
	}
}

export class PreparedQuery<T extends PreparedQueryConfig> extends PreparedQueryBase<T> {
	static readonly [entityKind]: string = 'PgProxyPreparedQuery';

	constructor(
		private client: RemoteCallback,
		private queryString: string,
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
			const { fields, client, queryString, joinsNotNullableMap, customResultMapper, logger } = this;

			span?.setAttributes({
				'drizzle.query.text': queryString,
				'drizzle.query.params': JSON.stringify(params),
			});

			logger.logQuery(queryString, params);

			if (!fields && !customResultMapper) {
				return tracer.startActiveSpan('drizzle.driver.execute', async () => {
					const { rows } = await client(queryString, params as any[], 'execute');

					return rows;
				});
			}

			const rows = await tracer.startActiveSpan('drizzle.driver.execute', async () => {
				span?.setAttributes({
					'drizzle.query.text': queryString,
					'drizzle.query.params': JSON.stringify(params),
				});

				const { rows } = await client(queryString, params as any[], 'all');

				return rows;
			});

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return customResultMapper
					? customResultMapper(rows)
					: rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
			});
		});
	}

	async all() {}
}

export interface PgRemoteQueryResultHKT extends QueryResultHKT {
	type: Assume<this['row'], {
		[column: string]: any;
	}>[];
}
