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
import type { Placeholder, Query, SQLWrapper } from '~/sql';
import { Param, SQL, sql } from '~/sql';
import { type InferModel, Table } from '~/table';
import type { Simplify } from '~/utils';
import { mapUpdateSet } from '~/utils';
import type { SelectedFieldsOrdered } from './select.types';
import type { MySqlUpdateSetSource } from './update';

export interface MySqlInsertConfig<TTable extends AnyMySqlTable = AnyMySqlTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	ignore: boolean;
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
}

export type AnyMySqlInsertConfig = MySqlInsertConfig<AnyMySqlTable>;

export type MySqlInsertValue<TTable extends AnyMySqlTable> = Simplify<
	{
		[Key in keyof InferModel<TTable, 'insert'>]: InferModel<TTable, 'insert'>[Key] | SQL | Placeholder;
	}
>;

export class MySqlInsertBuilder<TTable extends AnyMySqlTable, TQueryResult extends QueryResultHKT> {
	private shouldIgnore: boolean = false;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {}

	ignore(): this {
		this.shouldIgnore = true;
		return this;
	}

	values(value: MySqlInsertValue<TTable>): MySqlInsert<TTable, TQueryResult>;
	values(values: MySqlInsertValue<TTable>[]): MySqlInsert<TTable, TQueryResult>;
	/**
	 * @deprecated Pass the array of values without spreading it.
	 */
	values(...values: MySqlInsertValue<TTable>[]): MySqlInsert<TTable, TQueryResult>;
	values(
		...values: MySqlInsertValue<TTable>[] | [MySqlInsertValue<TTable>] | [MySqlInsertValue<TTable>[]]
	): MySqlInsert<TTable, TQueryResult> {
		if (values.length === 1) {
			if (Array.isArray(values[0])) {
				values = values[0];
			} else {
				values = [values[0]];
			}
		}
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

		return new MySqlInsert(this.table, mappedValues, this.shouldIgnore, this.session, this.dialect);
	}
}

export interface MySqlInsert<TTable extends AnyMySqlTable, TQueryResult extends QueryResultHKT, TReturning = undefined>
	extends QueryPromise<QueryResultKind<TQueryResult, never>>, SQLWrapper
{}
export class MySqlInsert<TTable extends AnyMySqlTable, TQueryResult extends QueryResultHKT, TReturning = undefined>
	extends QueryPromise<QueryResultKind<TQueryResult, never>>
	implements SQLWrapper
{
	declare protected $table: TTable;
	declare protected $return: TReturning;

	private config: MySqlInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: MySqlInsertConfig['values'],
		ignore: boolean,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {
		super();
		this.config = { table, values, ignore };
	}

	onDuplicateKeyUpdate(config: {
		// target?: IndexColumn | IndexColumn[];
		set: MySqlUpdateSetSource<TTable>;
	}): this {
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict = sql`update ${setSql}`;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Simplify<Omit<Query, 'typings'>> {
		const { typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: QueryResultKind<TQueryResult, never>;
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
