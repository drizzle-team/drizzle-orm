import { entityKind, is } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL, SQLWrapper } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { applyMixins, getTableColumns, getTableLikeName, orderSelectedFields } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { DSQLColumn } from '../columns/common.ts';
import type { DSQLDialect } from '../dialect.ts';
import type { DSQLSession } from '../session.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLViewBase } from '../view-base.ts';
import type { DSQLSelectConfig, DSQLSelectJoinConfig } from './select.types.ts';

export interface SelectedFields {
	[key: string]: unknown;
}

type JoinType = 'left' | 'right' | 'inner' | 'full' | 'cross';
type SetOperator = 'union' | 'intersect' | 'except';

export class DSQLSelectBuilder<TSelection extends SelectedFields | undefined = undefined> {
	static readonly [entityKind]: string = 'DSQLSelectBuilder';

	private fields: TSelection;
	private session: DSQLSession | undefined;
	private dialect: DSQLDialect;
	private withList: Subquery[] = [];
	private distinct: boolean | { on: (DSQLColumn | SQLWrapper)[] } | undefined;

	constructor(
		config: {
			fields: TSelection;
			session: DSQLSession | undefined;
			dialect: DSQLDialect;
			withList?: Subquery[];
			distinct?: boolean | { on: (DSQLColumn | SQLWrapper)[] };
		},
	) {
		this.fields = config.fields;
		this.session = config.session;
		this.dialect = config.dialect;
		if (config.withList) {
			this.withList = config.withList;
		}
		this.distinct = config.distinct;
	}

	from<TFrom extends DSQLTable | Subquery | DSQLViewBase | SQL>(
		source: TFrom,
	): DSQLSelectBase<any, any, any, any> {
		const isPartialSelect = !!this.fields;

		let fields: SelectedFields;
		if (this.fields) {
			fields = this.fields as SelectedFields;
		} else if (is(source, Subquery)) {
			fields = Object.fromEntries(
				Object.keys(source._.selectedFields).map((
					key,
				) => [key, source[key as unknown as keyof typeof source] as unknown as SelectedFields[string]]),
			);
		} else if (is(source, DSQLViewBase)) {
			fields = source[ViewBaseConfig].selectedFields as SelectedFields;
		} else if (is(source, Table)) {
			fields = getTableColumns<DSQLTable>(source as DSQLTable);
		} else {
			fields = {};
		}

		return new DSQLSelectBase({
			table: source,
			fields,
			isPartialSelect,
			session: this.session,
			dialect: this.dialect,
			withList: this.withList,
			distinct: this.distinct,
		});
	}
}

export abstract class DSQLSelectQueryBuilderBase<
	_THKT extends any,
	_TTableName extends string | undefined,
	_TSelection,
	_TSelectMode extends 'partial' | 'single' | 'multiple',
