import { QueryPromise } from 'drizzle-orm/query-promise';
import { Query, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { QueryResult, QueryResultRow } from 'pg';

import { PgDialect } from '~/dialect';
import { SelectFields, SelectFieldsOrdered, SelectResultFields } from '~/operations';
import { PgSession, PreparedQuery, PreparedQueryConfig } from '~/session';
import { AnyPgTable, InferModel, PgTable } from '~/table';
import { orderSelectedFields } from '~/utils';

export interface PgDeleteConfig {
	where?: SQL | undefined;
	table: AnyPgTable;
	returning?: SelectFieldsOrdered;
}

export interface PgDelete<
	TTable extends AnyPgTable,
	TReturning extends QueryResultRow | undefined = undefined,
> extends QueryPromise<TReturning extends undefined ? QueryResult<never> : TReturning[]> {}

export class PgDelete<
	TTable extends AnyPgTable,
	TReturning extends QueryResultRow | undefined = undefined,
> extends QueryPromise<TReturning extends undefined ? QueryResult<never> : TReturning[]> implements SQLWrapper {
	private config: PgDeleteConfig;

	constructor(
		table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { table };
	}

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	returning(): Omit<PgDelete<TTable, InferModel<TTable>>, 'where' | 'returning'>;
	returning<TSelectedFields extends SelectFields>(
		fields: TSelectedFields,
	): Omit<PgDelete<TTable, SelectResultFields<TSelectedFields>>, 'where' | 'returning'>;
	returning(
		fields: SelectFields = this.config.table[PgTable.Symbol.Columns],
	): Omit<PgDelete<TTable, any>, 'where' | 'returning'> {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TReturning extends undefined ? QueryResult<never> : TReturning[];
		}
	> {
		return this.session.prepareQuery(this.toSQL(), this.config.returning, name);
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TReturning extends undefined ? QueryResult<never> : TReturning[];
		}
	> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}
