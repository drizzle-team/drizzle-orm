import { entityKind } from '~/entity.ts';
import { PgCommonSelectBuilder, getPgSetOperators } from './select.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { PgInsertBase, type PgInsertConfig, type PgInsertOnConflictDoUpdateConfig } from './insert.ts';
import { type ValueOrArray, getTableLikeName, haveSameKeys } from '~/utils.ts';
import type { PgTable } from '../table.ts';
import type { Subquery } from '~/subquery.ts';
import type { PgViewBase } from '../view-base.ts';
import type { ColumnsSelection, Placeholder, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { PgSession, PreparedQuery, PreparedQueryConfig, QueryResultHKT, QueryResultKind } from '../session.ts';
import type { PgDialect } from '../dialect.ts';
import type { AnyPgColumn, PgColumn } from '~/pg-core/columns/index.ts';
import type { IndexColumn } from '../indexes.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	GetSelectTableName,
	GetSelectTableSelection,
	JoinNullability,
	JoinType,
	SelectResult,
	SelectResultFields,
	SetOperator
} from '~/query-builders/select.types.ts';
import type {
	GetPgSetOperators,
	LockConfig,
	LockStrength,
	PgJoinFn,
	PgSelectConfig,
	PgSelectConstructorConfig,
	PgSetOperatorExcludedMethods,
	PgSetOperatorWithResult,
	SelectedFields,
	SelectedFieldsFlat,
	SetOperatorRightSelect,
} from './select.types.ts';

export interface PgInsertSelectConfig<TTable extends PgTable = PgTable> extends PgInsertConfig<TTable> {
	selectConfig: PgSelectConfig;
}

export type PgInsertSelectedFields<TTable extends PgTable> =
	& {
		[Key in keyof TTable['$inferInsert']]: AnyPgColumn | SQL | SQL.Aliased;
	}
	& {};

export class PgInsertSelectBuilder<
	TInsertTable extends PgTable,
  TSelection extends SelectedFields,
	TQueryResult extends QueryResultHKT
> extends PgCommonSelectBuilder<TSelection> {
  static readonly [entityKind]: string = 'PgInsertSelectBuilder';

	protected override session: PgSession<QueryResultHKT, Record<string, never>, Record<string, never>>;
	private insertTable: TInsertTable;

  constructor(
		config: {
			fields: TSelection;
			session: PgSession;
			dialect: PgDialect;
			withList?: Subquery[];
			distinct?: boolean | {
				on: (PgColumn | SQLWrapper)[];
			};
			insertTable: TInsertTable;
		},
	) {
		super(config);
		this.session = config.session;
		this.insertTable = config.insertTable;
	}

	from<TFrom extends PgTable | Subquery | PgViewBase | SQL>(
		source: TFrom,
	): PgInsertSelectBase<
		TInsertTable,
		GetSelectTableName<TFrom>,
		TQueryResult,
		TSelection extends undefined ? GetSelectTableSelection<TFrom> : TSelection,
		undefined
	> {
		const fields = this.getSelectedFields(source);

		return new PgInsertSelectBase({
			table: this.insertTable,
			values: [],
			session: this.session,
			dialect: this.dialect,
		}, {
			table: source,
			fields,
			withList: this.withList,
			distinct: this.distinct,
		}) as any;
	}
}

export type PgInsertSelectWithout<T extends AnyPgInsertSelect, TDynamic extends boolean, K extends keyof T & string> =
	TDynamic extends true ? T
		: Omit<
			PgInsertSelectBase<
				T['_']['table'],
				T['_']['selectTableName'],
				T['_']['queryResult'],
				T['_']['selection'],
				T['_']['returning'],
				T['_']['nullabilityMap'],
				T['_']['result'],
				T['_']['selectedFields'],
				TDynamic,
				T['_']['excludedMethods'] | K
			>,
			T['_']['excludedMethods'] | K
		>;

export type PgInsertSelectReturning<
	T extends AnyPgInsertSelect,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = PgInsertSelectBase<
	T['_']['table'],
	T['_']['selectTableName'],
	T['_']['queryResult'],
	T['_']['selection'],
	SelectResultFields<TSelectedFields>,
	T['_']['nullabilityMap'],
	T['_']['result'],
	T['_']['selectedFields'],
	TDynamic,
	T['_']['excludedMethods']
>;
	
export type PgInsertSelectReturningAll<T extends AnyPgInsertSelect, TDynamic extends boolean> = PgInsertSelectBase<
	T['_']['table'],
	T['_']['selectTableName'],
	T['_']['queryResult'],
	T['_']['selection'],
	T['_']['table']['$inferSelect'],
	T['_']['nullabilityMap'],
	T['_']['result'],
	T['_']['selectedFields'],
	TDynamic,
	T['_']['excludedMethods']
>;

export type PgInsertSelectPrepare<T extends AnyPgInsertSelect> = PreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? QueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type PgInsertSelectDynamic<T extends AnyPgInsertSelect> = PgInsertSelect<
	T['_']['table'],
	T['_']['selectTableName'],
	T['_']['queryResult'],
	T['_']['selection'],
	T['_']['returning'],
	T['_']['nullabilityMap'],
	T['_']['result'],
	T['_']['selectedFields']
