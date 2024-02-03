import type { FullQueryResults, QueryRows } from '@neondatabase/serverless';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session.ts';
import { PgSession, PreparedQuery } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export type NeonHttpClient = {
	<A extends boolean = false, F extends boolean = true>(
		strings: string,
		params?: any[],
		mode?: { arrayMode?: A; fullResults?: F },
	): Promise<
		F extends true ? FullQueryResults<A> : QueryRows<A>
	>;
};

export class NeonHttpPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	static readonly [entityKind]: string = 'NeonHttpPreparedQuery';

	private rawQuery: { arrayMode?: false; fullResults?: true };
	private query: { arrayMode?: true; fullResults?: true };

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
			arrayMode: false,
			fullResults: true,
		};
		this.query = { arrayMode: true, fullResults: true };
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.queryString, params);

		const { fields, client, queryString, query, rawQuery, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			return client(queryString, params, rawQuery);
		}

		const result = await client(queryString, params, query);

		return customResultMapper
			? customResultMapper(result.rows as unknown[][])
			: result.rows.map((row) => mapResultRow<T['execute']>(fields!, row as unknown[], joinsNotNullableMap));
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);
		return this.client(this.queryString, params, this.rawQuery).then((result) => result.rows);
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
		return new NeonHttpPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			name,
			customResultMapper,
		);
	}

	// change return type to QueryRows<true>
	async query(query: string, params: unknown[]): Promise<FullQueryResults<true>> {
		this.logger.logQuery(query, params);
		const result = await this.client(query, params, { arrayMode: true });
		return result;
	}

	// change return type to QueryRows<false>
	async queryObjects(
		query: string,
		params: unknown[],
	): Promise<FullQueryResults<false>> {
		return this.client(query, params);
	}

	override async transaction<T>(
		_transaction: (tx: NeonTransaction<TFullSchema, TSchema>) => Promise<T>,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_config: PgTransactionConfig = {},
	): Promise<T> {
		throw new Error('No transactions support in neon-http driver');
	}
}

export class NeonTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<NeonHttpQueryResultHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'NeonHttpTransaction';

	override async transaction<T>(_transaction: (tx: NeonTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		throw new Error('No transactions support in neon-http driver');
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
	type: FullQueryResults<Assume<this['row'], boolean>>;
}
