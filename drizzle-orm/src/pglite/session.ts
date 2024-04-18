import type { PGlite, QueryOptions, Results, Row, Transaction } from '@electric-sql/pglite';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

import { types } from '@electric-sql/pglite';

export type PgliteClient = PGlite;

export class PglitePreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
	static readonly [entityKind]: string = 'PglitePreparedQuery';

	private rawQueryConfig: QueryOptions;
	private queryConfig: QueryOptions;

	constructor(
		private client: PgliteClient | Transaction,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super({ sql: queryString, params });
		this.rawQueryConfig = {
			rowMode: 'object',
			parsers: {
				[types.TIMESTAMP]: (value) => value,
				[types.TIMESTAMPTZ]: (value) => value,
				[types.INTERVAL]: (value) => value,
				[types.DATE]: (value) => value,
			},
		};
		this.queryConfig = {
			rowMode: 'array',
			parsers: {
				[types.TIMESTAMP]: (value) => value,
				[types.TIMESTAMPTZ]: (value) => value,
				[types.INTERVAL]: (value) => value,
				[types.DATE]: (value) => value,
			},
		};
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.queryString, params);

		const { fields, rawQueryConfig, client, queryConfig, joinsNotNullableMap, customResultMapper, queryString } = this;

		if (!fields && !customResultMapper) {
			return client.query<any[]>(queryString, params, rawQueryConfig);
		}

		const result = await client.query<any[][]>(queryString, params, queryConfig);

		return customResultMapper
			? customResultMapper(result.rows)
			: result.rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);
		return this.client.query(this.queryString, params, this.rawQueryConfig).then((result) => result.rows);
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface PgliteSessionOptions {
	logger?: Logger;
}

export class PgliteSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<PgliteQueryResultHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'PgliteSession';

	private logger: Logger;

	constructor(
		private client: PgliteClient | Transaction,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: PgliteSessionOptions = {},
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
		return new PglitePreparedQuery(
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
		transaction: (tx: PgliteTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		return (this.client as PgliteClient).transaction(async (client) => {
			const session = new PgliteSession<TFullSchema, TSchema>(
				client,
				this.dialect,
				this.schema,
				this.options,
			);
			const tx = new PgliteTransaction(this.dialect, session, this.schema);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class PgliteTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<PgliteQueryResultHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'PgliteTransaction';

	override async transaction<T>(transaction: (tx: PgliteTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new PgliteTransaction(this.dialect, this.session, this.schema, this.nestedIndex + 1);
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

export interface PgliteQueryResultHKT extends QueryResultHKT {
	type: Results<Assume<this['row'], Row>>;
}
