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
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL } from '~/sql/sql.ts';
import { Table } from '~/table.ts';
import { extractUsedTable } from '../utils.ts';

export interface ClickHouseInsertConfig<TTable extends ClickHouseTable = ClickHouseTable> {
	table: TTable;
	/** Literal rows. Mutually exclusive with {@link select}. */
	values?: Record<string, Param | SQL>[];
	/** An `INSERT INTO … SELECT` source. Mutually exclusive with {@link values}. */
	select?: SQL;
	settings?: ClickHouseSettings;
}

export type AnyClickHouseInsertConfig = ClickHouseInsertConfig<ClickHouseTable>;

export type ClickHouseInsertValue<TTable extends ClickHouseTable> =
	& {
		[Key in keyof TTable['$inferInsert']]: TTable['$inferInsert'][Key] | SQL | Placeholder;
	}
	& {};

export class ClickHouseInsertBuilder<
	TTable extends ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'ClickHouseInsertBuilder';

	constructor(
		private table: TTable,
		private session: ClickHouseSession,
		private dialect: ClickHouseDialect,
	) {}

	values(value: ClickHouseInsertValue<TTable>): ClickHouseInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	values(values: ClickHouseInsertValue<TTable>[]): ClickHouseInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	values(
		values: ClickHouseInsertValue<TTable> | ClickHouseInsertValue<TTable>[],
	): ClickHouseInsertBase<TTable, TQueryResult, TPreparedQueryHKT> {
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

		return new ClickHouseInsertBase(this.table, { values: mappedValues }, this.session, this.dialect);
	}

	/**
	 * Populates the table from a query rather than from literal rows, emitting
	 * `INSERT INTO … SELECT …`.
	 *
	 * ClickHouse matches the selected columns to the table's columns *by position*, not by name, so
	 * the projection has to line up with the table's column order.
	 *
	 * @example
	 * ```ts
	 * await db.insert(dailyStats).select(
	 * 	db.select({ day: sql`toDate(${events.ts})`, hits: count() }).from(events).groupBy(sql`1`),
	 * );
	 * ```
	 */
	select(
		query: SQL | TypedQueryBuilder<any, any>,
	): ClickHouseInsertBase<TTable, TQueryResult, TPreparedQueryHKT> {
		const selectSQL = is(query, SQL) ? query : query.getSQL();
		return new ClickHouseInsertBase(this.table, { select: selectSQL }, this.session, this.dialect);
	}
}

export type ClickHouseInsertWithout<
	T extends AnyClickHouseInsert,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		ClickHouseInsertBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type ClickHouseInsertDynamic<T extends AnyClickHouseInsert> = ClickHouseInsert<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

export type ClickHouseInsertPrepare<T extends AnyClickHouseInsert> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	ClickHousePreparedQueryConfig & {
		execute: ClickHouseQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

export type ClickHouseInsert<
	TTable extends ClickHouseTable = ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT = AnyClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = ClickHouseInsertBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export type AnyClickHouseInsert = ClickHouseInsertBase<any, any, any, any, any>;

export interface ClickHouseInsertBase<
	TTable extends ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	QueryPromise<ClickHouseQueryResultKind<TQueryResult, never>>,
	RunnableQuery<ClickHouseQueryResultKind<TQueryResult, never>, 'clickhouse'>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'clickhouse';
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: ClickHouseQueryResultKind<TQueryResult, never>;
	};
}

/**
 * An insert into a ClickHouse table.
 *
 * There is no `ON CONFLICT`/`ON DUPLICATE KEY` equivalent and no `RETURNING`: ClickHouse does not
 * enforce primary-key uniqueness at write time, and inserts do not report generated values back.
 * Deduplication is a property of the engine — see `ReplacingMergeTree` — not of the insert.
 */
export class ClickHouseInsertBase<
	TTable extends ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<ClickHouseQueryResultKind<TQueryResult, never>>
	implements RunnableQuery<ClickHouseQueryResultKind<TQueryResult, never>, 'clickhouse'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'ClickHouseInsert';

	declare protected $table: TTable;

	private config: ClickHouseInsertConfig<TTable>;

	constructor(
		table: TTable,
		source: Pick<ClickHouseInsertConfig<TTable>, 'values' | 'select'>,
		private session: ClickHouseSession,
		private dialect: ClickHouseDialect,
	) {
		super();
		this.config = { table, ...source };
	}

	/**
	 * Adds a query-level `SETTINGS` clause.
	 *
	 * @example
	 * ```ts
	 * await db.insert(events).values(rows).settings({ async_insert: 1, wait_for_async_insert: 0 });
	 * ```
	 */
	settings(settings: ClickHouseSettings): ClickHouseInsertWithout<this, TDynamic, 'settings'> {
		this.config.settings = { ...this.config.settings, ...settings };
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): ClickHouseInsertPrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			undefined,
			undefined,
			{
				type: 'insert',
				tables: extractUsedTable(this.config.table),
			},
		) as ClickHouseInsertPrepare<this>;
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

	$dynamic(): ClickHouseInsertDynamic<this> {
		return this as any;
	}
}
