import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type {
	AnyMySqlQueryResultHKT,
	MySqlPreparedQueryConfig,
	MySqlQueryResultHKT,
	MySqlQueryResultKind,
	MySqlSession,
	PreparedQueryHKTBase,
	PreparedQueryKind,
} from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import type { InferModelFromColumns } from '~/table.ts';
import { Columns, Table } from '~/table.ts';
import { haveSameKeys, mapUpdateSet } from '~/utils.ts';
import type { AnyMySqlColumn } from '../columns/common.ts';
import { extractUsedTable } from '../utils.ts';
import { QueryBuilder } from './query-builder.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';
import type { MySqlUpdateSetSource } from './update.ts';

export interface MySqlInsertConfig<TTable extends MySqlTable = MySqlTable> {
	table: TTable;
	values: Record<string, Param | SQL>[] | MySqlInsertSelectQueryBuilder<TTable> | SQL;
	ignore: boolean;
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
	select?: boolean;
}

export type AnyMySqlInsertConfig = MySqlInsertConfig<MySqlTable>;

export type MySqlInsertValue<TTable extends MySqlTable> =
	& {
		[Key in keyof TTable['$inferInsert']]: TTable['$inferInsert'][Key] | SQL | Placeholder;
	}
	& {};

export type MySqlInsertSelectQueryBuilder<TTable extends MySqlTable> = TypedQueryBuilder<
	{ [K in keyof TTable['$inferInsert']]: AnyMySqlColumn | SQL | SQL.Aliased | TTable['$inferInsert'][K] }
>;

export class MySqlInsertBuilder<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'MySqlInsertBuilder';

	private shouldIgnore = false;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {}

	ignore(): this {
		this.shouldIgnore = true;
		return this;
	}

	values(value: MySqlInsertValue<TTable>): MySqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	values(values: MySqlInsertValue<TTable>[]): MySqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	values(
		values: MySqlInsertValue<TTable> | MySqlInsertValue<TTable>[],
	): MySqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT> {
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

		return new MySqlInsertBase(this.table, mappedValues, this.shouldIgnore, this.session, this.dialect);
	}

	select(
		selectQuery: (qb: QueryBuilder) => MySqlInsertSelectQueryBuilder<TTable>,
	): MySqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	select(selectQuery: (qb: QueryBuilder) => SQL): MySqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	select(selectQuery: SQL): MySqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	select(selectQuery: MySqlInsertSelectQueryBuilder<TTable>): MySqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	select(
		selectQuery:
			| SQL
			| MySqlInsertSelectQueryBuilder<TTable>
			| ((qb: QueryBuilder) => MySqlInsertSelectQueryBuilder<TTable> | SQL),
	): MySqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT> {
		const select = typeof selectQuery === 'function' ? selectQuery(new QueryBuilder()) : selectQuery;

		if (
			!is(select, SQL)
			&& !haveSameKeys(this.table[Columns], select._.selectedFields)
		) {
			throw new Error(
				'Insert select error: selected fields are not the same or are in a different order compared to the table definition',
			);
		}

		return new MySqlInsertBase(this.table, select, this.shouldIgnore, this.session, this.dialect, true);
	}
}

export type MySqlInsertWithout<T extends AnyMySqlInsert, TDynamic extends boolean, K extends keyof T & string> =
	TDynamic extends true ? T
		: Omit<
			MySqlInsertBase<
				T['_']['table'],
				T['_']['queryResult'],
				T['_']['preparedQueryHKT'],
				T['_']['returning'],
				TDynamic,
				T['_']['excludedMethods'] | '$returning'
			>,
			T['_']['excludedMethods'] | K
		>;

export type MySqlInsertDynamic<T extends AnyMySqlInsert> = MySqlInsert<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT'],
	T['_']['returning']
>;

export type MySqlInsertPrepare<
	T extends AnyMySqlInsert,
	TReturning extends Record<string, unknown> | undefined = undefined,
> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	MySqlPreparedQueryConfig & {
		execute: TReturning extends undefined ? MySqlQueryResultKind<T['_']['queryResult'], never> : TReturning[];
		iterator: never;
	},
	true
>;

export type MySqlInsertOnDuplicateKeyUpdateConfig<T extends AnyMySqlInsert> = {
	set: MySqlUpdateSetSource<T['_']['table']>;
};

export type MySqlInsert<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = AnyMySqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = MySqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TReturning, true, never>;

