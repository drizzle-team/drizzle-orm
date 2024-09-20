import { entityKind } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import type { Assume, Equal } from '~/utils.ts';
import { MySqlDatabase } from './db.ts';
import type { MySqlDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export type Mode = 'default' | 'planetscale';

export interface MySqlQueryResultHKT {
	readonly $brand: 'MySqlQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export interface AnyMySqlQueryResultHKT extends MySqlQueryResultHKT {
	readonly type: any;
}

export type MySqlQueryResultKind<TKind extends MySqlQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export interface MySqlPreparedQueryConfig {
	execute: unknown;
	iterator: unknown;
}

export interface MySqlPreparedQueryHKT {
	readonly $brand: 'MySqlPreparedQueryHKT';
	readonly config: unknown;
	readonly type: unknown;
}

export type PreparedQueryKind<
	TKind extends MySqlPreparedQueryHKT,
	TConfig extends MySqlPreparedQueryConfig,
	TAssume extends boolean = false,
> = Equal<TAssume, true> extends true
	? Assume<(TKind & { readonly config: TConfig })['type'], MySqlPreparedQuery<TConfig>>
	: (TKind & { readonly config: TConfig })['type'];

export abstract class MySqlPreparedQuery<T extends MySqlPreparedQueryConfig> {
	static readonly [entityKind]: string = 'MySqlPreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	abstract iterator(placeholderValues?: Record<string, unknown>): AsyncGenerator<T['iterator']>;
}

export interface MySqlTransactionConfig {
	withConsistentSnapshot?: boolean;
	accessMode?: 'read only' | 'read write';
	isolationLevel: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
}

export abstract class MySqlSession<
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'MySqlSession';

	constructor(protected dialect: MySqlDialect) {}

	abstract prepareQuery<T extends MySqlPreparedQueryConfig, TPreparedQueryHKT extends MySqlPreparedQueryHKT>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
	): PreparedQueryKind<TPreparedQueryHKT, T>;

	execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<MySqlPreparedQueryConfig & { execute: T }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			undefined,
		).execute();
	}

	abstract all<T = unknown>(query: SQL): Promise<T[]>;

	async count(sql: SQL): Promise<number> {
		const res = await this.execute<[[{ count: string }]]>(sql);

		return Number(
			res[0][0]['count'],
		);
	}

	abstract transaction<T>(
		transaction: (tx: MySqlTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T>;

	protected getSetTransactionSQL(config: MySqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.isolationLevel) {
			parts.push(`isolation level ${config.isolationLevel}`);
		}

		return parts.length ? sql`set transaction ${sql.raw(parts.join(' '))}` : undefined;
	}

	protected getStartTransactionSQL(config: MySqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.withConsistentSnapshot) {
			parts.push('with consistent snapshot');
		}

		if (config.accessMode) {
			parts.push(config.accessMode);
		}

		return parts.length ? sql`start transaction ${sql.raw(parts.join(' '))}` : undefined;
	}
}

export abstract class MySqlTransaction<
	TQueryResult extends MySqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> extends MySqlDatabase<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'MySqlTransaction';

	constructor(
		dialect: MySqlDialect,
		session: MySqlSession,
		protected schema: RelationalSchemaConfig<TSchema> | undefined,
		protected readonly nestedIndex: number,
		mode: Mode,
	) {
		super(dialect, session, schema, mode);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** Nested transactions (aka savepoints) only work with InnoDB engine. */
	abstract override transaction<T>(
		transaction: (tx: MySqlTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface PreparedQueryHKTBase extends MySqlPreparedQueryHKT {
	type: MySqlPreparedQuery<Assume<this['config'], MySqlPreparedQueryConfig>>;
}
