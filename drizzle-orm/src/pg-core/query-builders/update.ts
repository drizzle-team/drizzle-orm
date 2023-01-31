import { GetColumnData } from '~/column';
import { PgDialect } from '~/pg-core/dialect';
import { QueryPromise } from '~/query-promise';
import { Param, Query, SQL, SQLWrapper } from '~/sql';
import { Simplify } from '~/utils';

import { SelectFields, SelectFieldsOrdered, SelectResultFields } from '~/pg-core/operations';
import { PgSession, PreparedQuery, PreparedQueryConfig, QueryResultHKT, QueryResultKind } from '~/pg-core/session';
import { AnyPgTable, GetTableConfig, InferModel, PgTable } from '~/pg-core/table';
import { mapUpdateSet, orderSelectedFields } from '~/pg-core/utils';

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

export class PgUpdateBuilder<TTable extends AnyPgTable, TQueryResult extends QueryResultHKT> {
	declare protected $table: TTable;

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {}

	set(values: PgUpdateSetSource<TTable>): PgUpdate<TTable, TQueryResult> {
		return new PgUpdate(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export interface PgUpdate<
	TTable extends AnyPgTable,
	TQueryResult extends QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
> extends
	QueryPromise<TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[]>,
	SQLWrapper
{}

export class PgUpdate<
	TTable extends AnyPgTable,
	TQueryResult extends QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
> extends QueryPromise<TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[]>
	implements SQLWrapper
{
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

	returning(): Omit<PgUpdate<TTable, TQueryResult, InferModel<TTable>>, 'where' | 'returning'>;
	returning<TSelectedFields extends SelectFields>(
		fields: TSelectedFields,
	): Omit<PgUpdate<TTable, TQueryResult, SelectResultFields<TSelectedFields>>, 'where' | 'returning'>;
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

	toSQL(): Omit<Query, 'typings'> {
		const { typings, ...rest} = this.dialect.sqlToQuery(this.getSQL());
		return rest
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
