import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteInsertBuilder, SQLiteInsertHKTBase } from '~/sqlite-core/query-builders/insert.ts';
import { SQLiteInsertBase } from '~/sqlite-core/query-builders/insert.ts';
import type { PreparedQueryConfig } from '~/sqlite-core/session.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { Assume, DrizzleTypeError } from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';
import type { SQLiteEffectPreparedQuery, SQLiteEffectSession } from './session.ts';

export interface SQLiteEffectInsertHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteInsertHKTBase
{
	_type: SQLiteEffectInsertBase<
		Assume<this['table'], SQLiteTable>,
		this['runResult'],
		this['returning'],
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
	>;
}

export type AnySQLiteEffectInsert = SQLiteEffectInsertBase<any, any, any, any, any, any>;

export type SQLiteEffectInsert<
	TTable extends SQLiteTable = SQLiteTable,
	TRunResult = unknown,
	TReturning = any,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteEffectInsertBase<TTable, TRunResult, TReturning, true, never, TEffectHKT>;

export type SQLiteEffectInsertBuilder<
	TTable extends SQLiteTable,
	TRunResult,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteInsertBuilder<TTable, TRunResult, SQLiteEffectInsertHKT<TEffectHKT>>;

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
			: T['_']['returning'];
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
	TDynamic extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends QueryEffectKind<TEffectHKT, TReturning extends undefined ? TRunResult : TReturning[]> {}

export class SQLiteEffectInsertBase<
	TTable extends SQLiteTable,
	TRunResult,
	TReturning = undefined,
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
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper {
	static override readonly [entityKind]: string = 'SQLiteEffectInsert';

	declare protected session: SQLiteEffectSession<TRunResult, TEffectHKT, any>;

	/** @internal */
	_prepare(prepare = false): SQLiteEffectInsertPrepare<this, TEffectHKT> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			'arrays',
			prepare,
			this.config.returning ? 'all' : 'run',
			this.config.returning ? this.dialect.mapperGenerators.rows(this.config.returning, undefined) : undefined,
			{
				type: 'insert',
				tables: extractUsedTable(this.config.table),
			},
		) as SQLiteEffectInsertPrepare<this, TEffectHKT>;
	}

	prepare(): SQLiteEffectInsertPrepare<this, TEffectHKT> {
		return this._prepare(true);
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().values(placeholderValues);
	};

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().execute(placeholderValues);
	};
}

applyEffectWrapper(SQLiteEffectInsertBase);
