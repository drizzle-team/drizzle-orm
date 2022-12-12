import { Table } from 'drizzle-orm';
import { QueryPromise } from 'drizzle-orm/query-promise';
import { Param, Placeholder, Query, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { MySqlDialect } from '~/dialect';
import { SelectFields, SelectFieldsOrdered, SelectResultFields } from '~/operations';
import { MySqlQueryResult, MySqlSession, PreparedQuery, PreparedQueryConfig } from '~/session';
import { AnyMySqlTable, InferModel, MySqlTable } from '~/table';
import { orderSelectedFields } from '~/utils';
export interface MySqlInsertConfig<TTable extends AnyMySqlTable = AnyMySqlTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	onConflict?: SQL;
	returning?: SelectFieldsOrdered;
}

export type AnyMySqlInsertConfig = MySqlInsertConfig<AnyMySqlTable>;

export type MySqlInsertValue<TTable extends AnyMySqlTable> = {
	[Key in keyof InferModel<TTable, 'insert'>]: InferModel<TTable, 'insert'>[Key] | SQL | Placeholder;
};

export class MySqlInsertBuilder<TTable extends AnyMySqlTable> {
	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {}

	values(...values: MySqlInsertValue<TTable>[]): MySqlInsert<TTable> {
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

		return new MySqlInsert(this.table, mappedValues, this.session, this.dialect);
	}
}

export interface MySqlInsert<TTable extends AnyMySqlTable, TReturning = undefined>
	extends QueryPromise<TReturning extends undefined ? MySqlQueryResult : TReturning[]>, SQLWrapper
{}
export class MySqlInsert<TTable extends AnyMySqlTable, TReturning = undefined>
	extends QueryPromise<TReturning extends undefined ? MySqlQueryResult : TReturning[]>
	implements SQLWrapper
{
	declare protected $table: TTable;
	declare protected $return: TReturning;

	private config: MySqlInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: MySqlInsertConfig['values'],
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {
		super();
		this.config = { table, values };
	}

	returning(): Omit<MySqlInsert<TTable, InferModel<TTable>>, 'returning' | `onConflict${string}`>;
	returning<TSelectedFields extends SelectFields>(
		fields: TSelectedFields,
	): Omit<MySqlInsert<TTable, SelectResultFields<TSelectedFields>>, 'returning' | `onConflict${string}`>;
	returning(
		fields: SelectFields = this.config.table[MySqlTable.Symbol.Columns],
	): Omit<MySqlInsert<TTable, any>, 'returning' | `onConflict${string}`> {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}

	// onDuplicateDoNothing(
	// 	target?:
	// 		| SQL<GetTableConfig<TTable, 'name'>>
	// 		| ((
	// 			constraints: GetTableConflictConstraints<TTable>,
	// 		) => Check<GetTableConfig<TTable, 'name'>>),
	// ): Pick<this, 'returning' | 'getQuery' | 'execute'> {
	// 	if (typeof target === 'undefined') {
	// 		this.config.onConflict = sql`do nothing`;
	// 	} else if (target instanceof SQL) {
	// 		this.config.onConflict = sql`${target} do nothing`;
	// 	} else {
	// 		const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
	// 		this.config.onConflict = sql`on constraint ${targetSql} do nothing`;
	// 	}
	// 	return this;
	// }

	// onDuplicateDoUpdate(
	// 	target:
	// 		| SQL<GetTableConfig<TTable, 'name'>>
	// 		| ((constraints: GetTableConflictConstraints<TTable>) => Check<GetTableConfig<TTable, 'name'>>),
	// 	set: MySqlUpdateSet<TTable>,
	// ): Pick<this, 'returning' | 'getQuery' | 'execute'> {
	// 	const setSql = this.dialect.buildUpdateSet<GetTableConfig<TTable, 'name'>>(this.config.table, set);

	// 	if (target instanceof SQL) {
	// 		this.config.onConflict = sql<GetTableConfig<TTable, 'name'>>`${target} do update set ${setSql}`;
	// 	} else {
	// 		const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
	// 		this.config.onConflict = sql`on constraint ${targetSql} do update set ${setSql}`;
	// 	}
	// 	return this;
	// }

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TReturning extends undefined ? MySqlQueryResult : TReturning[];
		}
	> {
		return this.session.prepareQuery(this.toSQL(), this.config.returning, name);
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TReturning extends undefined ? MySqlQueryResult : TReturning[];
		}
	> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}