> {
	static readonly [entityKind]: string = 'DSQLSelectQueryBuilder';

	protected config: DSQLSelectConfig;
	protected dialect: DSQLDialect;
	protected session: DSQLSession | undefined;
	private tableName: string | undefined;
	private isPartialSelect: boolean;
	protected joinsNotNullableMap: Record<string, boolean>;

	constructor(config: {
		table: DSQLSelectConfig['table'];
		fields: DSQLSelectConfig['fields'];
		isPartialSelect: boolean;
		session: DSQLSession | undefined;
		dialect: DSQLDialect;
		withList?: Subquery[];
		distinct?: boolean | { on: (DSQLColumn | SQLWrapper)[] };
	}) {
		this.config = {
			withList: config.withList,
			table: config.table,
			fields: { ...config.fields },
			distinct: config.distinct,
			setOperators: [],
		};
		this.isPartialSelect = config.isPartialSelect;
		this.session = config.session;
		this.dialect = config.dialect;
		this.tableName = getTableLikeName(config.table);
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
	}

	// Join methods
	private createJoin(joinType: JoinType) {
		return (
			table: DSQLTable | Subquery | DSQLViewBase | SQL,
			on?: SQL | undefined,
		): this => {
			const tableName = getTableLikeName(table);

			if (typeof tableName === 'string' && this.config.joins?.some((join) => join.alias === tableName)) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (!this.isPartialSelect) {
				const baseTableName = this.tableName;
				if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === 'string') {
					this.config.fields = {
						[baseTableName]: this.config.fields,
					};
				}
				if (typeof tableName === 'string' && !is(table, SQL)) {
					const selection = is(table, Subquery)
						? table._.selectedFields
						: is(table, DSQLViewBase)
						? table[ViewBaseConfig].selectedFields
						: (table as DSQLTable)[Table.Symbol.Columns];
					this.config.fields[tableName] = selection;
				}
			}

			if (!this.config.joins) {
				this.config.joins = [];
			}

			this.config.joins.push({
				on,
				table: table as DSQLTable | SQL,
				joinType: joinType === 'cross' ? 'inner' : joinType,
				alias: tableName,
			} as DSQLSelectJoinConfig);

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
					case 'cross':
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
	 * Executes a `left join` operation by adding another table to the current query.
	 */
	leftJoin = this.createJoin('left');

	/**
	 * Executes a `right join` operation by adding another table to the current query.
	 */
	rightJoin = this.createJoin('right');

	/**
	 * Executes an `inner join` operation, creating a new table by combining rows from two tables that have matching values.
	 */
	innerJoin = this.createJoin('inner');

	/**
	 * Executes a `full join` operation by combining rows from two tables into a new table.
	 */
	fullJoin = this.createJoin('full');

	/**
	 * Executes a `cross join` operation by combining rows from two tables into a new table.
	 */
	crossJoin = this.createJoin('cross');

	// Set operation methods
	private createSetOperator(type: SetOperator, isAll: boolean) {
		return (rightSelect: SQLWrapper): this => {
			this.config.setOperators.push({
				type,
				isAll,
				rightSelect: rightSelect.getSQL(),
			});
			return this;
		};
	}

	/**
	 * Adds `union` set operator to the query.
	 */
	union = this.createSetOperator('union', false);

	/**
	 * Adds `union all` set operator to the query.
	 */
	unionAll = this.createSetOperator('union', true);

	/**
	 * Adds `intersect` set operator to the query.
	 */
	intersect = this.createSetOperator('intersect', false);

	/**
	 * Adds `intersect all` set operator to the query.
	 */
	intersectAll = this.createSetOperator('intersect', true);

	/**
	 * Adds `except` set operator to the query.
	 */
	except = this.createSetOperator('except', false);

	/**
	 * Adds `except all` set operator to the query.
	 */
	exceptAll = this.createSetOperator('except', true);

	where(where: SQL | undefined): this {
		this.config.where = where;
		return this;
	}

	having(having: SQL | undefined): this {
		this.config.having = having;
		return this;
	}

	groupBy(...columns: (DSQLColumn | SQL)[]): this {
		this.config.groupBy = columns as (DSQLColumn | SQL | SQL.Aliased)[];
		return this;
	}

	orderBy(...columns: (DSQLColumn | SQL)[]): this {
		this.config.orderBy = columns as (DSQLColumn | SQL | SQL.Aliased)[];
		return this;
	}

	limit(limit: number): this {
		this.config.limit = limit;
		return this;
	}

	offset(offset: number): this {
		this.config.offset = offset;
		return this;
	}

	for(
		strength: 'update' | 'no key update' | 'share' | 'key share',
		config: { noWait?: boolean; skipLocked?: boolean } = {},
	): this {
		this.config.lockingClause = { strength, config };
		return this;
	}

	/**
	 * Creates a subquery that can be used in other queries.
	 */
	as<TAlias extends string>(
		alias: TAlias,
	): Subquery<TAlias, ColumnsSelection> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields as ColumnsSelection, alias),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as Subquery<TAlias, ColumnsSelection>;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	toSQL(): { sql: string; params: unknown[] } {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	/** @internal */
	getSelectedFields(): Record<string, unknown> {
		return this.config.fields;
	}

	$dynamic(): this {
		return this;
	}
}

// Interface for declaration merging - allows DSQLSelectBase to "extend" both
// DSQLSelectQueryBuilderBase and QueryPromise (TypeScript only allows single class inheritance)
export interface DSQLSelectBase<
	THKT extends any,
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends 'partial' | 'single' | 'multiple',
> extends
	DSQLSelectQueryBuilderBase<THKT, TTableName, TSelection, TSelectMode>,
	QueryPromise<any[]>,
	SQLWrapper
{}

export class DSQLSelectBase<
	THKT extends any,
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends 'partial' | 'single' | 'multiple',
> extends DSQLSelectQueryBuilderBase<THKT, TTableName, TSelection, TSelectMode>
	implements SQLWrapper
{
	static override readonly [entityKind]: string = 'DSQLSelect';

	private _prepare(name?: string) {
		const { session, config, dialect, joinsNotNullableMap } = this;
		if (!session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		const fieldsList = orderSelectedFields<DSQLColumn>(config.fields);
		const query = session.prepareQuery<any>(
			dialect.sqlToQuery(this.getSQL()),
			fieldsList,
			name,
			true,
		);
		query.joinsNotNullableMap = joinsNotNullableMap;
		return query;
	}

	prepare(name: string) {
		return this._prepare(name);
	}

	execute(): Promise<any[]> {
		return this._prepare().execute();
	}

	then<TResult1 = any[], TResult2 = never>(
		onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		return this.execute().then(onfulfilled, onrejected);
	}
}

applyMixins(DSQLSelectBase, [QueryPromise]);
