import type { BigQueryDialect } from '~/bigquery-core/dialect.ts';
import type {
	BigQueryPreparedQuery,
	BigQueryQueryResultHKT,
	BigQueryQueryResultKind,
	BigQuerySession,
	PreparedQueryConfig,
} from '~/bigquery-core/session.ts';
import type { BigQueryTable } from '~/bigquery-core/table.ts';
import { entityKind, is } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import type { InferModelFromColumns } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import type { Simplify } from '~/utils.ts';
import { mapUpdateSet, orderSelectedFields } from '~/utils.ts';
import type { BigQueryColumn } from '../columns/common.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export interface BigQueryInsertConfig<TTable extends BigQueryTable = BigQueryTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	withList?: Subquery[];
	select?: SQL;
}

export type BigQueryInsertValue<TTable extends BigQueryTable> = Simplify<
	{
		[Key in keyof TTable['$inferInsert']]: TTable['$inferInsert'][Key] | SQL | Placeholder;
	}
>;

export class BigQueryInsertBuilder<
	TTable extends BigQueryTable,
	TQueryResult extends BigQueryQueryResultHKT,
> {
	static readonly [entityKind]: string = 'BigQueryInsertBuilder';

	constructor(
		private table: TTable,
		private session: BigQuerySession,
		private dialect: BigQueryDialect,
		private withList?: Subquery[],
	) {}

	values(
		value: BigQueryInsertValue<TTable>,
	): BigQueryInsertBase<TTable, TQueryResult>;
	values(
		values: BigQueryInsertValue<TTable>[],
	): BigQueryInsertBase<TTable, TQueryResult>;
	values(
		values: BigQueryInsertValue<TTable> | BigQueryInsertValue<TTable>[],
	): BigQueryInsertBase<TTable, TQueryResult> {
		values = Array.isArray(values) ? values : [values];
		if (values.length === 0) {
			throw new Error('values() must be called with at least one value');
		}
		const mappedValues = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue, cols[colKey]);
			}
			return result;
		});

		return new BigQueryInsertBase(this.table, mappedValues, this.session, this.dialect, this.withList);
	}

	select(
		selectQuery: SQL | ((qb: any) => SQL),
	): BigQueryInsertBase<TTable, TQueryResult> {
		const select = typeof selectQuery === 'function' ? selectQuery(undefined) : selectQuery;

		return new BigQueryInsertBase(this.table, [], this.session, this.dialect, this.withList, select);
	}
}

export type BigQueryInsertPrepare<
	TTable extends BigQueryTable,
	TQueryResult extends BigQueryQueryResultHKT,
> = BigQueryPreparedQuery<
	PreparedQueryConfig & {
		execute: BigQueryQueryResultKind<TQueryResult, never>;
	}
>;

// BigQuery INSERT doesn't support RETURNING clause
export class BigQueryInsertBase<
	TTable extends BigQueryTable,
	TQueryResult extends BigQueryQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_TReturning extends Record<string, unknown> | undefined = undefined,
> extends QueryPromise<BigQueryQueryResultKind<TQueryResult, never>> {
	static override readonly [entityKind]: string = 'BigQueryInsert';

	declare _: {
		readonly table: TTable;
	};

	private config: BigQueryInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: BigQueryInsertConfig['values'],
		private session: BigQuerySession,
		private dialect: BigQueryDialect,
		withList?: Subquery[],
		select?: SQL,
	) {
		super();
		this.config = { table, values, withList, select };
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(name: string): BigQueryInsertPrepare<TTable, TQueryResult> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery(
				this.dialect.sqlToQuery(this.getSQL()),
				undefined,
				name,
				false,
			) as BigQueryInsertPrepare<TTable, TQueryResult>;
		});
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this.prepare('execute').execute(placeholderValues);
		});
	};

	$dynamic(): this {
		return this;
	}
}
