import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteInsertBuilder, SQLiteInsertHKTBase } from '~/sqlite-core/query-builders/insert.ts';
import { SQLiteInsertBase } from '~/sqlite-core/query-builders/insert.ts';
import type { PreparedQueryConfig } from '~/sqlite-core/session.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { applyMixins } from '~/utils.ts';
import type { Assume, DrizzleTypeError } from '~/utils.ts';
import { type SQLiteEffectRunnableMethods, SQLiteRunnableQuery } from '../query-builders/runnable.ts';
import type { SQLiteEffectPreparedQuery, SQLiteEffectSession } from './session.ts';

export interface SQLiteEffectInsertHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteInsertHKTBase
{
	_type: SQLiteEffectInsertBase<
		Assume<this['table'], SQLiteTable>,
		this['runResult'],
		this['returning'],
		this['mayReturnEmpty'],
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
	>;
}

export type AnySQLiteEffectInsert = SQLiteEffectInsertBase<any, any, any, any, any, any, any>;

export type SQLiteEffectInsert<
	TTable extends SQLiteTable = SQLiteTable,
	TRunResult = unknown,
	TReturning = any,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteEffectInsertBase<TTable, TRunResult, TReturning, boolean, true, never, TEffectHKT>;

export type SQLiteEffectInsertBuilder<
	TTable extends SQLiteTable,
	TRunResult,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	TColumnList extends string[] | 'all' = 'all',
> = SQLiteInsertBuilder<TTable, TRunResult, TColumnList, SQLiteEffectInsertHKT<TEffectHKT>>;

export type SQLiteEffectInsertExecute<T extends AnySQLiteEffectInsert> = T['_']['returning'] extends undefined
	? T['_']['runResult']
	: T['_']['returning'][];

export type SQLiteEffectInsertPrepare<
	T extends AnySQLiteEffectInsert,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteEffectPreparedQuery<
	PreparedQueryConfig & {
		run: T['_']['runResult'];
		all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
			: T['_']['returning'][];
		get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: T['_']['mayReturnEmpty'] extends false ? T['_']['returning']
			: T['_']['returning'] | undefined;
		values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
			: any[][];
		execute: SQLiteEffectInsertExecute<T>;
	},
	TEffectHKT
>;

export interface SQLiteEffectInsertBase<
	// oxlint-disable-next-line no-unused-vars
	TTable extends SQLiteTable,
	TRunResult,
	TReturning = undefined,
	// oxlint-disable-next-line no-unused-vars
	TMayReturnEmpty extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TDynamic extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends
	QueryEffectKind<TEffectHKT, TReturning extends undefined ? TRunResult : TReturning[]>,
	SQLiteEffectRunnableMethods
{
	/** @internal */
	_prepare(prepare?: boolean): SQLiteEffectInsertPrepare<this, TEffectHKT>;

	prepare(): SQLiteEffectInsertPrepare<this, TEffectHKT>;
}

export class SQLiteEffectInsertBase<
	TTable extends SQLiteTable,
	TRunResult,
	TReturning = undefined,
	TMayReturnEmpty extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends SQLiteInsertBase<
	SQLiteEffectInsertHKT<TEffectHKT>,
	TTable,
	TRunResult,
	TReturning,
	TMayReturnEmpty,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper {
	static override readonly [entityKind]: string = 'SQLiteEffectInsert';

	declare protected session: SQLiteEffectSession<TRunResult, TEffectHKT, any>;
}

applyMixins(SQLiteEffectInsertBase, [SQLiteRunnableQuery]);
applyEffectWrapper(SQLiteEffectInsertBase);