>;

export type AnyPgInsertSelect = PgInsertSelectBase<any, any, any, any, any, any, any, any, any, any>;

export type PgInsertSelect<
	TInsertTable extends PgTable = PgTable,
	TSelectTableName extends string | undefined = string | undefined,
	TQueryResult extends QueryResultHKT = QueryResultHKT,
	TSelection extends ColumnsSelection = ColumnsSelection,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TNullabilityMap extends Record<string, JoinNullability> = TSelectTableName extends string
		? Record<TSelectTableName, 'not-null'>
		: {},
	TResult extends any[] = unknown[],
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = PgInsertSelectBase<
	TInsertTable,
	TSelectTableName,
	TQueryResult,
	TSelection,
	TReturning,
	TNullabilityMap,
	TResult,
	TSelectedFields,
	true,
	never
>;

export interface PgInsertSelectBase<
	TInsertTable extends PgTable,
	TSelectTableName extends string | undefined,
	TQueryResult extends QueryResultHKT,
	TSelection extends ColumnsSelection,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TNullabilityMap extends Record<string, JoinNullability> = TSelectTableName extends string
		? Record<TSelectTableName, 'not-null'>
		: {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResult extends any[] = SelectResult<TSelection, 'partial', TNullabilityMap>[],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends PgInsertBase<TInsertTable, TQueryResult, TReturning, TDynamic, TExcludedMethods> {
	/** @internal */
	config: PgInsertSelectConfig<TInsertTable>;

	returning(): PgInsertSelectWithout<PgInsertSelectReturningAll<this, TDynamic>, TDynamic, 'returning'>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): PgInsertSelectWithout<PgInsertSelectReturning<this, TDynamic, TSelectedFields>, TDynamic, 'returning'>;
	returning(
		fields: SelectedFieldsFlat,
	): PgInsertSelectWithout<AnyPgInsertSelect, TDynamic, 'returning'>

	onConflictDoNothing(
		config?: { target?: IndexColumn | IndexColumn[]; where?: SQL },
	): PgInsertSelectWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'>;

	onConflictDoUpdate(
		config?: PgInsertOnConflictDoUpdateConfig<this>,
	): PgInsertSelectWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'>;

	prepare(name: string): PgInsertSelectPrepare<this>;

	$dynamic(): PgInsertSelectDynamic<this>;
}
export class PgInsertSelectBase<
	TInsertTable extends PgTable,
	TSelectTableName extends string | undefined,
	TQueryResult extends QueryResultHKT,
	TSelection extends ColumnsSelection,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TNullabilityMap extends Record<string, JoinNullability> = TSelectTableName extends string
		? Record<TSelectTableName, 'not-null'>
		: {},
	TResult extends any[] = SelectResult<TSelection, 'partial', TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends PgInsertBase<TInsertTable, TQueryResult, TReturning, TDynamic, TExcludedMethods> {
	static readonly [entityKind]: string = 'PgInsertSelect';

	override readonly _: {
		readonly table: TInsertTable;
		readonly selectTableName: TSelectTableName;
		readonly queryResult: TQueryResult;
		readonly selection: TSelection;
		readonly returning: TReturning;
		readonly nullabilityMap: TNullabilityMap;
		readonly dynamic: TDynamic;
		readonly selectedFields: TSelectedFields;
		readonly result: TResult;
		readonly excludedMethods: TExcludedMethods;
	};

	private joinsNotNullableMap: Record<string, boolean>;
	private tableName: string | undefined;

	constructor(insertConfig: {
		table: TInsertTable,
		values: PgInsertConfig['values'],
		session: PgSession,
		dialect: PgDialect,
	}, selectConfig: PgSelectConstructorConfig) {
		super(insertConfig);
		this.tableName = getTableLikeName(selectConfig.table);
		this.joinsNotNullableMap = typeof this.tableName === 'string' ? { [this.tableName]: true } : {};
		this.config.selectConfig = {
			withList: selectConfig.withList,
			table: selectConfig.table,
			fields: { ...selectConfig.fields },
			distinct: selectConfig.distinct,
			setOperators: [],
		};
		this._ = {
			selectedFields: selectConfig.fields as TSelectedFields,
		} as this['_'];
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): PgJoinFn<this, TDynamic, TJoinType> {
		return (
			table: PgTable | Subquery | PgViewBase | SQL,
			on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
		) => {
			const tableName = getTableLikeName(table);

			if (typeof tableName === 'string' && this.config.selectConfig.joins?.some((join) => join.alias === tableName)) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (typeof on === 'function') {
				on = on(
					new Proxy(
						this.config.selectConfig.fields,
						new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
					) as TSelection,
				);
			}

			if (!this.config.selectConfig.joins) {
				this.config.selectConfig.joins = [];
			}

			this.config.selectConfig.joins.push({ on, table, joinType, alias: tableName });

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

			return this as any;
		};
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	private createSetOperator(
		type: SetOperator,
		isAll: boolean,
	): <TValue extends PgSetOperatorWithResult<TResult>>(
		rightSelection:
			| ((setOperators: GetPgSetOperators) => SetOperatorRightSelect<TValue, TResult>)
			| SetOperatorRightSelect<TValue, TResult>,
	) => PgInsertSelectWithout<
		this,
		TDynamic,
		PgSetOperatorExcludedMethods
	> {
		return (rightSelection) => {
			const rightSelect = (typeof rightSelection === 'function'
				? rightSelection(getPgSetOperators())
				: rightSelection) as TypedQueryBuilder<
					any,
					TResult
				>;

			if (!haveSameKeys(this.getSelectedFields(), rightSelect.getSelectedFields())) {
				throw new Error(
					'Set operator error (union / intersect / except): selected fields are not the same or are in a different order',
				);
			}

			this.config.selectConfig.setOperators.push({ type, isAll, rightSelect });
			return this as any;
		};
	}

	union = this.createSetOperator('union', false);

	unionAll = this.createSetOperator('union', true);

	intersect = this.createSetOperator('intersect', false);

	intersectAll = this.createSetOperator('intersect', true);

	except = this.createSetOperator('except', false);

	exceptAll = this.createSetOperator('except', true);

	where(
		where: ((aliases: this['_']['selection']) => SQL | undefined) | SQL | undefined,
	): PgInsertSelectWithout<this, TDynamic, 'where'> {
		if (typeof where === 'function') {
			where = where(
				new Proxy(
					this.config.selectConfig.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
				) as TSelection,
			);
		}
		this.config.selectConfig.where = where;
		return this as any;
	}

	having(
		having: ((aliases: this['_']['selection']) => SQL | undefined) | SQL | undefined,
	): PgInsertSelectWithout<this, TDynamic, 'having'> {
		if (typeof having === 'function') {
			having = having(
				new Proxy(
					this.config.selectConfig.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
				) as TSelection,
			);
		}
		this.config.selectConfig.having = having;
		return this as any;
	}

	groupBy(
		builder: (aliases: this['_']['selection']) => ValueOrArray<PgColumn | SQL | SQL.Aliased>,
	): PgInsertSelectWithout<this, TDynamic, 'groupBy'>;
	groupBy(...columns: (PgColumn | SQL | SQL.Aliased)[]): PgInsertSelectWithout<this, TDynamic, 'groupBy'>;
	groupBy(
		...columns:
			| [(aliases: this['_']['selection']) => ValueOrArray<PgColumn | SQL | SQL.Aliased>]
			| (PgColumn | SQL | SQL.Aliased)[]
	): PgInsertSelectWithout<this, TDynamic, 'groupBy'> {
		if (typeof columns[0] === 'function') {
			const groupBy = columns[0](
				new Proxy(
					this.config.selectConfig.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.selectConfig.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
		} else {
			this.config.selectConfig.groupBy = columns as (PgColumn | SQL | SQL.Aliased)[];
		}
		return this as any;
	}

	orderBy(
		builder: (aliases: this['_']['selection']) => ValueOrArray<PgColumn | SQL | SQL.Aliased>,
	): PgInsertSelectWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (PgColumn | SQL | SQL.Aliased)[]): PgInsertSelectWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(aliases: this['_']['selection']) => ValueOrArray<PgColumn | SQL | SQL.Aliased>]
			| (PgColumn | SQL | SQL.Aliased)[]
	): PgInsertSelectWithout<this, TDynamic, 'orderBy'> {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.selectConfig.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);

			const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];

			if (this.config.selectConfig.setOperators.length > 0) {
				this.config.selectConfig.setOperators.at(-1)!.orderBy = orderByArray;
			} else {
				this.config.selectConfig.orderBy = orderByArray;
			}
		} else {
			const orderByArray = columns as (PgColumn | SQL | SQL.Aliased)[];

			if (this.config.selectConfig.setOperators.length > 0) {
				this.config.selectConfig.setOperators.at(-1)!.orderBy = orderByArray;
			} else {
				this.config.selectConfig.orderBy = orderByArray;
			}
		}
		return this as any;
	}

	limit(limit: number | Placeholder): PgInsertSelectWithout<this, TDynamic, 'limit'> {
		if (this.config.selectConfig.setOperators.length > 0) {
			this.config.selectConfig.setOperators.at(-1)!.limit = limit;
		} else {
			this.config.selectConfig.limit = limit;
		}
		return this as any;
	}

	offset(offset: number | Placeholder): PgInsertSelectWithout<this, TDynamic, 'offset'> {
		if (this.config.selectConfig.setOperators.length > 0) {
			this.config.selectConfig.setOperators.at(-1)!.offset = offset;
		} else {
			this.config.selectConfig.offset = offset;
		}
		return this as any;
	}

	for(strength: LockStrength, config: LockConfig = {}): PgInsertSelectWithout<this, TDynamic, 'for'> {
		this.config.selectConfig.lockingClause = { strength, config };
		return this as any;
	}

	private getSelectedFields(): this['_']['selectedFields'] {
		return new Proxy(
			this.config.selectConfig.fields,
			new SelectionProxyHandler({ alias: this.tableName, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
		) as this['_']['selectedFields'];
	}
}
