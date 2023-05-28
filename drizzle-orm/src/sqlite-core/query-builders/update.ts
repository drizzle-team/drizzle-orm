import type { GetColumnData } from '~/column';
import type { SelectResultFields } from '~/query-builders/select.types';
import type { Query, SQL, SQLWrapper } from '~/sql';
import type { SQLiteDialect } from '~/sqlite-core/dialect';
import type { PreparedQuery, SQLiteSession } from '~/sqlite-core/session';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import { SQLiteTable } from '~/sqlite-core/table';
import type { InferModel } from '~/table';
import type { Simplify, UpdateSet } from '~/utils';
import { mapUpdateSet, orderSelectedFields } from '~/utils';
import type { SelectedFields, SelectedFieldsOrdered } from './select.types';

export interface SQLiteUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: AnySQLiteTable;
	returning?: SelectedFieldsOrdered;
}

export type SQLiteUpdateSetSource<TTable extends AnySQLiteTable> = Simplify<
	{
		[Key in keyof TTable['_']['columns']]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL;
	}
>;

export class SQLiteUpdateBuilder<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
> {
	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		protected table: TTable,
		protected session: SQLiteSession<any, any, any, any>,
		protected dialect: SQLiteDialect,
	) {}

	set(values: SQLiteUpdateSetSource<TTable>): SQLiteUpdate<TTable, TResultType, TRunResult> {
		return new SQLiteUpdate(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SQLiteUpdate<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends AnySQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TRunResult,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TReturning = undefined,
> extends SQLWrapper {}

export class SQLiteUpdate<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
> implements SQLWrapper {
	declare readonly _: {
		readonly table: TTable;
	};

	private config: SQLiteUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: SQLiteSession<any, any, any, any>,
		private dialect: SQLiteDialect,
	) {
		this.config = { set, table };
	}

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	returning(): Omit<
		SQLiteUpdate<TTable, TResultType, TRunResult, InferModel<TTable>>,
		'where' | 'returning'
	>;
	returning<TSelectedFields extends SelectedFields>(
		fields: TSelectedFields,
	): Omit<
		SQLiteUpdate<TTable, TResultType, TRunResult, SelectResultFields<TSelectedFields>>,
		'where' | 'returning'
	>;
	returning(
		fields: SelectedFields = this.config.table[SQLiteTable.Symbol.Columns],
	): Omit<SQLiteUpdate<TTable, TResultType, TRunResult>, 'where' | 'returning'> {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Omit<Query, 'typings'> {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(isOneTimeQuery?: boolean): PreparedQuery<
		{
			type: TResultType;
			run: TRunResult;
			all: TReturning extends undefined ? never : TReturning[];
			get: TReturning extends undefined ? never : TReturning;
			values: TReturning extends undefined ? never : any[][];
		}
	> {
		return this.session[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
		);
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
}
