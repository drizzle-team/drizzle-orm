import { GetColumnData } from 'drizzle-orm';
import { QueryPromise } from 'drizzle-orm/query-promise';
import { Param, Query, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { Simplify } from 'drizzle-orm/utils';
import { MySqlDialect } from '~/dialect';
import { SelectFields, SelectFieldsOrdered, SelectResultFields } from '~/operations';
import { MySqlQueryResult, MySqlRawQueryResult, MySqlSession, PreparedQuery, PreparedQueryConfig } from '~/session';
import { AnyMySqlTable, GetTableConfig, InferModel, MySqlTable } from '~/table';
import { mapUpdateSet, orderSelectedFields } from '~/utils';

export interface MySqlUpdateConfig {
	where?: SQL | undefined;
	set: MySqlUpdateSet;
	table: AnyMySqlTable;
	returning?: SelectFieldsOrdered;
}

export type MySqlUpdateSetSource<TTable extends AnyMySqlTable> = Simplify<
	{
		[Key in keyof GetTableConfig<TTable, 'columns'>]?:
			| GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>
			| SQL;
	}
>;

export type MySqlUpdateSet = Record<string, SQL | Param | null | undefined>;

export class MySqlUpdateBuilder<TTable extends AnyMySqlTable> {
	declare protected $table: TTable;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {}

	set(values: MySqlUpdateSetSource<TTable>): MySqlUpdate<TTable> {
		return new MySqlUpdate(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export interface MySqlUpdate<
	TTable extends AnyMySqlTable,
	TReturning = undefined,
> extends QueryPromise<MySqlRawQueryResult>, SQLWrapper {}
export class MySqlUpdate<
	TTable extends AnyMySqlTable,
	TReturning = undefined,
> extends QueryPromise<MySqlRawQueryResult> implements SQLWrapper {
	declare protected $table: TTable;
	declare protected $return: TReturning;

	private config: MySqlUpdateConfig;

	constructor(
		table: TTable,
		set: MySqlUpdateSet,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {
		super();
		this.config = { set, table };
	}

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	// returning(): Omit<MySqlUpdate<TTable, InferModel<TTable>>, 'where' | 'returning'>;
	// returning<TSelectedFields extends SelectFields>(
	// 	fields: TSelectedFields,
	// ): Omit<MySqlUpdate<TTable, SelectResultFields<TSelectedFields>>, 'where' | 'returning'>;
	// returning(
	// 	fields: SelectFields = this.config.table[MySqlTable.Symbol.Columns],
	// ): Omit<MySqlUpdate<TTable, any>, 'where' | 'returning'> {
	// 	this.config.returning = orderSelectedFields(fields);
	// 	return this;
	// }

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: MySqlRawQueryResult;
		}
	> {
		return this.session.prepareQuery(this.toSQL(), this.config.returning, name);
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: MySqlRawQueryResult;
		}
	> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}
