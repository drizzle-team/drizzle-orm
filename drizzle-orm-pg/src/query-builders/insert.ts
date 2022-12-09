import { Table } from 'drizzle-orm';
import { QueryPromise } from 'drizzle-orm/query-promise';
import { Param, Placeholder, Query, SQL, sql, SQLWrapper } from 'drizzle-orm/sql';
import { QueryResult, QueryResultRow } from 'pg';

import { PgDialect } from '~/dialect';
import { IndexColumn } from '~/indexes';
import { SelectFields, SelectFieldsOrdered, SelectResultFields } from '~/operations';
import { PgSession, PreparedQuery } from '~/session';
import { AnyPgTable, InferModel, PgTable } from '~/table';
import { mapUpdateSet, orderSelectedFields } from '~/utils';
import { PgUpdateSetSource } from './update';

export interface PgInsertConfig<TTable extends AnyPgTable = AnyPgTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	onConflict?: SQL;
	returning?: SelectFieldsOrdered;
}

export type PgInsertValue<TTable extends AnyPgTable> = {
	[Key in keyof InferModel<TTable, 'insert'>]: InferModel<TTable, 'insert'>[Key] | SQL | Placeholder;
};

export class PgInsertBuilder<TTable extends AnyPgTable> {
	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {}

	values(...values: PgInsertValue<TTable>[]): PgInsert<TTable> {
		const mappedValues = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				if (colValue instanceof SQL) {
					result[colKey] = colValue;
				} else {
					result[colKey] = new Param(colValue, cols[colKey]);
				}
			}
			return result;
		});

		return new PgInsert(this.table, mappedValues, this.session, this.dialect);
	}
}

export interface PgInsert<TTable extends AnyPgTable, TReturning extends QueryResultRow | undefined = undefined>
	extends QueryPromise<TReturning extends undefined ? QueryResult<never> : TReturning[]>, SQLWrapper
{}

export class PgInsert<TTable extends AnyPgTable, TReturning extends QueryResultRow | undefined = undefined>
	extends QueryPromise<TReturning extends undefined ? QueryResult<never> : TReturning[]>
	implements SQLWrapper
{
	declare protected $table: TTable;
	declare protected $return: TReturning;

	private config: PgInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: PgInsertConfig['values'],
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { table, values };
	}

	returning(): Omit<PgInsert<TTable, InferModel<TTable>>, 'returning' | `onConflict${string}`>;
	returning<TSelectedFields extends SelectFields>(
		fields: TSelectedFields,
	): Omit<PgInsert<TTable, SelectResultFields<TSelectedFields>>, 'returning' | `onConflict${string}`>;
	returning(
		fields: SelectFields = this.config.table[PgTable.Symbol.Columns],
	): Omit<PgInsert<TTable, any>, 'returning' | `onConflict${string}`> {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}

	onConflictDoNothing(config: { target?: IndexColumn | IndexColumn[]; where?: SQL } = {}): this {
		if (config.target === undefined) {
			this.config.onConflict = sql`do nothing`;
		} else {
			const whereSql = config.where ? sql` where ${config.where}` : sql``;
			this.config.onConflict = sql`${config.target}${whereSql} do nothing`;
		}
		return this;
	}

	onConflictDoUpdate(config: {
		target?: IndexColumn | IndexColumn[];
		where?: SQL;
		set: PgUpdateSetSource<TTable>;
	}): this {
		const whereSql = config.where ? sql` where ${config.where}` : sql``;
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict = sql`${config.target}${whereSql} do update set ${setSql}`;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	private _prepare(name?: string): PreparedQuery<{
		execute: TReturning extends undefined ? QueryResult<never> : TReturning[];
	}> {
		return this.session.prepareQuery(this.toSQL(), this.config.returning, name);
	}

	prepare(name: string): PreparedQuery<{
		execute: TReturning extends undefined ? QueryResult<never> : TReturning[];
	}> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}
