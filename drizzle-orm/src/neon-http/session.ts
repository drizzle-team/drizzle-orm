import type { FullQueryResults, QueryRows } from '@neondatabase/serverless';
import type { BatchItem } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session.ts';
import { PgPreparedQuery as PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { mapResultRow } from '~/utils.ts';

export type NeonHttpClient = {
	<A extends boolean = false, F extends boolean = true>(
		strings: string,
		params?: any[],
		config?: { arrayMode?: A; fullResults?: F },
	): Promise<
		F extends true ? FullQueryResults<A> : QueryRows<A>
	>;

	transaction<A extends boolean = false, F extends boolean = true>(
		queries: Promise<FullQueryResults<boolean> | QueryRows<boolean>>[],
		config?: { arrayMode?: A; fullResults?: F },
	): Promise<
		F extends true ? FullQueryResults<A>[] : QueryRows<A>[]
	>;
};

const rawQueryConfig = {
	arrayMode: false,
	fullResults: true,
} as const;
const queryConfig = {
	arrayMode: true,
	fullResults: true,
} as const;

export class NeonHttpPreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
	static readonly [entityKind]: string = 'NeonHttpPreparedQuery';

	constructor(
		private client: NeonHttpClient,
		query: Query,
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super(query);
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.query.params, placeholderValues);

		this.logger.logQuery(this.query.sql, params);

		const { fields, client, query, customResultMapper } = this;

		if (!fields && !customResultMapper) {
			return client(query.sql, params, rawQueryConfig);
		}

		const result = await client(query.sql, params, queryConfig);

		return this.mapResult(result);
	}

	override mapResult(result: unknown): unknown {
		if (!this.fields && !this.customResultMapper) {
			return result;
		}

		const rows = (result as FullQueryResults<true>).rows;

		if (this.customResultMapper) {
			return this.customResultMapper(rows);
		}

		return rows.map((row) => mapResultRow(this.fields!, row, this.joinsNotNullableMap));
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.query.params, placeholderValues);
		this.logger.logQuery(this.query.sql, params);
		return this.client(this.query.sql, params, rawQueryConfig).then((result) => result.rows);
	}

	values(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['values']> {
		const params = fillPlaceholders(this.query.params, placeholderValues);
		this.logger.logQuery(this.query.sql, params);
		return this.client(this.query.sql, params).then((result) => result.rows);
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
	): PgPreparedQuery<T> {
		return new NeonHttpPreparedQuery(
			this.client,
			query,
			this.logger,
			fields,
			customResultMapper,
		);
	}

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(queries: T) {
		const preparedQueries: PreparedQuery[] = [];
		const builtQueries: Promise<FullQueryResults<true> | QueryRows<true>>[] = [];

		for (const query of queries) {
			const preparedQuery = query._prepare();
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			builtQueries.push(this.client(builtQuery.sql, builtQuery.params));
		}

		const batchResults = await this.client.transaction(builtQueries, queryConfig);

		return batchResults.map((result, i) => preparedQueries[i]!.mapResult(result, true));
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

export type NeonHttpQueryResult<T> = Omit<FullQueryResults<false>, 'rows'> & { rows: T[] };

export interface NeonHttpQueryResultHKT extends QueryResultHKT {
	type: NeonHttpQueryResult<this['row']>;
}
