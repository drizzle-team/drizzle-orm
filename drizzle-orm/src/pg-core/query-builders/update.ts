import type { GetColumnData } from '~/column';
import type { PgDialect } from '~/pg-core/dialect';
import { QueryPromise } from '~/query-promise';
import type { Query, SQL, SQLWrapper } from '~/sql';
import type { Simplify, UpdateSet } from '~/utils';
import { mapUpdateSet, orderSelectedFields } from '~/utils';

import type { PgSession, PreparedQuery, PreparedQueryConfig, QueryResultHKT, QueryResultKind } from '~/pg-core/session';
import type { AnyPgTable } from '~/pg-core/table';
import type { SelectResultFields } from '~/query-builders/select.types';
import { type InferModel, Table } from '~/table';
import type { SelectedFields, SelectedFieldsOrdered } from './select.types';

export interface PgUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: AnyPgTable;
	returning?: SelectedFieldsOrdered;
}

export type PgUpdateSetSource<TTable extends AnyPgTable> = Simplify<
	{
		[Key in keyof TTable['_']['columns']]?:
			| GetColumnData<TTable['_']['columns'][Key]>
			| SQL;
	}
>;

export class PgUpdateBuilder<TTable extends AnyPgTable, TQueryResult extends QueryResultHKT> {
	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {}

	set(values: PgUpdateSetSource<TTable>): PgUpdate<TTable, TQueryResult> {
		return new PgUpdate<TTable, TQueryResult>(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export interface PgUpdate<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
	declare readonly _: {
		readonly table: TTable;
		readonly return: TReturning;
	};

	private config: PgUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { set, table };
	}

	where(where: SQL | undefined): this {
		this.config.where = where;
		return this;
	}

	returning(): PgUpdate<TTable, TQueryResult, InferModel<TTable>>;
	returning<TSelectedFields extends SelectedFields>(
		fields: TSelectedFields,
	): PgUpdate<TTable, TQueryResult, SelectResultFields<TSelectedFields>>;
	returning(
		fields: SelectedFields = this.config.table[Table.Symbol.Columns],
	): PgUpdate<TTable, any, any> {
		this.config.returning = orderSelectedFields(fields);
		return this as PgUpdate<TTable, any>;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Omit<Query, 'typings'> {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
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
