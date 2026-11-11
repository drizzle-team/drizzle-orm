import type { ClickHouseDialect } from '~/clickhouse-core/dialect.ts';
import type { ClickHouseSettings } from '~/clickhouse-core/engines.ts';
import type {
	AnyClickHouseQueryResultHKT,
	ClickHousePreparedQueryConfig,
	ClickHouseQueryResultHKT,
	ClickHouseQueryResultKind,
	ClickHouseSession,
	PreparedQueryHKTBase,
	PreparedQueryKind,
} from '~/clickhouse-core/session.ts';
import type { ClickHouseTable } from '~/clickhouse-core/table.ts';
import type { GetColumnData } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { mapUpdateSet, type UpdateSet } from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';

export interface ClickHouseUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: ClickHouseTable;
	settings?: ClickHouseSettings;
}

export type ClickHouseUpdateSetSource<TTable extends ClickHouseTable> =
	& {
		[Key in keyof TTable['$inferInsert']]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL
			| undefined;
	}
	& {};

export class ClickHouseUpdateBuilder<
	TTable extends ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'ClickHouseUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: ClickHouseSession,
		private dialect: ClickHouseDialect,
	) {}

	set(values: ClickHouseUpdateSetSource<TTable>): ClickHouseUpdateBase<TTable, TQueryResult, TPreparedQueryHKT> {
		return new ClickHouseUpdateBase(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
		);
	}
}

export type ClickHouseUpdateWithout<
	T extends AnyClickHouseUpdateBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	ClickHouseUpdateBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['preparedQueryHKT'],
		TDynamic,
		T['_']['excludedMethods'] | K
	>,
	T['_']['excludedMethods'] | K
>;

export type ClickHouseUpdatePrepare<T extends AnyClickHouseUpdateBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	ClickHousePreparedQueryConfig & {
		execute: ClickHouseQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

export type ClickHouseUpdateDynamic<T extends AnyClickHouseUpdateBase> = ClickHouseUpdate<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

export type ClickHouseUpdate<
	TTable extends ClickHouseTable = ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT = AnyClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = ClickHouseUpdateBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export type AnyClickHouseUpdateBase = ClickHouseUpdateBase<any, any, any, any, any>;

export interface ClickHouseUpdateBase<
	TTable extends ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<ClickHouseQueryResultKind<TQueryResult, never>>, SQLWrapper {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class ClickHouseUpdateBase<
	TTable extends ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<ClickHouseQueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static override readonly [entityKind]: string = 'ClickHouseUpdate';

	private config: ClickHouseUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: ClickHouseSession,
		private dialect: ClickHouseDialect,
	) {
		super();
		this.config = { set, table };
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
	where(where: SQL | undefined): ClickHouseUpdateWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	/** Adds a query-level `SETTINGS` clause, e.g. `{ mutations_sync: 2 }` to wait for the mutation. */
	settings(settings: ClickHouseSettings): ClickHouseUpdateWithout<this, TDynamic, 'settings'> {
		this.config.settings = { ...this.config.settings, ...settings };
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): ClickHouseUpdatePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			undefined,
			undefined,
			{
				type: 'update',
				tables: extractUsedTable(this.config.table),
			},
		) as ClickHouseUpdatePrepare<this>;
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	};

	private createIterator = (): ReturnType<this['prepare']>['iterator'] => {
		const self = this;
		return async function*(placeholderValues) {
			yield* self.prepare().iterator(placeholderValues);
		};
	};

	iterator = this.createIterator();

	$dynamic(): ClickHouseUpdateDynamic<this> {
		return this as any;
	}
}
