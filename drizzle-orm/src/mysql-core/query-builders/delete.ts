import { MySqlDialect } from '~/mysql-core/dialect';
import { SelectFieldsOrdered } from '~/mysql-core/operations';
import { MySqlSession, PreparedQuery, PreparedQueryConfig, QueryResultHKT, QueryResultKind } from '~/mysql-core/session';
import { AnyMySqlTable } from '~/mysql-core/table';
import { QueryPromise } from '~/query-promise';
import { Query, SQL, SQLWrapper } from '~/sql';

export interface MySqlDeleteConfig {
	where?: SQL | undefined;
	table: AnyMySqlTable;
	returning?: SelectFieldsOrdered;
}

export interface MySqlDelete<
	TTable extends AnyMySqlTable,
	TQueryResult extends QueryResultHKT,
	TReturning = undefined,
> extends QueryPromise<QueryResultKind<TQueryResult, never> > {}

export class MySqlDelete<
	TTable extends AnyMySqlTable,
	TQueryResult extends QueryResultHKT,
	TReturning = undefined,
> extends QueryPromise<QueryResultKind<TQueryResult, never> > implements SQLWrapper {
	private config: MySqlDeleteConfig;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {
		super();
		this.config = { table };
	}

	where(
		where: SQL | undefined,
	): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	// returning(): Omit<MySqlDelete<TTable, InferModel<TTable>>, 'where' | 'returning'>;
	// returning<TSelectedFields extends SelectFields>(
	// 	fields: TSelectedFields,
	// ): Omit<MySqlDelete<TTable, SelectResultFields<TSelectedFields>>, 'where' | 'returning'>;
	// returning(
	// 	fields: SelectFields = this.config.table[MySqlTable.Symbol.Columns],
	// ): Omit<MySqlDelete<TTable, any>, 'where' | 'returning'> {
	// 	this.config.returning = orderSelectedFields(fields);
	// 	return this;
	// }

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Omit<Query, 'typings'> {
		const { typings, ...rest} = this.dialect.sqlToQuery(this.getSQL());
		return rest
	}

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TQueryResult;
		}
	> {
		return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name);
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: QueryResultKind<TQueryResult, never>;
		}
	> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}
