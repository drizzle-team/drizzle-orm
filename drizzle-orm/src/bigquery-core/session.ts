import { entityKind } from '~/entity.ts';
import { DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { TablesRelationalConfig } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { type Query, type SQL, sql } from '~/sql/index.ts';
import { tracer } from '~/tracing.ts';
import { BigQueryDatabase } from './db.ts';
import type { BigQueryDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface PreparedQueryConfig {
	execute: unknown;
	all: unknown;
	values: unknown;
}

export abstract class BigQueryPreparedQuery<T extends PreparedQueryConfig> implements PreparedQuery {
	constructor(
		protected query: Query,
	) {}

	getQuery(): Query {
		return this.query;
	}

	mapResult(response: unknown, _isFromBatch?: boolean): unknown {
		return response;
	}

	static readonly [entityKind]: string = 'BigQueryPreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	/** @internal */
	abstract all(placeholderValues?: Record<string, unknown>): Promise<T['all']>;

	/** @internal */
	abstract isResponseInArrayMode(): boolean;
}

// BigQuery has limited transaction support via scripting
export interface BigQueryTransactionConfig {
	// BigQuery doesn't support traditional isolation levels
	// but we keep this for API compatibility
}

export abstract class BigQuerySession<
	TQueryResult extends BigQueryQueryResultHKT = BigQueryQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'BigQuerySession';

	constructor(protected dialect: BigQueryDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
	): BigQueryPreparedQuery<T>;

	execute<T>(query: SQL): Promise<T> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
					this.dialect.sqlToQuery(query),
					undefined,
					undefined,
					false,
				);
			});

			return prepared.execute();
		});
	}

	all<T = unknown>(query: SQL): Promise<T[]> {
		return this.prepareQuery<PreparedQueryConfig & { all: T[] }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
		).all();
	}

	async count(sql: SQL): Promise<number> {
		const res = await this.execute<[{ count: string }]>(sql);

		return Number(
			res[0]['count'],
		);
	}

	// BigQuery has limited transaction support via multi-statement transactions
	abstract transaction<T>(
		transaction: (tx: BigQueryTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
		config?: BigQueryTransactionConfig,
	): Promise<T>;
}

export abstract class BigQueryTransaction<
	TQueryResult extends BigQueryQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> extends BigQueryDatabase<TQueryResult, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'BigQueryTransaction';

	constructor(
		dialect: BigQueryDialect,
		session: BigQuerySession<any, any, any>,
		protected schema: {
			fullSchema: Record<string, unknown>;
			schema: TSchema;
			tableNamesMap: Record<string, string>;
		} | undefined,
		protected readonly nestedIndex = 0,
	) {
		super(dialect, session, schema);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	// BigQuery transactions don't support savepoints or nested transactions in the traditional sense
	abstract override transaction<T>(
		transaction: (tx: BigQueryTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface BigQueryQueryResultHKT {
	readonly $brand: 'BigQueryQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type BigQueryQueryResultKind<TKind extends BigQueryQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
