import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteDeleteHKTBase } from '~/sqlite-core/query-builders/delete.ts';
import { SQLiteDeleteBase } from '~/sqlite-core/query-builders/delete.ts';
import type { PreparedQueryConfig } from '~/sqlite-core/session.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { applyMixins } from '~/utils.ts';
import type { Assume, DrizzleTypeError } from '~/utils.ts';
import { type SQLiteEffectRunnableMethods, SQLiteRunnableQuery } from '../query-builders/runnable.ts';
import type { SQLiteEffectPreparedQuery, SQLiteEffectSession } from './session.ts';

export interface SQLiteEffectDeleteHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteDeleteHKTBase
{
	_type: SQLiteEffectDeleteBase<
		Assume<this['table'], SQLiteTable>,
		this['runResult'],
		Assume<this['returning'], Record<string, unknown> | undefined>,
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
	>;
}

export type AnySQLiteEffectDelete = SQLiteEffectDeleteBase<any, any, any, any, any, any>;

export type SQLiteEffectDelete<
	TTable extends SQLiteTable = SQLiteTable,
	TRunResult = unknown,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteEffectDeleteBase<TTable, TRunResult, TReturning, true, never, TEffectHKT>;

export type SQLiteEffectDeleteExecute<T extends AnySQLiteEffectDelete> = T['_']['returning'] extends undefined
	? T['_']['runResult']
	: T['_']['returning'][];

export type SQLiteEffectDeletePrepare<
	T extends AnySQLiteEffectDelete,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteEffectPreparedQuery<
	PreparedQueryConfig & {
		run: T['_']['runResult'];
		all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
			: T['_']['returning'][];
		get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: T['_']['returning'] | undefined;
		values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
			: any[][];
		execute: SQLiteEffectDeleteExecute<T>;
	},
	TEffectHKT
>;

export interface SQLiteEffectDeleteBase<
	// oxlint-disable-next-line no-unused-vars
	TTable extends SQLiteTable,
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
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
	_prepare(prepare?: boolean): SQLiteEffectDeletePrepare<this, TEffectHKT>;

	prepare(): SQLiteEffectDeletePrepare<this, TEffectHKT>;
}

export class SQLiteEffectDeleteBase<
	TTable extends SQLiteTable,
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends SQLiteDeleteBase<
	SQLiteEffectDeleteHKT<TEffectHKT>,
	TTable,
	TRunResult,
	TReturning,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper {
	static override readonly [entityKind]: string = 'SQLiteEffectDelete';

	declare protected session: SQLiteEffectSession<TRunResult, TEffectHKT, any>;
}

applyMixins(SQLiteEffectDeleteBase, [SQLiteRunnableQuery]);
applyEffectWrapper(SQLiteEffectDeleteBase);
