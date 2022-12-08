import { GetColumnData } from 'drizzle-orm';
import { QueryPromise } from 'drizzle-orm/query-promise';
import { Param, Query, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { Simplify } from 'drizzle-orm/utils';
import { QueryResult, QueryResultRow } from 'pg';
import { PgDialect } from '~/dialect';

import { SelectFields, SelectFieldsOrdered, SelectResultFields } from '~/operations';
import { PgSession, PreparedQuery } from '~/session';
import { AnyPgTable, GetTableConfig, InferModel, PgTable } from '~/table';
import { mapUpdateSet, orderSelectedFields } from '~/utils';

export interface PgUpdateConfig {
	where?: SQL | undefined;
	set: PgUpdateSet;
	table: AnyPgTable;
	returning?: SelectFieldsOrdered;
}

export type PgUpdateSetSource<TTable extends AnyPgTable> = Simplify<
	{
		[Key in keyof GetTableConfig<TTable, 'columns'>]?:
			| GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>
			| SQL;
	}
>;

export type PgUpdateSet = Record<string, SQL | Param | null | undefined>;

export class PgUpdateBuilder<TTable extends AnyPgTable> {
	declare protected $table: TTable;

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {}

	set(values: PgUpdateSetSource<TTable>): PgUpdate<TTable> {
		return new PgUpdate(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export interface PgUpdate<
	TTable extends AnyPgTable,
	TReturning extends QueryResultRow | undefined = undefined,
> extends QueryPromise<TReturning extends undefined ? QueryResult<never> : TReturning[]>, SQLWrapper {}

export class PgUpdate<
	TTable extends AnyPgTable,
	TReturning extends QueryResultRow | undefined = undefined,
> extends QueryPromise<TReturning extends undefined ? QueryResult<never> : TReturning[]> implements SQLWrapper {
	declare protected $table: TTable;
	declare protected $return: TReturning;

	private config: PgUpdateConfig;

	constructor(
		table: TTable,
		set: PgUpdateSet,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { set, table };
	}

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	returning(): Omit<PgUpdate<TTable, InferModel<TTable>>, 'where' | 'returning'>;
	returning<TSelectedFields extends SelectFields>(
		fields: TSelectedFields,
	): Omit<PgUpdate<TTable, SelectResultFields<TSelectedFields>>, 'where' | 'returning'>;
	returning(
		fields: SelectFields = this.config.table[PgTable.Symbol.Columns],
	): Omit<PgUpdate<TTable, any>, 'where' | 'returning'> {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	prepare(): PreparedQuery<{
		execute: TReturning extends undefined ? QueryResult<never> : TReturning[];
	}> {
		return this.session.prepareQuery(this.toSQL(), this.config.returning);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	};
}
