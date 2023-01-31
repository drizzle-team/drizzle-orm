import { MySqlDialect } from '~/mysql-core/dialect';
import { SelectFieldsOrdered } from '~/mysql-core/operations';
import { MySqlRawQueryResult, MySqlSession, PreparedQuery, PreparedQueryConfig } from '~/mysql-core/session';
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
	TReturning = undefined,
> extends QueryPromise<MySqlRawQueryResult> {}

export class MySqlDelete<
	TTable extends AnyMySqlTable,
	TReturning = undefined,
> extends QueryPromise<MySqlRawQueryResult> implements SQLWrapper {
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
