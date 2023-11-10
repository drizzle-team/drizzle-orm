import { entityKind } from '~/entity.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { SQLiteTable } from '~/sqlite-core/table.ts';
import { type DrizzleTypeError, orderSelectedFields } from '~/utils.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';

export type SQLiteDeleteWithout<
	T extends AnySQLiteDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		SQLiteDeleteBase<
			T['_']['table'],
			T['_']['resultType'],
			T['_']['runResult'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type SQLiteDelete<
	TTable extends SQLiteTable = SQLiteTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TReturning extends Record<string, unknown> | undefined = undefined,
> = SQLiteDeleteBase<TTable, TResultType, TRunResult, TReturning, true, never>;

export interface SQLiteDeleteConfig {
	where?: SQL | undefined;
	table: SQLiteTable;
	returning?: SelectedFieldsOrdered;
}

export type SQLiteDeleteReturningAll<
	T extends AnySQLiteDeleteBase,
	TDynamic extends boolean,
> = SQLiteDeleteWithout<
	SQLiteDeleteBase<
		T['_']['table'],
		T['_']['resultType'],
		T['_']['runResult'],
		T['_']['table']['$inferSelect'],
		T['_']['dynamic'],
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type SQLiteDeleteReturning<
	T extends AnySQLiteDeleteBase,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = SQLiteDeleteWithout<
	SQLiteDeleteBase<
		T['_']['table'],
		T['_']['resultType'],
		T['_']['runResult'],
		SelectResultFields<TSelectedFields>,
		T['_']['dynamic'],
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type SQLiteDeleteExecute<T extends AnySQLiteDeleteBase> = T['_']['returning'] extends undefined
	? T['_']['runResult']
	: T['_']['returning'][];

export type SQLiteDeletePrepare<T extends AnySQLiteDeleteBase> = SQLitePreparedQuery<{
	type: T['_']['resultType'];
	run: T['_']['runResult'];
	all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
		: T['_']['returning'][];
	get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
		: T['_']['returning'] | undefined;
	values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
		: any[][];
	execute: SQLiteDeleteExecute<T>;
}>;

export type SQLiteDeleteDynamic<T extends AnySQLiteDeleteBase> = SQLiteDelete<
	T['_']['table'],
	T['_']['resultType'],
	T['_']['runResult'],
	T['_']['returning']
>;

export type AnySQLiteDeleteBase = SQLiteDeleteBase<any, any, any, any, any, any>;

export interface SQLiteDeleteBase<
	TTable extends SQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends SQLWrapper {
	readonly _: {
		dialect: 'sqlite';
		readonly table: TTable;
		readonly resultType: TResultType;
		readonly runResult: TRunResult;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? TRunResult : TReturning[];
	};
}

export class SQLiteDeleteBase<
	TTable extends SQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>
	implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper
{
	static readonly [entityKind]: string = 'SQLiteDelete';

	/** @internal */
	config: SQLiteDeleteConfig;

	constructor(
		private table: TTable,
		private session: SQLiteSession<any, any, any, any>,
		private dialect: SQLiteDialect,
	) {
		super();
		this.config = { table };
	}

	where(where: SQL | undefined): SQLiteDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	returning(): SQLiteDeleteReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): SQLiteDeleteReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.table[SQLiteTable.Symbol.Columns],
	): SQLiteDeleteReturning<this, TDynamic, any> {
		this.config.returning = orderSelectedFields(fields);
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(isOneTimeQuery?: boolean): SQLiteDeletePrepare<this> {
		return this.session[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
			this.config.returning ? 'all' : 'run',
		) as SQLiteDeletePrepare<this>;
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues) => {
		return this.prepare(true).run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues) => {
		return this.prepare(true).all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues) => {
		return this.prepare(true).get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues) => {
		return this.prepare(true).values(placeholderValues);
	};

	override async execute(placeholderValues?: Record<string, unknown>): Promise<SQLiteDeleteExecute<this>> {
		return this.prepare(true).execute(placeholderValues) as SQLiteDeleteExecute<this>;
	}

	$dynamic(): SQLiteDeleteDynamic<this> {
		return this as any;
	}
}
