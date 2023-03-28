import type { GetColumnData } from '~/column';
import type { MySqlDialect } from '~/mysql-core/dialect';
import type {
	MySqlSession,
	PreparedQuery,
	PreparedQueryConfig,
	QueryResultHKT,
	QueryResultKind,
} from '~/mysql-core/session';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { QueryPromise } from '~/query-promise';
import type { Query, SQL, SQLWrapper } from '~/sql';
import type { Simplify, UpdateSet } from '~/utils';
import { mapUpdateSet } from '~/utils';
import type { SelectedFieldsOrdered } from './select.types';

export interface MySqlUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: AnyMySqlTable;
	returning?: SelectedFieldsOrdered;
}

export type MySqlUpdateSetSource<TTable extends AnyMySqlTable> = Simplify<
	{
		[Key in keyof TTable['_']['columns']]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL;
	}
>;

export class MySqlUpdateBuilder<TTable extends AnyMySqlTable, TQueryResult extends QueryResultHKT> {
	declare protected $table: TTable;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {}

	set(values: MySqlUpdateSetSource<TTable>): MySqlUpdate<TTable, TQueryResult> {
		return new MySqlUpdate(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export interface MySqlUpdate<
	TTable extends AnyMySqlTable,
	TQueryResult extends QueryResultHKT,
	TReturning = undefined,
> extends
	QueryPromise<TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[]>,
	SQLWrapper
{}
export class MySqlUpdate<
	TTable extends AnyMySqlTable,
	TQueryResult extends QueryResultHKT,
	TReturning = undefined,
> extends QueryPromise<TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[]>
	implements SQLWrapper
{
	declare protected $table: TTable;
	declare protected $return: TReturning;

	private config: MySqlUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
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

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Omit<Query, 'typings'> {
		const { typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[];
		}
	> {
		return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name);
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[];
		}
	> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}
