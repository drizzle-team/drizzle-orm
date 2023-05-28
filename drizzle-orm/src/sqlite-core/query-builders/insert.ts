import type { SelectResultFields } from '~/query-builders/select.types';
import type { Placeholder, Query, SQLWrapper } from '~/sql';
import { Param, SQL, sql } from '~/sql';
import type { SQLiteDialect } from '~/sqlite-core/dialect';
import type { IndexColumn } from '~/sqlite-core/indexes';
import type { PreparedQuery, SQLiteSession } from '~/sqlite-core/session';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import { SQLiteTable } from '~/sqlite-core/table';
import { type InferModel, Table } from '~/table';
import type { Simplify } from '~/utils';
import { mapUpdateSet, orderSelectedFields } from '~/utils';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types';
import type { SQLiteUpdateSetSource } from './update';

export interface SQLiteInsertConfig<TTable extends AnySQLiteTable = AnySQLiteTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
}

export type SQLiteInsertValue<TTable extends AnySQLiteTable> = Simplify<
	{
		[Key in keyof InferModel<TTable, 'insert'>]: InferModel<TTable, 'insert'>[Key] | SQL | Placeholder;
	}
>;

export class SQLiteInsertBuilder<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
> {
	constructor(
		protected table: TTable,
		protected session: SQLiteSession<any, any, any, any>,
		protected dialect: SQLiteDialect,
	) {}

	values(value: SQLiteInsertValue<TTable>): SQLiteInsert<TTable, TResultType, TRunResult>;
	values(values: SQLiteInsertValue<TTable>[]): SQLiteInsert<TTable, TResultType, TRunResult>;
	values(
		values: SQLiteInsertValue<TTable> | SQLiteInsertValue<TTable>[],
	): SQLiteInsert<TTable, TResultType, TRunResult> {
		values = Array.isArray(values) ? values : [values];
		if (values.length === 0) {
			throw new Error('values() must be called with at least one value');
		}
		const mappedValues = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				result[colKey] = colValue instanceof SQL ? colValue : new Param(colValue, cols[colKey]);
			}
			return result;
		});

		return new SQLiteInsert(this.table, mappedValues, this.session, this.dialect);
	}
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SQLiteInsert<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends AnySQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TRunResult,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TReturning = undefined,
> extends SQLWrapper {}

export class SQLiteInsert<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
> implements SQLWrapper {
	declare readonly _: {
		readonly table: TTable;
		readonly resultType: TResultType;
		readonly runResult: TRunResult;
		readonly returning: TReturning;
	};

	private config: SQLiteInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: SQLiteInsertConfig['values'],
		private session: SQLiteSession<any, any, any, any>,
		private dialect: SQLiteDialect,
	) {
		this.config = { table, values };
	}

	returning(): Omit<
		SQLiteInsert<TTable, TResultType, TRunResult, InferModel<TTable>>,
		'returning' | `onConflict${string}`
	>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): Omit<
		SQLiteInsert<TTable, TResultType, TRunResult, SelectResultFields<TSelectedFields>>,
		'returning' | `onConflict${string}`
	>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[SQLiteTable.Symbol.Columns],
	): SQLiteInsert<TTable, TResultType, TRunResult, any> {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}

	onConflictDoNothing(config: { target?: IndexColumn | IndexColumn[]; where?: SQL } = {}): this {
		if (config.target === undefined) {
			this.config.onConflict = sql`do nothing`;
		} else {
			const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
			const whereSql = config.where ? sql` where ${config.where}` : sql``;
			this.config.onConflict = sql`${targetSql}${whereSql} do nothing`;
		}
		return this;
	}

	onConflictDoUpdate(config: {
		target: IndexColumn | IndexColumn[];
		where?: SQL;
		set: SQLiteUpdateSetSource<TTable>;
	}): this {
		const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
		const whereSql = config.where ? sql` where ${config.where}` : sql``;
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict = sql`${targetSql}${whereSql} do update set ${setSql}`;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Simplify<Omit<Query, 'typings'>> {
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
