import type { Placeholder, Query, SQLWrapper } from '~/sql';
import { Param, SQL, sql } from '~/sql';
import type { SQLiteDialect } from '~/sqlite-core/dialect';
import type { IndexColumn } from '~/sqlite-core/indexes';
import type { PreparedQuery, SQLiteSession } from '~/sqlite-core/session';
import type { AnySQLiteTable, InferModel} from '~/sqlite-core/table';
import { SQLiteTable } from '~/sqlite-core/table';
import { Table } from '~/table';
import type { Simplify } from '~/utils';
import { mapUpdateSet, orderSelectedFields } from '~/utils';
import type { SelectFieldsFlat, SelectFieldsOrdered, SelectResultFields } from './select.types';
import type { SQLiteUpdateSetSource } from './update';

export interface SQLiteInsertConfig<TTable extends AnySQLiteTable = AnySQLiteTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	onConflict?: SQL;
	returning?: SelectFieldsOrdered;
}

export type SQLiteInsertValue<TTable extends AnySQLiteTable> = {
	[Key in keyof InferModel<TTable, 'insert'>]: InferModel<TTable, 'insert'>[Key] | SQL | Placeholder;
};

export class SQLiteInsertBuilder<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
> {
	constructor(
		protected table: TTable,
		protected session: SQLiteSession,
		protected dialect: SQLiteDialect,
	) {}

	protected mapValues(values: SQLiteInsertValue<TTable>[]): Record<string, Param<unknown, unknown> | SQL>[] {
		return values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				if (colValue instanceof SQL) {
					result[colKey] = colValue;
				} else {
					result[colKey] = new Param(colValue, cols[colKey]);
				}
			}
			return result;
		});
	}

	values(...values: SQLiteInsertValue<TTable>[]): SQLiteInsert<TTable, TResultType, TRunResult> {
		return new SQLiteInsert(this.table, this.mapValues(values), this.session, this.dialect);
	}
}

export interface SQLiteInsert<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
> extends SQLWrapper {}

export class SQLiteInsert<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
> implements SQLWrapper {
	declare protected $table: TTable;

	private config: SQLiteInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: SQLiteInsertConfig['values'],
		private session: SQLiteSession,
		private dialect: SQLiteDialect,
	) {
		this.config = { table, values };
	}

	returning(): Omit<
		SQLiteInsert<TTable, TResultType, TRunResult, InferModel<TTable>>,
		'returning' | `onConflict${string}`
	>;
	returning<TSelectedFields extends SelectFieldsFlat>(
		fields: TSelectedFields,
	): Omit<
		SQLiteInsert<TTable, TResultType, TRunResult, SelectResultFields<TSelectedFields>>,
		'returning' | `onConflict${string}`
	>;
	returning(
		fields: SelectFieldsFlat = this.config.table[SQLiteTable.Symbol.Columns],
	): SQLiteInsert<TTable, TResultType, TRunResult, any> {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}

	onConflictDoNothing(config: { target?: IndexColumn | IndexColumn[]; where?: SQL } = {}): this {
		if (config.target === undefined) {
			this.config.onConflict = sql`do nothing`;
		} else {
			const whereSql = config.where ? sql` where ${config.where}` : sql``;
			this.config.onConflict = sql`${config.target}${whereSql} do nothing`;
		}
		return this;
	}

	onConflictDoUpdate(config: {
		target?: IndexColumn | IndexColumn[];
		where?: SQL;
		set: SQLiteUpdateSetSource<TTable>;
	}): this {
		const whereSql = config.where ? sql` where ${config.where}` : sql``;
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict = sql`${config.target}${whereSql} do update set ${setSql}`;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Simplify<Omit<Query, 'typings'>> {
		const { typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): PreparedQuery<
		{
			type: TResultType;
			run: TRunResult;
			all: TReturning extends undefined ? never : TReturning[];
			get: TReturning extends undefined ? never : TReturning;
			values: TReturning extends undefined ? never : any[][];
		}
	> {
		return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), this.config.returning);
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues) => {
		return this.prepare().run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues) => {
		return this.prepare().all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues) => {
		return this.prepare().get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues) => {
		return this.prepare().values(placeholderValues);
	};
}
