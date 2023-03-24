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
import type { SelectFieldsOrdered } from './select.types';

export interface MySqlDeleteConfig {
	where?: SQL | undefined;
	table: AnyMySqlTable;
	returning?: SelectFieldsOrdered;
}

export interface MySqlDelete<
	TTable extends AnyMySqlTable,
	TQueryResult extends QueryResultHKT,
> extends QueryPromise<QueryResultKind<TQueryResult, never>> {}

export class MySqlDelete<
	TTable extends AnyMySqlTable,
	TQueryResult extends QueryResultHKT,
> extends QueryPromise<QueryResultKind<TQueryResult, never>> implements SQLWrapper {
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

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Omit<Query, 'typings'> {
		const { typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
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
