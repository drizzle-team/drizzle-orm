import { AnyPgColumn } from '~/pg-core/columns';
import { PgDialect } from '~/pg-core/dialect';
import { PgSession, PreparedQuery, PreparedQueryConfig } from '~/pg-core/session';
import { AnyPgTable, GetTableConfig } from '~/pg-core/table';
import { QueryPromise } from '~/query-promise';
import { Query, SQL, SQLWrapper } from '~/sql';
import {
	GetSubquerySelection,
	SelectionProxyHandler,
	Subquery,
	SubqueryConfig,
	SubqueryWithSelection,
	WithSubquery,
	WithSubqueryWithSelection,
} from '~/subquery';
import { Table } from '~/table';
import { orderSelectedFields, Simplify, ValueOrArray } from '~/utils';
import { getTableColumns } from '../utils';
import {
	AnyPgSelect,
	BuildSubquerySelection,
	GetSelectTableName,
	JoinFn,
	JoinNullability,
	JoinType,
	LockConfig,
	LockStrength,
	PgSelectConfig,
	SelectFields,
	SelectMode,
	SelectResult,
} from './select.types';

export class PgSelectBuilder<TSelection extends SelectFields | undefined> {
	constructor(
		private fields: TSelection,
		private session: PgSession,
		private dialect: PgDialect,
		private withList: Subquery[] = [],
	) {}

	from<TSubquery extends Subquery>(
		subquery: TSubquery,
	): PgSelect<
		TSubquery,
		TSelection extends undefined ? GetSubquerySelection<TSubquery> : TSelection,
		TSelection extends undefined ? 'single' : 'partial'
	>;
	from<TTable extends AnyPgTable>(
		table: TTable,
	): PgSelect<
		TTable,
		TSelection extends undefined ? GetTableConfig<TTable, 'columns'> : TSelection,
		TSelection extends undefined ? 'single' : 'partial'
	>;
	from(table: AnyPgTable | Subquery): AnyPgSelect {
		const isPartialSelect = !!this.fields;

		let fields: SelectFields;
		if (this.fields) {
			fields = this.fields;
		} else if (table instanceof Subquery) {
			// This is required to use the proxy handler to get the correct field values from the subquery
			fields = Object.fromEntries(
				Object.keys(table[SubqueryConfig].selection).map((
					key,
				) => [key, table[key as unknown as keyof typeof table] as unknown as SelectFields[string]]),
			);
		} else {
			fields = getTableColumns(table);
		}

		const fieldsList = orderSelectedFields<AnyPgColumn>(fields);
		return new PgSelect(table, fields, fieldsList, isPartialSelect, this.session, this.dialect, this.withList);
	}
}

export interface PgSelect<
	TTable extends AnyPgTable | Subquery,
	TSelection,
	TSelectMode extends SelectMode = 'single',
	TNullability extends Record<string, JoinNullability> = Record<GetSelectTableName<TTable>, 'not-null'>,
> extends QueryPromise<SelectResult<TSelection, TSelectMode, TNullability>[]>, SQLWrapper {}

export class PgSelect<
	TTable extends AnyPgTable | Subquery,
	TSelection,
	TSelectMode extends SelectMode = 'single',
	TNullability extends Record<string, JoinNullability> = Record<GetSelectTableName<TTable>, 'not-null'>,
