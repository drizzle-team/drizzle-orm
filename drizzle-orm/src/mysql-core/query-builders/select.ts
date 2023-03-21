import type { AnyMySqlColumn } from '~/mysql-core/columns';
import type { MySqlDialect } from '~/mysql-core/dialect';
import type { MySqlSession, PreparedQuery, PreparedQueryConfig } from '~/mysql-core/session';
import type { SubqueryWithSelection } from '~/mysql-core/subquery';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { getTableColumns } from '~/mysql-core/utils';
import { MySqlViewBase } from '~/mysql-core/view';
import { QueryPromise } from '~/query-promise';
import { type Query, SQL } from '~/sql';
import { SelectionProxyHandler, Subquery, SubqueryConfig } from '~/subquery';
import { Table } from '~/table';
import { applyMixins, type Simplify, type ValueOrArray } from '~/utils';
import { orderSelectedFields } from '~/utils';
import { ViewBaseConfig } from '~/view';
import { QueryBuilder } from './query-builder';
import type {
	BuildSubquerySelection,
	GetSelectTableName,
	GetSelectTableSelection,
	JoinFn,
	JoinNullability,
	JoinType,
	LockConfig,
	LockStrength,
	MySqlSelectConfig,
	MySqlSelectHKT,
	MySqlSelectHKTBase,
	MySqlSelectQueryBuilderHKT,
	SelectFields,
	SelectMode,
	SelectResult,
} from './select.types';

type CreateMySqlSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends SelectMode,
> = TBuilderMode extends 'db' ? MySqlSelect<TTableName, TSelection, TSelectMode>
	: MySqlSelectQueryBuilder<MySqlSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>;

export class MySqlSelectBuilder<TSelection extends SelectFields | undefined, TBuilderMode extends 'db' | 'qb' = 'db'> {
	constructor(
		private fields: TSelection,
		private session: MySqlSession | undefined,
		private dialect: MySqlDialect,
		private withList: Subquery[] = [],
	) {}

	from<TFrom extends AnyMySqlTable | Subquery | MySqlViewBase | SQL>(
		source: TFrom,
	): CreateMySqlSelectFromBuilderMode<
		TBuilderMode,
		GetSelectTableName<TFrom>,
		TSelection extends undefined ? GetSelectTableSelection<TFrom> : TSelection,
		TSelection extends undefined ? 'single' : 'partial'
	> {
		const isPartialSelect = !!this.fields;

		let fields: SelectFields;
		if (this.fields) {
			fields = this.fields;
		} else if (source instanceof Subquery) {
			// This is required to use the proxy handler to get the correct field values from the subquery
			fields = Object.fromEntries(
				Object.keys(source[SubqueryConfig].selection).map((
					key,
				) => [key, source[key as unknown as keyof typeof source] as unknown as SelectFields[string]]),
			);
		} else if (source instanceof MySqlViewBase) {
			fields = source[ViewBaseConfig].selection as SelectFields;
		} else if (source instanceof SQL) {
			fields = {};
		} else {
			fields = getTableColumns(source);
		}

		const fieldsList = orderSelectedFields<AnyMySqlColumn>(fields);
		return new MySqlSelect(
			source,
			fields,
			fieldsList,
			isPartialSelect,
			this.session,
			this.dialect,
			this.withList,
		) as any;
	}
}

