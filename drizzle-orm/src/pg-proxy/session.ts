import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgPreparedQuery as PreparedQueryBase, PgSession } from '~/pg-core/session.ts';
import type { AnyRelations, TablesRelationalConfig } from '~/relations.ts';
import type { QueryWithTypings } from '~/sql/sql.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';
import type { RemoteCallback } from './driver.ts';

export interface PgRemoteSessionOptions {
	logger?: Logger;
}

export class PgRemoteSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TTablesConfig extends TablesRelationalConfig,
	TSchema extends V1.TablesRelationalConfig,
> extends PgSession<PgRemoteQueryResultHKT, TFullSchema, TRelations, TTablesConfig, TSchema> {
	static override readonly [entityKind]: string = 'PgRemoteSession';

	private logger: Logger;

	constructor(
		private client: RemoteCallback,
		dialect: PgDialect,
		private relations: AnyRelations | undefined,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		options: PgRemoteSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig>(
		query: QueryWithTypings,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PreparedQuery<T> {
		return new PreparedQuery(
			this.client,
			query.sql,
			query.params,
			query.typings,
			this.logger,
			fields,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends PreparedQueryConfig>(
		query: QueryWithTypings,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper?: (rows: Record<string, unknown>[]) => T['execute'],
	): PreparedQuery<T, true> {
		return new PreparedQuery(
			this.client,
			query.sql,
			query.params,
			query.typings,
			this.logger,
			fields,
			false,
			customResultMapper,
			true,
		);
	}

	override async transaction<T>(
		_transaction: (tx: PgProxyTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>) => Promise<T>,
		_config?: PgTransactionConfig,
	): Promise<T> {
		throw new Error('Transactions are not supported by the Postgres Proxy driver');
	}
}

export class PgProxyTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TTablesConfig extends TablesRelationalConfig,
	TSchema extends V1.TablesRelationalConfig,
> extends PgTransaction<PgRemoteQueryResultHKT, TFullSchema, TRelations, TTablesConfig, TSchema> {
	static override readonly [entityKind]: string = 'PgProxyTransaction';

	override async transaction<T>(
		_transaction: (tx: PgProxyTransaction<TFullSchema, TRelations, TTablesConfig, TSchema>) => Promise<T>,
	): Promise<T> {
		throw new Error('Transactions are not supported by the Postgres Proxy driver');
	}
}

export class PreparedQuery<T extends PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends PreparedQueryBase<T>
{
	static override readonly [entityKind]: string = 'PgProxyPreparedQuery';

	constructor(
		private client: RemoteCallback,
		private queryString: string,
		private params: unknown[],
		private typings: any[] | undefined,
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
			const { fields, client, queryString, joinsNotNullableMap, customResultMapper, logger, typings } = this;

			span?.setAttributes({
				'drizzle.query.text': queryString,
				'drizzle.query.params': JSON.stringify(params),
			});

			logger.logQuery(queryString, params);

			if (!fields && !customResultMapper) {
				return tracer.startActiveSpan('drizzle.driver.execute', async () => {
					const { rows } = await client(queryString, params as any[], 'execute', typings);

					return rows;
				});
			}

			const rows = await tracer.startActiveSpan('drizzle.driver.execute', async () => {
				span?.setAttributes({
					'drizzle.query.text': queryString,
					'drizzle.query.params': JSON.stringify(params),
				});

				const { rows } = await client(queryString, params as any[], 'all', typings);

				return rows;
			});

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return customResultMapper
					? customResultMapper(rows)
					: rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
			});
		});
	}

	private async executeRqbV2(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(this.params, placeholderValues);
			const { client, queryString, customResultMapper, logger, typings } = this;

			span?.setAttributes({
				'drizzle.query.text': queryString,
				'drizzle.query.params': JSON.stringify(params),
			});

			logger.logQuery(queryString, params);

			const rows = await tracer.startActiveSpan('drizzle.driver.execute', async () => {
				const { rows } = await client(queryString, params as any[], 'execute', typings);

				return rows;
			});

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(rows);
			});
		});
	}

	async all() {
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface PgRemoteQueryResultHKT extends PgQueryResultHKT {
	type: Assume<this['row'], {
		[column: string]: any;
	}>[];
}
