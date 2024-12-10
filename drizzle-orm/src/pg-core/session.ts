import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import type { AnyRelations, EmptyRelations, ExtractTablesWithRelations, TablesRelationalConfig } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { type Query, type SQL, sql } from '~/sql/index.ts';
import { tracer } from '~/tracing.ts';
import { PgDatabase } from './db.ts';
import type { PgDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface PreparedQueryConfig {
	execute: unknown;
	all: unknown;
	values: unknown;
}

export abstract class PgPreparedQuery<T extends PreparedQueryConfig> implements PreparedQuery {
	constructor(protected query: Query) {}

	protected authToken?: string;

	getQuery(): Query {
		return this.query;
	}

	mapResult(response: unknown, _isFromBatch?: boolean): unknown {
		return response;
	}

	/** @internal */
	setToken(token?: string) {
		this.authToken = token;
		return this;
	}

	static readonly [entityKind]: string = 'PgPreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;
	/** @internal */
	abstract execute(placeholderValues?: Record<string, unknown>, token?: string): Promise<T['execute']>;
	/** @internal */
	abstract execute(placeholderValues?: Record<string, unknown>, token?: string): Promise<T['execute']>;

	/** @internal */
	abstract all(placeholderValues?: Record<string, unknown>): Promise<T['all']>;

	/** @internal */
	abstract isResponseInArrayMode(): boolean;
}

export interface PgTransactionConfig {
	isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
	accessMode?: 'read only' | 'read write';
	deferrable?: boolean;
}

export abstract class PgSession<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TTablesConfig extends TablesRelationalConfig = ExtractTablesWithRelations<TRelations>,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'PgSession';

	constructor(protected dialect: PgDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
	): PgPreparedQuery<T>;

	abstract prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
	): PgPreparedQuery<T>;

	execute<T>(query: SQL): Promise<T>;
	/** @internal */
	execute<T>(query: SQL, token?: string): Promise<T>;
	/** @internal */
	execute<T>(query: SQL, token?: string): Promise<T> {
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
	async count(sql: SQL, token?: string): Promise<number>;
	/** @internal */
	async count(sql: SQL, token?: string): Promise<number> {
		const res = await this.execute<[{ count: string }]>(sql, token);

		return Number(
			res[0]['count'],
		);
	}

	abstract transaction<T>(
		transaction: (tx: PgTransaction<TQueryResult, TFullSchema, TRelations, TTablesConfig, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T>;
}

export abstract class PgTransaction<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TTablesConfig extends TablesRelationalConfig = ExtractTablesWithRelations<TRelations>,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> extends PgDatabase<TQueryResult, TFullSchema, TRelations, TTablesConfig, TSchema> {
	static override readonly [entityKind]: string = 'PgTransaction';

	constructor(
		dialect: PgDialect,
		session: PgSession<any, any, any, any, any>,
		protected relations: AnyRelations | undefined,
		protected schema: {
			fullSchema: Record<string, unknown>;
			schema: TSchema;
			tableNamesMap: Record<string, string>;
		} | undefined,
		protected readonly nestedIndex = 0,
	) {
		super(dialect, session, relations, schema);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** @internal */
	getTransactionConfigSQL(config: PgTransactionConfig): SQL {
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

	setTransaction(config: PgTransactionConfig): Promise<void> {
		return this.session.execute(sql`set transaction ${this.getTransactionConfigSQL(config)}`);
	}

	abstract override transaction<T>(
		transaction: (tx: PgTransaction<TQueryResult, TFullSchema, TRelations, TTablesConfig, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface PgQueryResultHKT {
	readonly $brand: 'PgQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type PgQueryResultKind<TKind extends PgQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
