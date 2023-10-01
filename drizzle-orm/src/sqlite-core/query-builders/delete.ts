import { entityKind } from '~/entity.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/index.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { PreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { SQLiteTable } from '~/sqlite-core/table.ts';
import type { InferModel } from '~/table.ts';
import { type DrizzleTypeError, orderSelectedFields, type Simplify } from '~/utils.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';

export interface SQLiteDeleteConfig {
	where?: SQL | undefined;
	table: SQLiteTable;
	returning?: SelectedFieldsOrdered;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SQLiteDelete<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends SQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TRunResult,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TReturning = undefined,
> extends SQLWrapper {}

export class SQLiteDelete<
	TTable extends SQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
> extends QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]> implements SQLWrapper {
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

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	returning(): SQLiteDelete<TTable, TResultType, TRunResult, InferModel<TTable>>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): SQLiteDelete<TTable, TResultType, TRunResult, Simplify<SelectResultFields<TSelectedFields>>>;
	returning(
		fields: SelectedFieldsFlat = this.table[SQLiteTable.Symbol.Columns],
	): SQLiteDelete<TTable, TResultType, TRunResult, any> {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Omit<Query, 'typings'> {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(isOneTimeQuery?: boolean): PreparedQuery<{
		type: TResultType;
		run: TRunResult;
		all: TReturning extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'> : TReturning[];
		get: TReturning extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: TReturning | undefined;
		values: TReturning extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'> : any[][];
		execute: TReturning extends undefined ? TRunResult : TReturning[];
	}> {
		return this.session[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
			this.config.returning ? 'all' : 'run',
		) as ReturnType<this['prepare']>;
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

	override async execute(
		placeholderValues?: Record<string, unknown>,
	): Promise<TReturning extends undefined ? TRunResult : TReturning[]> {
		return this.prepare(true).execute(placeholderValues) as TReturning extends undefined ? TRunResult
			: TReturning[];
	}
}