> extends QueryPromise<SelectResult<TSelection, TSelectMode, TNullability>[]> implements SQLWrapper {
	declare protected $table: TTable;
	declare protected $selectMode: TSelectMode;
	declare protected $selection: TSelection;

	private config: PgSelectConfig;
	private joinsNotNullable: Record<string, boolean>;
	private tableName: string;

	constructor(
		table: PgSelectConfig['table'],
		fields: PgSelectConfig['fields'],
		fieldsList: PgSelectConfig['fieldsList'],
		private isPartialSelect: boolean,
		private session: PgSession,
		private dialect: PgDialect,
		withList: Subquery[],
	) {
		super();
		this.config = {
			withList,
			table,
			fields,
			fieldsList,
			joins: {},
			orderBy: [],
			groupBy: [],
			lockingClauses: [],
		};
		this.tableName = table instanceof Subquery ? table[SubqueryConfig].alias : table[Table.Symbol.Name];
		this.joinsNotNullable = { [this.tableName]: true };
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): JoinFn<TTable, TSelectMode, TJoinType, TSelection, TNullability> {
		return (
			table: AnyPgTable | Subquery,
			on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
		): AnyPgSelect => {
			const tableName = table instanceof Subquery ? table[SubqueryConfig].alias : table[Table.Symbol.Name];

			if (this.config.joins[tableName]) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (!this.isPartialSelect) {
				// If this is the first join and this is not a partial select, "move" the fields from the main table to the nested object
				if (Object.keys(this.joinsNotNullable).length === 1) {
					this.config.fieldsList = this.config.fieldsList.map((field) => ({
						...field,
						path: [this.tableName, ...field.path],
					}));
				}
				this.config.fieldsList.push(
					...orderSelectedFields<AnyPgColumn>(
						table instanceof Subquery ? table[SubqueryConfig].selection : table[Table.Symbol.Columns],
						[tableName],
					),
				);
			}

			if (typeof on === 'function') {
				on = on(
					new Proxy(
						this.config.fields,
						new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
					) as TSelection,
				);
			}

			this.config.joins[tableName] = { on, table, joinType };

			switch (joinType) {
				case 'left':
					this.joinsNotNullable[tableName] = false;
					break;
				case 'right':
					this.joinsNotNullable = Object.fromEntries(
						Object.entries(this.joinsNotNullable).map(([key]) => [key, false]),
					);
					this.joinsNotNullable[tableName] = true;
					break;
				case 'inner':
					this.joinsNotNullable[tableName] = true;
					break;
				case 'full':
					this.joinsNotNullable = Object.fromEntries(
						Object.entries(this.joinsNotNullable).map(([key]) => [key, false]),
					);
					this.joinsNotNullable[tableName] = false;
					break;
			}

			return this;
		};
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	where(
		where: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
	): Omit<this, 'where' | `${JoinType}Join`> {
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

	having(
		having: ((aliases: TSelection) => SQL | undefined) | SQL | undefined,
	): Omit<this, 'where' | `${JoinType}Join`> {
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

	groupBy(
		builder: (aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>,
	): Omit<this, 'where' | `${JoinType}Join` | 'groupBy'>;
	groupBy(...columns: (AnyPgColumn | SQL)[]): Omit<this, 'where' | `${JoinType}Join` | 'groupBy'>;
	groupBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>]
			| (AnyPgColumn | SQL)[]
	): this {
		if (typeof columns[0] === 'function') {
			const groupBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
		} else {
			this.config.groupBy = columns as (AnyPgColumn | SQL)[];
		}
		return this;
	}

	orderBy(
		builder: (aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>,
	): Omit<this, 'where' | `${JoinType}Join` | 'orderBy'>;
	orderBy(...columns: (AnyPgColumn | SQL)[]): Omit<this, 'where' | `${JoinType}Join` | 'orderBy'>;
	orderBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>]
			| (AnyPgColumn | SQL)[]
	): this {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
		} else {
			this.config.orderBy = columns as (AnyPgColumn | SQL)[];
		}
		return this;
	}

	limit(limit: number): Omit<this, 'where' | `${JoinType}Join` | 'limit'> {
		this.config.limit = limit;
		return this;
	}

	offset(offset: number): Omit<this, 'where' | `${JoinType}Join` | 'offset'> {
		this.config.offset = offset;
		return this;
	}

	for(strength: LockStrength, config: LockConfig = {}): this {
		this.config.lockingClauses.push({ strength, config });
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

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: SelectResult<TSelection, TSelectMode, TNullability>[];
		}
	> {
		const query = this.session.prepareQuery<
			PreparedQueryConfig & { execute: SelectResult<TSelection, TSelectMode, TNullability>[] }
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.fieldsList, name);
		query.joinsNotNullableMap = this.joinsNotNullable;
		return query;
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: SelectResult<TSelection, TSelectMode, TNullability>[];
		}
	> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};

	as<TAlias extends string>(
		alias: TAlias,
	): SubqueryWithSelection<Simplify<BuildSubquerySelection<TSelection, TAlias, TNullability>>, TAlias> {
		return new Proxy(
			new Subquery(this.getSQL(), this.config.fields, alias),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'throw' }),
		) as SubqueryWithSelection<Simplify<BuildSubquerySelection<TSelection, TAlias, TNullability>>, TAlias>;
	}

	prepareWithSubquery<TAlias extends string>(
		alias: TAlias,
	): WithSubqueryWithSelection<Simplify<BuildSubquerySelection<TSelection, TAlias, TNullability>>, TAlias> {
		return new Proxy(
			new WithSubquery(this.getSQL(), this.config.fields, alias, true),
			new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'throw' }),
		) as WithSubqueryWithSelection<Simplify<BuildSubquerySelection<TSelection, TAlias, TNullability>>, TAlias>;
	}
}
