import { type NeonQueryFunction } from '@neondatabase/serverless';
import { entityKind } from '~/entity';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import { PgTransaction } from '~/pg-core';
import type { PgDialect } from '~/pg-core/dialect';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session';
import { PgSession, PreparedQuery } from '~/pg-core/session';
import { type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations';
import { fillPlaceholders, type Query, sql } from '~/sql';
import { type Assume, mapResultRow } from '~/utils';

export type NeonHttpClient = NeonQueryFunction<true, true>;

export class NeonHttpPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	static readonly [entityKind]: string = 'NeonHttpPreparedQuery';

	private rawQuery: { arrayMode: boolean };
	private query: { arrayMode: boolean };

	constructor(
		private client: NeonHttpClient,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private name: string | undefined,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super();
		this.rawQuery = {
			arrayMode: true,
		};
		this.query = { arrayMode: false };
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.queryString, params);

		const { fields, client, queryString, name, query, rawQuery, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			return client(queryString, params);
		}

		const result = await client(queryString, params);

		return customResultMapper
			? customResultMapper(result.rows)
			: result.rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);
		return this.client(this.queryString, params).then((result) => result.rows);
	}

	values(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['values']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);
		return this.client(this.queryString, params).then((result) => result.rows);
	}
}

export interface NeonHttpSessionOptions {
	logger?: Logger;
}

export class NeonHttpSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<NeonHttpQueryResultHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'NeonHttpSession';

	private logger: Logger;

	constructor(
		private client: NeonHttpClient,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: NeonHttpSessionOptions = {},
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
		return new NeonHttpPreparedQuery(this.client, query.sql, query.params, this.logger, fields, name, customResultMapper);
	}

	// change return type to QueryRows<true>
	async query(query: string, params: unknown[]): Promise<any[][]> {
		this.logger.logQuery(query, params);
		const result = await this.client(query, params);
		return result;
	}

	// change return type to QueryRows<false>
	async queryObjects<T extends Record<string, any>[]>(
		query: string,
		params: unknown[],
	): Promise<QueryResult<T>> {
		return this.client(query, params);
	}

	override async transaction<T>(
		_transaction: (tx: NeonTransaction<TFullSchema, TSchema>) => Promise<T>,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_config: PgTransactionConfig = {},
	): Promise<T> {
		throw new Error("No transactions support in neon-http driver")
	}
}

export class NeonTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<NeonHttpQueryResultHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'NeonHttpTransaction';

	override async transaction<T>(_transaction: (tx: NeonTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		throw new Error("No transactions support in neon-http driver")
		// const savepointName = `sp${this.nestedIndex + 1}`;
		// const tx = new NeonTransaction(this.dialect, this.session, this.schema, this.nestedIndex + 1);
		// await tx.execute(sql.raw(`savepoint ${savepointName}`));
		// try {
		// 	const result = await transaction(tx);
		// 	await tx.execute(sql.raw(`release savepoint ${savepointName}`));
		// 	return result;
		// } catch (e) {
		// 	await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
		// 	throw e;
		// }
	}
}

export interface NeonHttpQueryResultHKT extends QueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