export type MySqlInsertReturning<
	T extends AnyMySqlInsert,
	TDynamic extends boolean,
> = MySqlInsertBase<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT'],
	InferModelFromColumns<GetPrimarySerialOrDefaultKeys<T['_']['table']['_']['columns']>>,
	TDynamic,
	T['_']['excludedMethods'] | '$returning'
>;

export type AnyMySqlInsert = MySqlInsertBase<any, any, any, any, any, any>;

export interface MySqlInsertBase<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	QueryPromise<TReturning extends undefined ? MySqlQueryResultKind<TQueryResult, never> : TReturning[]>,
	RunnableQuery<TReturning extends undefined ? MySqlQueryResultKind<TQueryResult, never> : TReturning[], 'mysql'>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'mysql';
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly returning: TReturning;
		readonly result: TReturning extends undefined ? MySqlQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export type PrimaryKeyKeys<T extends Record<string, AnyMySqlColumn>> = {
	[K in keyof T]: T[K]['_']['isPrimaryKey'] extends true ? T[K]['_']['isAutoincrement'] extends true ? K
		: T[K]['_']['hasRuntimeDefault'] extends true ? T[K]['_']['isPrimaryKey'] extends true ? K : never
		: never
		: T[K]['_']['hasRuntimeDefault'] extends true ? T[K]['_']['isPrimaryKey'] extends true ? K : never
		: never;
}[keyof T];

export type GetPrimarySerialOrDefaultKeys<T extends Record<string, AnyMySqlColumn>> = {
	[K in PrimaryKeyKeys<T>]: T[K];
};

export class MySqlInsertBase<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? MySqlQueryResultKind<TQueryResult, never> : TReturning[]>
	implements
		RunnableQuery<TReturning extends undefined ? MySqlQueryResultKind<TQueryResult, never> : TReturning[], 'mysql'>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'MySqlInsert';

	declare protected $table: TTable;

	private config: MySqlInsertConfig<TTable>;
	protected cacheConfig?: WithCacheConfig;

	constructor(
		table: TTable,
		values: MySqlInsertConfig['values'],
		ignore: boolean,
		private session: MySqlSession,
		private dialect: MySqlDialect,
		select?: boolean,
	) {
		super();
		this.config = { table, values: values as any, select, ignore };
	}

	/**
	 * Adds an `on duplicate key update` clause to the query.
	 *
	 * Calling this method will update the row if any unique index conflicts. MySQL will automatically determine the conflict target based on the primary key and unique indexes.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/insert#on-duplicate-key-update}
	 *
	 * @param config The `set` clause
	 *
	 * @example
	 * ```ts
	 * await db.insert(cars)
	 *   .values({ id: 1, brand: 'BMW'})
	 *   .onDuplicateKeyUpdate({ set: { brand: 'Porsche' }});
	 * ```
	 *
	 * While MySQL does not directly support doing nothing on conflict, you can perform a no-op by setting any column's value to itself and achieve the same effect:
	 *
	 * ```ts
	 * import { sql } from 'drizzle-orm';
	 *
	 * await db.insert(cars)
	 *   .values({ id: 1, brand: 'BMW' })
	 *   .onDuplicateKeyUpdate({ set: { id: sql`id` } });
	 * ```
	 */
	onDuplicateKeyUpdate(
		config: MySqlInsertOnDuplicateKeyUpdateConfig<this>,
	): MySqlInsertWithout<this, TDynamic, 'onDuplicateKeyUpdate'> {
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict = sql`update ${setSql}`;
		return this as any;
	}

	$returningId(): MySqlInsertWithout<
		MySqlInsertReturning<this, TDynamic>,
		TDynamic,
		'$returningId'
	> {
		const returning: SelectedFieldsOrdered = [];
		for (const [key, value] of Object.entries(this.config.table[Table.Symbol.Columns])) {
			if (value.primary) {
				returning.push({ field: value, path: [key] });
			}
		}
		this.config.returning = returning;
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config).sql;
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): MySqlInsertPrepare<this, TReturning> {
		const { sql, generatedIds } = this.dialect.buildInsertQuery(this.config);
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(sql),
			undefined,
			undefined,
			generatedIds,
			this.config.returning,
			{
				type: 'insert',
				tables: extractUsedTable(this.config.table),
			},
			this.cacheConfig,
		) as MySqlInsertPrepare<this, TReturning>;
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

	$dynamic(): MySqlInsertDynamic<this> {
		return this as any;
	}
}
