import { entityKind } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import type { Assume, Equal } from '~/utils.ts';
import { GoogleSqlDatabase } from './db.ts';
import type { GoogleSqlDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export type Mode = 'default' | 'planetscale';

export interface GoogleSqlQueryResultHKT {
	readonly $brand: 'GoogleSqlQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export interface AnyGoogleSqlQueryResultHKT extends GoogleSqlQueryResultHKT {
	readonly type: any;
}

export type GoogleSqlQueryResultKind<TKind extends GoogleSqlQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export interface GoogleSqlPreparedQueryConfig {
	execute: unknown;
	iterator: unknown;
}

export interface GoogleSqlPreparedQueryHKT {
	readonly $brand: 'GoogleSqlPreparedQueryHKT';
	readonly config: unknown;
	readonly type: unknown;
}

export type PreparedQueryKind<
	TKind extends GoogleSqlPreparedQueryHKT,
	TConfig extends GoogleSqlPreparedQueryConfig,
	TAssume extends boolean = false,
> = Equal<TAssume, true> extends true
	? Assume<(TKind & { readonly config: TConfig })['type'], GoogleSqlPreparedQuery<TConfig>>
	: (TKind & { readonly config: TConfig })['type'];

export abstract class GoogleSqlPreparedQuery<T extends GoogleSqlPreparedQueryConfig> {
	static readonly [entityKind]: string = 'GoogleSqlPreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	abstract iterator(placeholderValues?: Record<string, unknown>): AsyncGenerator<T['iterator']>;
}

export interface GoogleSqlTransactionConfig {
	withConsistentSnapshot?: boolean;
	accessMode?: 'read only' | 'read write';
	isolationLevel: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
}

export abstract class GoogleSqlSession<
	TQueryResult extends GoogleSqlQueryResultHKT = GoogleSqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'GoogleSqlSession';

	constructor(protected dialect: GoogleSqlDialect) {}

	abstract prepareQuery<T extends GoogleSqlPreparedQueryConfig, TPreparedQueryHKT extends GoogleSqlPreparedQueryHKT>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
	): PreparedQueryKind<TPreparedQueryHKT, T>;

	execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<GoogleSqlPreparedQueryConfig & { execute: T }, PreparedQueryHKTBase>(
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
		transaction: (tx: GoogleSqlTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>) => Promise<T>,
		config?: GoogleSqlTransactionConfig,
	): Promise<T>;

	protected getSetTransactionSQL(config: GoogleSqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.isolationLevel) {
			parts.push(`isolation level ${config.isolationLevel}`);
		}

		return parts.length ? sql`set transaction ${sql.raw(parts.join(' '))}` : undefined;
	}

	protected getStartTransactionSQL(config: GoogleSqlTransactionConfig): SQL | undefined {
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

export abstract class GoogleSqlTransaction<
	TQueryResult extends GoogleSqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> extends GoogleSqlDatabase<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'GoogleSqlTransaction';

	constructor(
		dialect: GoogleSqlDialect,
		session: GoogleSqlSession,
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
		transaction: (tx: GoogleSqlTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface PreparedQueryHKTBase extends GoogleSqlPreparedQueryHKT {
	type: GoogleSqlPreparedQuery<Assume<this['config'], GoogleSqlPreparedQueryConfig>>;
}
