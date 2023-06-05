import type { AnyPgColumn } from '~/pg-core/columns';
import type { PgDialect } from '~/pg-core/dialect';
import type { PgSession, PreparedQuery, PreparedQueryConfig } from '~/pg-core/session';
import type { SubqueryWithSelection } from '~/pg-core/subquery';
import type { AnyPgTable } from '~/pg-core/table';
import { PgViewBase } from '~/pg-core/view';
import { TypedQueryBuilder } from '~/query-builders/query-builder';
import type {
	BuildSubquerySelection,
	GetSelectTableName,
	GetSelectTableSelection,
	JoinNullability,
	JoinType,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types';
import { QueryPromise } from '~/query-promise';
import { type Placeholder, type Query, SQL } from '~/sql';
import { SelectionProxyHandler, Subquery, SubqueryConfig } from '~/subquery';
import { Table } from '~/table';
import { tracer } from '~/tracing';
import { applyMixins, getTableColumns, getTableLikeName, type Simplify, type ValueOrArray } from '~/utils';
import { orderSelectedFields } from '~/utils';
import { type ColumnsSelection, View, ViewBaseConfig } from '~/view';
import type {
	JoinFn,
	LockConfig,
	LockStrength,
	PgSelectConfig,
	PgSelectHKT,
	PgSelectHKTBase,
	PgSelectQueryBuilderHKT,
	SelectedFields,
} from './select.types';

type CreatePgSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
> = TBuilderMode extends 'db' ? PgSelect<TTableName, TSelection, TSelectMode>
	: PgSelectQueryBuilder<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>;

export class PgSelectBuilder<
	TSelection extends SelectedFields | undefined,
	TBuilderMode extends 'db' | 'qb' = 'db',
> {
	constructor(
		private fields: TSelection,
		private session: PgSession | undefined,
		private dialect: PgDialect,
		private withList: Subquery[] = [],
	) {}

	/**
	 * Specify the table, subquery, or other target that you’re
	 * building a select query against.
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-select.html#SQL-FROM|Postgres from documentation}
	 */
	from<TFrom extends AnyPgTable | Subquery | PgViewBase | SQL>(
		source: TFrom,
	): CreatePgSelectFromBuilderMode<
		TBuilderMode,
		GetSelectTableName<TFrom>,
		TSelection extends undefined ? GetSelectTableSelection<TFrom> : TSelection,
		TSelection extends undefined ? 'single' : 'partial'
	> {
		const isPartialSelect = !!this.fields;

		let fields: SelectedFields;
		if (this.fields) {
			fields = this.fields;
		} else if (source instanceof Subquery) {
			// This is required to use the proxy handler to get the correct field values from the subquery
			fields = Object.fromEntries(
				Object.keys(source[SubqueryConfig].selection).map((
					key,
				) => [key, source[key as unknown as keyof typeof source] as unknown as SelectedFields[string]]),
			);
		} else if (source instanceof PgViewBase) {
			fields = source[ViewBaseConfig].selectedFields as SelectedFields;
		} else if (source instanceof SQL) {
			fields = {};
		} else {
			fields = getTableColumns<AnyPgTable>(source);
		}

		return new PgSelect(source, fields, isPartialSelect, this.session, this.dialect, this.withList) as any;
	}
}

export abstract class PgSelectQueryBuilder<
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends TypedQueryBuilder<
	BuildSubquerySelection<TSelection, TNullabilityMap>,
	SelectResult<TSelection, TSelectMode, TNullabilityMap>[]
> {
	override readonly _: {
		readonly selectMode: TSelectMode;
		readonly selection: TSelection;
		readonly result: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
		readonly selectedFields: BuildSubquerySelection<TSelection, TNullabilityMap>;
	};

	protected config: PgSelectConfig;
	protected joinsNotNullableMap: Record<string, boolean>;
	private tableName: string | undefined;

	constructor(
		table: PgSelectConfig['table'],
		fields: PgSelectConfig['fields'],
		private isPartialSelect: boolean,
		protected session: PgSession | undefined,
		protected dialect: PgDialect,
		withList: Subquery[],
	) {
		super();
		this.config = {
			withList,
			table,
			fields: { ...fields },
			joins: [],
			orderBy: [],
			groupBy: [],
			lockingClauses: [],
		};
		this._ = {
			selectedFields: fields as BuildSubquerySelection<TSelection, TNullabilityMap>,
		} as this['_'];
		this.tableName = getTableLikeName(table);
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): JoinFn<THKT, TTableName, TSelectMode, TJoinType, TSelection, TNullabilityMap> {
		return (
			table: AnyPgTable | Subquery | PgViewBase | SQL,
			on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
		) => {
			const baseTableName = this.tableName;
			const tableName = getTableLikeName(table);

			if (typeof tableName === 'string' && this.config.joins.some((join) => join.alias === tableName)) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (!this.isPartialSelect) {
				// If this is the first join and this is not a partial select and we're not selecting from raw SQL, "move" the fields from the main table to the nested object
				if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === 'string') {
					this.config.fields = {
						[baseTableName]: this.config.fields,
					};
				}
				if (typeof tableName === 'string' && !(table instanceof SQL)) {
					const selection = table instanceof Subquery
						? table[SubqueryConfig].selection
						: table instanceof View
						? table[ViewBaseConfig].selectedFields
						: table[Table.Symbol.Columns];
					this.config.fields[tableName] = selection;
				}
			}

			if (typeof on === 'function') {
				on = on(
					new Proxy(
						this.config.fields,
						new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
					) as TSelection,
				);
			}

			this.config.joins.push({ on, table, joinType, alias: tableName });

			if (typeof tableName === 'string') {
				switch (joinType) {
					case 'left': {
						this.joinsNotNullableMap[tableName] = false;
						break;
					}
					case 'right': {
						this.joinsNotNullableMap = Object.fromEntries(
							Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
						);
						this.joinsNotNullableMap[tableName] = true;
						break;
					}
					case 'inner': {
						this.joinsNotNullableMap[tableName] = true;
						break;
					}
					case 'full': {
						this.joinsNotNullableMap = Object.fromEntries(
							Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
						);
						this.joinsNotNullableMap[tableName] = false;
						break;
					}
				}
			}

			return this;
		};
	}

	/**
	 * For each row of the table, include
	 * values from a matching row of the joined
	 * table, if there is a matching row. If not,
	 * all of the columns of the joined table
	 * will be set to null.
	 */
	leftJoin = this.createJoin('left');

	/**
	 * Includes all of the rows of the joined table.
	 * If there is no matching row in the main table,
	 * all the columns of the main table will be
	 * set to null.
	 */
	rightJoin = this.createJoin('right');

	/**
	 * This is the default type of join.
	 *
	 * For each row of the table, the joined table
	 * needs to have a matching row, or it will
	 * be excluded from results.
	 */
	innerJoin = this.createJoin('inner');

	/**
	 * Rows from both the main & joined are included,
	 * regardless of whether or not they have matching
	 * rows in the other table.
	 */
	fullJoin = this.createJoin('full');

	/**
	 * Specify a condition to narrow the result set. Multiple
	 * conditions can be combined with the `and` and `or`
	 * functions.
	 *
	 * ## Examples
	 *
	 * ```ts
	 * // Find cars made in the year 2000
	 * db.select().from(cars).where(eq(cars.year, 2000));
	 * ```
	 */
	where(where: ((aliases: TSelection) => SQL | undefined) | SQL | undefined) {
		if (typeof where === 'function') {
			where = where(
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
				) as TSelection,
			);
		}
		this.config.where = where;
		return this;
	}

	/**
	 * Sets the HAVING clause of this query, which often
	 * used with GROUP BY and filters rows after they've been
	 * grouped together and combined.
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-select.html#SQL-HAVING|Postgres having clause documentation}
	 */
	having(having: ((aliases: TSelection) => SQL | undefined) | SQL | undefined) {
		if (typeof having === 'function') {
			having = having(
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
				) as TSelection,
			);
		}
		this.config.having = having;
		return this;
	}

	/**
	 * Specify the GROUP BY of this query: given
	 * a list of columns or SQL expressions, Postgres will
	 * combine all rows with the same values in those columns
	 * into a single row.
	 *
	 * ## Examples
	 *
	 * ```ts
	 * // Group and count people by their last names
	 * db.select({
	 *    lastName: people.lastName,
	 *    count: sql<number>`count(*)::integer`
	 * }).from(people).groupBy(people.lastName);
	 * ```
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-select.html#SQL-GROUPBY|Postgres GROUP BY documentation}
	 */
	groupBy(builder: (aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>): this;
	groupBy(...columns: (AnyPgColumn | SQL | SQL.Aliased)[]): this;
	groupBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>]
			| (AnyPgColumn | SQL | SQL.Aliased)[]
	) {
		if (typeof columns[0] === 'function') {
			const groupBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
		} else {
			this.config.groupBy = columns as (AnyPgColumn | SQL | SQL.Aliased)[];
		}
		return this;
	}

	/**
	 * Specify the ORDER BY clause of this query: a number of
	 * columns or SQL expressions that will control sorting
	 * of results. You can specify whether results are in ascending
	 * or descending order with the `asc()` and `desc()` operators.
	 *
	 * ## Examples
	 *
	 * ```
	 * // Select cars by year released
	 * db.select().from(cars).orderBy(cars.year);
	 * ```
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-select.html#SQL-ORDERBY|Postgres ORDER BY documentation}
	 */
	orderBy(builder: (aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>): this;
	orderBy(...columns: (AnyPgColumn | SQL | SQL.Aliased)[]): this;
	orderBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>]
			| (AnyPgColumn | SQL | SQL.Aliased)[]
	) {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
		} else {
			this.config.orderBy = columns as (AnyPgColumn | SQL | SQL.Aliased)[];
		}
		return this;
	}

	/**
	 * Set the maximum number of rows that will be
	 * returned by this query.
	 *
	 * ## Examples
	 *
	 * ```ts
	 * // Get the first 10 people from this query.
	 * db.select().from(people).limit(10);
	 * ```
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-select.html#SQL-LIMIT|Postgres LIMIT documentation}
	 */
	limit(limit: number | Placeholder) {
		this.config.limit = limit;
		return this;
	}

	/**
	 * Skip a number of rows when returning results
	 * from this query.
	 *
	 * ## Examples
	 *
	 * ```ts
	 * // Get the 10th-20th people from this query.
	 * db.select().from(people).offset(10).limit(10);
	 * ```
	 */
	offset(offset: number | Placeholder) {
		this.config.offset = offset;
		return this;
	}

	/**
	 * The FOR clause specifies a lock strength for this query
	 * that controls how strictly it acquires exclusive access to
	 * the rows being queried.
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE|Postgres locking clause documentation}
	 */
	for(strength: LockStrength, config: LockConfig = {}) {
		this.config.lockingClauses.push({ strength, config });
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	toSQL(): Simplify<Omit<Query, 'typings'>> {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias>;
	}
}

export interface PgSelect<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends
	PgSelectQueryBuilder<PgSelectHKT, TTableName, TSelection, TSelectMode, TNullabilityMap>,
	QueryPromise<SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>
{}

export class PgSelect<
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends PgSelectQueryBuilder<PgSelectHKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
		}
	> {
		const { session, config, dialect, joinsNotNullableMap } = this;
		if (!session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const fieldsList = orderSelectedFields<AnyPgColumn>(config.fields);
			const query = session.prepareQuery<
				PreparedQueryConfig & { execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[] }
			>(dialect.sqlToQuery(this.getSQL()), fieldsList, name);
			query.joinsNotNullableMap = joinsNotNullableMap;
			return query;
		});
	}

	/**
	 * Create a prepared statement for this query. This allows
	 * the database to remember this query for the given session
	 * and call it by name, rather than specifying the full query.
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-prepare.html|Postgres prepare documentation}
	 */
	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
		}
	> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};
}

applyMixins(PgSelect, [QueryPromise]);
