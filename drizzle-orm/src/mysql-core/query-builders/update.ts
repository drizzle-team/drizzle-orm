import type { GetColumnData } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { AnyMySqlQueryResultHKT, MySqlQueryResultHKT } from '~/mysql-core/session.ts';
import type { MySqlSession } from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type CommentInput, type Placeholder, type Query, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { type InferInsertModel, Table } from '~/table.ts';
import { type Assume, mapUpdateSet, type UpdateSet, type ValueOrArray } from '~/utils.ts';
import type { MySqlColumn } from '../columns/common.ts';

export interface MySqlUpdateConfig {
	where?: SQL | undefined;
	limit?: number | Placeholder;
	orderBy?: (MySqlColumn | SQL | SQL.Aliased)[];
	set: UpdateSet;
	table: MySqlTable;
	withList?: Subquery[];
	comment?: SQL;
}

export type MySqlUpdateSetSource<
	TTable extends MySqlTable,
	TModel extends Record<string, any> = InferInsertModel<TTable>,
> =
	& {
		[Key in keyof TModel & string]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL
			| Placeholder
			| undefined;
	}
	& {};

export interface MySqlUpdateBuilderConstructor {
	new(
		table: MySqlTable,
		set: UpdateSet,
		session: MySqlSession,
		dialect: MySqlDialect,
		withList?: Subquery[],
	): AnyMySqlUpdate;
}

export class MySqlUpdateBuilder<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TBuilderHKT extends MySqlUpdateHKTBase = MySqlUpdateHKT,
> {
	static readonly [entityKind]: string = 'MySqlUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
		private withList?: Subquery[],
		private builder: MySqlUpdateBuilderConstructor = MySqlUpdateBase as unknown as MySqlUpdateBuilderConstructor,
	) {}

	set(values: MySqlUpdateSetSource<TTable>): MySqlUpdateKind<TBuilderHKT, TTable, TQueryResult> {
		return new this.builder(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
			this.withList,
		) as any;
	}
}

export type MySqlUpdateWithout<
	T extends AnyMySqlUpdate,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	MySqlUpdateKind<
		T['_']['hkt'],
		T['_']['table'],
		T['_']['queryResult'],
		TDynamic,
		T['_']['excludedMethods'] | K
	>,
	T['_']['excludedMethods'] | K
>;

export type MySqlUpdateDynamic<T extends AnyMySqlUpdate> = MySqlUpdateKind<
	T['_']['hkt'],
	T['_']['table'],
	T['_']['queryResult'],
	true,
	never
>;

export type MySqlUpdate<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = AnyMySqlQueryResultHKT,
> = MySqlUpdateBase<MySqlUpdateHKT, TTable, TQueryResult, true, never>;

export type AnyMySqlUpdate = MySqlUpdateBase<any, any, any, any, any>;

export interface MySqlUpdateHKTBase {
	table: unknown;
	queryResult: unknown;
	dynamic: boolean;
	excludedMethods: string;
	_type: unknown;
}

export interface MySqlUpdateHKT extends MySqlUpdateHKTBase {
	_type: MySqlUpdateBase<
		MySqlUpdateHKT,
		Assume<this['table'], MySqlTable>,
		Assume<this['queryResult'], MySqlQueryResultHKT>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type MySqlUpdateKind<
	T extends MySqlUpdateHKTBase,
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> = (T & {
	table: TTable;
	queryResult: TQueryResult;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
})['_type'];

export interface MySqlUpdateBase<
	THKT extends MySqlUpdateHKTBase,
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends SQLWrapper {
	readonly _: {
		readonly hkt: THKT;
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class MySqlUpdateBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends MySqlUpdateHKTBase,
	TTable extends MySqlTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TQueryResult extends MySqlQueryResultHKT,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'MySqlUpdate';

	protected config: MySqlUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		protected session: MySqlSession,
		protected dialect: MySqlDialect,
		withList?: Subquery[],
	) {
		this.config = { set, table, withList };
	}

	/**
	 * Adds a 'where' clause to the query.
	 *
	 * Calling this method will update only those rows that fulfill a specified condition.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/update}
	 *
	 * @param where the 'where' clause.
	 *
	 * @example
	 * You can use conditional operators and `sql function` to filter the rows to be updated.
	 *
	 * ```ts
	 * // Update all cars with green color
	 * db.update(cars).set({ color: 'red' })
	 *   .where(eq(cars.color, 'green'));
	 * // or
	 * db.update(cars).set({ color: 'red' })
	 *   .where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Update all BMW cars with a green color
	 * db.update(cars).set({ color: 'red' })
	 *   .where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Update all cars with the green or blue color
	 * db.update(cars).set({ color: 'red' })
	 *   .where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	where(where: SQL | undefined): MySqlUpdateWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	orderBy(
		builder: (updateTable: TTable) => ValueOrArray<MySqlColumn | SQL | SQL.Aliased>,
	): MySqlUpdateWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (MySqlColumn | SQL | SQL.Aliased)[]): MySqlUpdateWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(updateTable: TTable) => ValueOrArray<MySqlColumn | SQL | SQL.Aliased>]
			| (MySqlColumn | SQL | SQL.Aliased)[]
	): MySqlUpdateWithout<this, TDynamic, 'orderBy'> {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.table[Table.Symbol.Columns],
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as any,
			);

			const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
			this.config.orderBy = orderByArray;
		} else {
			const orderByArray = columns as (MySqlColumn | SQL | SQL.Aliased)[];
			this.config.orderBy = orderByArray;
		}
		return this as any;
	}

	limit(limit: number | Placeholder): MySqlUpdateWithout<this, TDynamic, 'limit'> {
		this.config.limit = limit;
		return this as any;
	}

	/**
	 * Attach [sqlcommenter](https://google.github.io/sqlcommenter) comment to a query
	 */
	comment(comment: CommentInput): MySqlUpdateWithout<this, TDynamic, 'comment'> {
		this.config.comment = sql.comment(comment);
		return this as any;
	}

	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	$dynamic(): MySqlUpdateDynamic<this> {
		return this as any;
	}
}
