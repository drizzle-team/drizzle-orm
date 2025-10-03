import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import type { PreparedQuery } from '~/session.ts';
import { type Query, type SQL, sql } from '~/sql/index.ts';
import { tracer } from '~/tracing.ts';
import type { NeonAuthToken } from '~/utils.ts';
import { CockroachDatabase } from './db.ts';
import type { CockroachDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface PreparedQueryConfig {
	execute: unknown;
	all: unknown;
	values: unknown;
}

export abstract class CockroachPreparedQuery<T extends PreparedQueryConfig> implements PreparedQuery {
	constructor(protected query: Query) {}

	protected authToken?: NeonAuthToken;

	getQuery(): Query {
		return this.query;
	}

	mapResult(response: unknown, _isFromBatch?: boolean): unknown {
		return response;
	}

	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	static readonly [entityKind]: string = 'CockroachPreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;
	/** @internal */
	abstract execute(placeholderValues?: Record<string, unknown>, token?: NeonAuthToken): Promise<T['execute']>;
	/** @internal */
	abstract execute(placeholderValues?: Record<string, unknown>, token?: NeonAuthToken): Promise<T['execute']>;

	/** @internal */
	abstract all(placeholderValues?: Record<string, unknown>): Promise<T['all']>;

	/** @internal */
	abstract isResponseInArrayMode(): boolean;
}

export interface CockroachTransactionConfig {
	isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
	accessMode?: 'read only' | 'read write';
	deferrable?: boolean;
}

export abstract class CockroachSession<
	TQueryResult extends CockroachQueryResultHKT = CockroachQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends V1.TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'CockroachSession';

	constructor(protected dialect: CockroachDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
	): CockroachPreparedQuery<T>;

	execute<T>(query: SQL): Promise<T>;
	/** @internal */
	execute<T>(query: SQL, token?: NeonAuthToken): Promise<T>;
	/** @internal */
	execute<T>(query: SQL, token?: NeonAuthToken): Promise<T> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
					this.dialect.sqlToQuery(query),
					undefined,
					undefined,
					false,
				);
			});

			return prepared.setToken(token).execute(undefined, token);
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

	async count(sql: SQL): Promise<number>;
	/** @internal */
	async count(sql: SQL, token?: NeonAuthToken): Promise<number>;
	/** @internal */
	async count(sql: SQL, token?: NeonAuthToken): Promise<number> {
		const res = await this.execute<[{ count: string }]>(sql, token);

		return Number(
			res[0]['count'],
		);
	}

	abstract transaction<T>(
		transaction: (tx: CockroachTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
		config?: CockroachTransactionConfig,
	): Promise<T>;
}

export abstract class CockroachTransaction<
	TQueryResult extends CockroachQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends V1.TablesRelationalConfig = Record<string, never>,
> extends CockroachDatabase<TQueryResult, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'CockroachTransaction';

	constructor(
		dialect: CockroachDialect,
		session: CockroachSession<any, any, any>,
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

	/** @internal */
	getTransactionConfigSQL(config: CockroachTransactionConfig): SQL {
		const chunks: string[] = [];
		if (config.isolationLevel) {
			chunks.push(`isolation level ${config.isolationLevel}`);
		}
		if (config.accessMode) {
			chunks.push(config.accessMode);
		}
		if (typeof config.deferrable === 'boolean') {
			chunks.push(config.deferrable ? 'deferrable' : 'not deferrable');
		}
		return sql.raw(chunks.join(' '));
	}

	setTransaction(config: CockroachTransactionConfig): Promise<void> {
		return this.session.execute(sql`set transaction ${this.getTransactionConfigSQL(config)}`);
	}

	abstract override transaction<T>(
		transaction: (tx: CockroachTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface CockroachQueryResultHKT {
	readonly $brand: 'CockroachQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type CockroachQueryResultKind<TKind extends CockroachQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
