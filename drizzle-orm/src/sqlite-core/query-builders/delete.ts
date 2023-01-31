import { Query, SQL, SQLWrapper } from '~/sql';
import { SQLiteDialect } from '~/sqlite-core/dialect';

import { SelectFieldsOrdered, SelectResultFields, SQLiteSelectFields } from '~/sqlite-core/operations';
import { PreparedQuery, SQLiteSession } from '~/sqlite-core/session';
import { AnySQLiteTable, InferModel, SQLiteTable } from '~/sqlite-core/table';
import { orderSelectedFields } from '~/sqlite-core/utils';

export interface SQLiteDeleteConfig {
	where?: SQL | undefined;
	table: AnySQLiteTable;
	returning?: SelectFieldsOrdered;
}

export interface SQLiteDelete<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
> extends SQLWrapper {}

export class SQLiteDelete<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
> implements SQLWrapper {
	private config: SQLiteDeleteConfig;

	constructor(
		private table: TTable,
		private session: SQLiteSession,
		private dialect: SQLiteDialect,
	) {
		this.config = { table };
	}

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	returning(): Omit<SQLiteDelete<TTable, TResultType, TRunResult, InferModel<TTable>>, 'where' | 'returning'>;
	returning<TSelectedFields extends SQLiteSelectFields>(
		fields: TSelectedFields,
	): Omit<SQLiteDelete<TTable, TResultType, TRunResult, SelectResultFields<TSelectedFields>>, 'where' | 'returning'>;
	returning(
		fields: SQLiteSelectFields = this.table[SQLiteTable.Symbol.Columns],
	): SQLiteDelete<TTable, TResultType, TRunResult, any> {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Omit<Query, 'typings'> {
		const { typings, ...rest} = this.dialect.sqlToQuery(this.getSQL());
		return rest
	}

	prepare(): PreparedQuery<{
		type: TResultType;
		run: TRunResult;
		all: TReturning extends undefined ? never : TReturning[];
		get: TReturning extends undefined ? never : TReturning | undefined;
		values: TReturning extends undefined ? never : any[][];
	}> {
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