export abstract class MySqlSelectQueryBuilder<
	THKT extends MySqlSelectHKTBase,
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends QueryBuilder<BuildSubquerySelection<TSelection, TNullabilityMap>> {
	declare protected $selectMode: TSelectMode;
	declare protected $selection: TSelection;
	declare protected $subquerySelection: BuildSubquerySelection<TSelection, TNullabilityMap>;

	protected config: MySqlSelectConfig;
	protected joinsNotNullableMap: Record<string, boolean>;
	private tableName: string | undefined;

	constructor(
		table: MySqlSelectConfig['table'],
		fields: MySqlSelectConfig['fields'],
		fieldsList: MySqlSelectConfig['fieldsList'],
		private isPartialSelect: boolean,
		protected session: MySqlSession | undefined,
		protected dialect: MySqlDialect,
		withList: Subquery[],
	) {
		super();
		this.config = {
			withList,
			table,
			fields,
			fieldsList,
			joins: [],
			orderBy: [],
			groupBy: [],
		};
		this.$subquerySelection = fields as BuildSubquerySelection<TSelection, TNullabilityMap>;
		this.tableName = table instanceof Subquery
			? table[SubqueryConfig].alias
			: table instanceof MySqlViewBase
			? table[ViewBaseConfig].name
			: table instanceof SQL
			? undefined
			: table[Table.Symbol.Name];
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): JoinFn<THKT, TTableName, TSelectMode, TJoinType, TSelection, TNullabilityMap> {
		return (
			table: AnyMySqlTable | Subquery | SQL,
			on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
		) => {
			const baseTableName = this.tableName;
			const tableName = table instanceof Subquery
				? table[SubqueryConfig].alias
				: table instanceof SQL
				? undefined
				: table[Table.Symbol.Name];

			if (typeof tableName === 'string' && this.config.joins.some((join) => join.alias === tableName)) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (!this.isPartialSelect) {
				// If this is the first join and this is not a partial select and we're not selecting from raw SQL, "move" the fields from the main table to the nested object
				if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === 'string') {
					this.config.fieldsList = this.config.fieldsList.map((field) => ({
						...field,
						path: [baseTableName, ...field.path],
					}));
				}
				if (typeof tableName === 'string' && !(table instanceof SQL)) {
					this.config.fieldsList.push(
						...orderSelectedFields<AnyMySqlColumn>(
							table instanceof Subquery ? table[SubqueryConfig].selection : table[Table.Symbol.Columns],
							[tableName],
						),
					);
				}
			}

			if (typeof on === 'function') {
				on = on(
					new Proxy(
						this.config.fields,
						new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
					) as TSelection,
				);
			}

			this.config.joins.push({ on, table, joinType, alias: tableName });

			if (typeof tableName === 'string') {
				switch (joinType) {
					case 'left':
						this.joinsNotNullableMap[tableName] = false;
						break;
					case 'right':
						this.joinsNotNullableMap = Object.fromEntries(
							Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
						);
						this.joinsNotNullableMap[tableName] = true;
						break;
					case 'inner':
						this.joinsNotNullableMap[tableName] = true;
						break;
					case 'full':
						this.joinsNotNullableMap = Object.fromEntries(
							Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
						);
						this.joinsNotNullableMap[tableName] = false;
						break;
				}
			}

			return this;
		};
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

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

	groupBy(builder: (aliases: TSelection) => ValueOrArray<AnyMySqlColumn | SQL | SQL.Aliased>): this;
	groupBy(...columns: (AnyMySqlColumn | SQL | SQL.Aliased)[]): this;
	groupBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<AnyMySqlColumn | SQL | SQL.Aliased>]
			| (AnyMySqlColumn | SQL | SQL.Aliased)[]
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
			this.config.groupBy = columns as (AnyMySqlColumn | SQL | SQL.Aliased)[];
		}
		return this;
	}

	orderBy(builder: (aliases: TSelection) => ValueOrArray<AnyMySqlColumn | SQL | SQL.Aliased>): this;
	orderBy(...columns: (AnyMySqlColumn | SQL | SQL.Aliased)[]): this;
	orderBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<AnyMySqlColumn | SQL | SQL.Aliased>]
			| (AnyMySqlColumn | SQL | SQL.Aliased)[]
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
			this.config.orderBy = columns as (AnyMySqlColumn | SQL | SQL.Aliased)[];
		}
		return this;
	}

	limit(limit: number) {
		this.config.limit = limit;
		return this;
	}

	offset(offset: number) {
		this.config.offset = offset;
		return this;
	}

	for(strength: LockStrength, config: LockConfig = {}) {
		this.config.lockingClause = { strength, config };
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	toSQL(): Simplify<Omit<Query, 'typings'>> {
		const { typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'subquery_selection', sqlBehavior: 'error' }),
		) as SubqueryWithSelection<BuildSubquerySelection<TSelection, TNullabilityMap>, TAlias>;
	}
}

export interface MySqlSelect<
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends
	MySqlSelectQueryBuilder<MySqlSelectHKT, TTableName, TSelection, TSelectMode, TNullabilityMap>,
	QueryPromise<SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>
{}

export class MySqlSelect<
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends MySqlSelectQueryBuilder<MySqlSelectHKT, TTableName, TSelection, TSelectMode, TNullabilityMap> {
	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
		}
	> {
		if (!this.session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		const query = this.session.prepareQuery<
			PreparedQueryConfig & { execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[] }
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.fieldsList, name);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query;
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
		}
	> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}

applyMixins(MySqlSelect, [QueryPromise]);
