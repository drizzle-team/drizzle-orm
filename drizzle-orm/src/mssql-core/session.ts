import { entityKind } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import type { Assume, Equal } from '~/utils.ts';
import { MsSqlDatabase } from './db.ts';
import type { MsSqlDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface QueryResultHKT {
	readonly $brand: 'MsSqlQueryRowHKT';
	readonly row: unknown;
	readonly type: any;
}

export interface AnyQueryResultHKT extends QueryResultHKT {
	readonly type: any;
}

export type QueryResultKind<TKind extends QueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export interface PreparedQueryConfig {
	execute: unknown;
	iterator: unknown;
}

export interface PreparedQueryHKT {
	readonly $brand: 'MsSqlPreparedQueryHKT';
	readonly config: unknown;
	readonly type: unknown;
}

export type PreparedQueryKind<
	TKind extends PreparedQueryHKT,
	TConfig extends PreparedQueryConfig,
	TAssume extends boolean = false,
> = Equal<TAssume, true> extends true ? Assume<(TKind & { readonly config: TConfig })['type'], PreparedQuery<TConfig>>
	: (TKind & { readonly config: TConfig })['type'];

export abstract class PreparedQuery<T extends PreparedQueryConfig> {
	static readonly [entityKind]: string = 'MsSqlPreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	abstract iterator(placeholderValues?: Record<string, unknown>): AsyncGenerator<T['iterator']>;
}

export interface MsSqlTransactionConfig {
	isolationLevel: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable' | 'snapshot';
}

export abstract class MsSqlSession<
	TQueryResult extends QueryResultHKT = QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'MsSqlSession';

	constructor(protected dialect: MsSqlDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig, TPreparedQueryHKT extends PreparedQueryHKT>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PreparedQueryKind<TPreparedQueryHKT, T>;

	execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			undefined,
		).execute();
	}

	abstract all<T = unknown>(query: SQL): Promise<T[]>;

	abstract transaction<T>(
		transaction: (tx: MsSqlTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>) => Promise<T>,
		config?: MsSqlTransactionConfig,
	): Promise<T>;

	protected getSetTransactionSQL(config: MsSqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.isolationLevel) {
			parts.push(`isolation level ${config.isolationLevel}`);
		}

		return parts.length ? sql.join(['set transaction ', parts.join(' ')]) : undefined;
	}

	protected getStartTransactionSQL(_config: MsSqlTransactionConfig): SQL | undefined {
		return sql`begin transaction`;
	}
}

export abstract class MsSqlTransaction<
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> extends MsSqlDatabase<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'MsSqlTransaction';

	constructor(
		dialect: MsSqlDialect,
		session: MsSqlSession,
		protected schema: RelationalSchemaConfig<TSchema> | undefined,
		protected readonly nestedIndex: number,
	) {
		super(dialect, session, schema);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** Nested transactions (aka savepoints) only work with InnoDB engine. */
	abstract override transaction<T>(
		transaction: (tx: MsSqlTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface PreparedQueryHKTBase extends PreparedQueryHKT {
	type: PreparedQuery<Assume<this['config'], PreparedQueryConfig>>;
}
