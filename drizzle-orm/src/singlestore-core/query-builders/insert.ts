import { entityKind, is } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import type {
	AnySingleStoreQueryResultHKT,
	PreparedQueryHKTBase,
	PreparedQueryKind,
	SingleStorePreparedQueryConfig,
	SingleStoreQueryResultHKT,
	SingleStoreQueryResultKind,
	SingleStoreSession,
} from '~/singlestore-core/session.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import type { InferModelFromColumns } from '~/table.ts';
import { Table } from '~/table.ts';
import { mapUpdateSet, orderSelectedFields } from '~/utils.ts';
import type { AnySingleStoreColumn, SingleStoreColumn } from '../columns/common.ts';
import { extractUsedTable } from '../utils.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';
import type { SingleStoreUpdateSetSource } from './update.ts';

export interface SingleStoreInsertConfig<TTable extends SingleStoreTable = SingleStoreTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	ignore: boolean;
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
}

export type AnySingleStoreInsertConfig = SingleStoreInsertConfig<SingleStoreTable>;

export type SingleStoreInsertValue<TTable extends SingleStoreTable> =
	& {
		[Key in keyof TTable['$inferInsert']]: TTable['$inferInsert'][Key] | SQL | Placeholder;
	}
	& {};

export class SingleStoreInsertBuilder<
	TTable extends SingleStoreTable,
	TQueryResult extends SingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'SingleStoreInsertBuilder';

	private shouldIgnore = false;

	constructor(
		private table: TTable,
		private session: SingleStoreSession,
		private dialect: SingleStoreDialect,
	) {}

	ignore(): this {
		this.shouldIgnore = true;
		return this;
	}

	values(value: SingleStoreInsertValue<TTable>): SingleStoreInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	values(values: SingleStoreInsertValue<TTable>[]): SingleStoreInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	values(
		values: SingleStoreInsertValue<TTable> | SingleStoreInsertValue<TTable>[],
	): SingleStoreInsertBase<TTable, TQueryResult, TPreparedQueryHKT> {
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

		return new SingleStoreInsertBase(this.table, mappedValues, this.shouldIgnore, this.session, this.dialect);
	}
}

export type SingleStoreInsertWithout<
	T extends AnySingleStoreInsert,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		SingleStoreInsertBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | '$returning'
		>,
		T['_']['excludedMethods'] | K
	>;

export type SingleStoreInsertDynamic<T extends AnySingleStoreInsert> = SingleStoreInsert<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT'],
	T['_']['returning']
>;

export type SingleStoreInsertPrepare<
	T extends AnySingleStoreInsert,
	TReturning extends Record<string, unknown> | undefined = undefined,
> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	SingleStorePreparedQueryConfig & {
		execute: TReturning extends undefined ? SingleStoreQueryResultKind<T['_']['queryResult'], never> : TReturning[];
		iterator: never;
	},
	true
>;

export type SingleStoreInsertOnDuplicateKeyUpdateConfig<T extends AnySingleStoreInsert> = {
	set: SingleStoreUpdateSetSource<T['_']['table']>;
};

export type SingleStoreInsert<
	TTable extends SingleStoreTable = SingleStoreTable,
	TQueryResult extends SingleStoreQueryResultHKT = AnySingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = SingleStoreInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TReturning, true, never>;

export type SingleStoreInsertReturning<
	T extends AnySingleStoreInsert,
	TDynamic extends boolean,
> = SingleStoreInsertBase<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT'],
	InferModelFromColumns<GetPrimarySerialOrDefaultKeys<T['_']['table']['_']['columns']>>,
	TDynamic,
	T['_']['excludedMethods'] | '$returning'
>;

export type AnySingleStoreInsert = SingleStoreInsertBase<any, any, any, any, any, any>;

export interface SingleStoreInsertBase<
	TTable extends SingleStoreTable,
	TQueryResult extends SingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	QueryPromise<TReturning extends undefined ? SingleStoreQueryResultKind<TQueryResult, never> : TReturning[]>,
	RunnableQuery<
		TReturning extends undefined ? SingleStoreQueryResultKind<TQueryResult, never> : TReturning[],
		'singlestore'
	>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'singlestore';
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly returning: TReturning;
		readonly result: TReturning extends undefined ? SingleStoreQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export type PrimaryKeyKeys<T extends Record<string, AnySingleStoreColumn>> = {
	[K in keyof T]: T[K]['_']['isPrimaryKey'] extends true ? T[K]['_']['isAutoincrement'] extends true ? K
		: T[K]['_']['hasRuntimeDefault'] extends true ? T[K]['_']['isPrimaryKey'] extends true ? K : never
		: never
		: T[K]['_']['hasRuntimeDefault'] extends true ? T[K]['_']['isPrimaryKey'] extends true ? K : never
		: never;
}[keyof T];

export type GetPrimarySerialOrDefaultKeys<T extends Record<string, AnySingleStoreColumn>> = {
	[K in PrimaryKeyKeys<T>]: T[K];
};

export class SingleStoreInsertBase<
	TTable extends SingleStoreTable,
	TQueryResult extends SingleStoreQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? SingleStoreQueryResultKind<TQueryResult, never> : TReturning[]>
	implements
		RunnableQuery<
			TReturning extends undefined ? SingleStoreQueryResultKind<TQueryResult, never> : TReturning[],
			'singlestore'
		>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'SingleStoreInsert';

	declare protected $table: TTable;

	private config: SingleStoreInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: SingleStoreInsertConfig['values'],
		ignore: boolean,
		private session: SingleStoreSession,
		private dialect: SingleStoreDialect,
	) {
		super();
		this.config = { table, values, ignore };
	}

	/**
	 * Adds an `on duplicate key update` clause to the query.
	 *
	 * Calling this method will update update the row if any unique index conflicts. MySQL will automatically determine the conflict target based on the primary key and unique indexes.
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
		config: SingleStoreInsertOnDuplicateKeyUpdateConfig<this>,
	): SingleStoreInsertWithout<this, TDynamic, 'onDuplicateKeyUpdate'> {
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict = sql`update ${setSql}`;
		return this as any;
	}

	$returningId(): SingleStoreInsertWithout<
		SingleStoreInsertReturning<this, TDynamic>,
		TDynamic,
		'$returningId'
	> {
		const returning: SelectedFieldsOrdered = [];
		for (const [key, value] of Object.entries(this.config.table[Table.Symbol.Columns])) {
			if (value.primary) {
				returning.push({ field: value, path: [key] });
			}
		}
		this.config.returning = orderSelectedFields<SingleStoreColumn>(this.config.table[Table.Symbol.Columns]);
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

	prepare(): SingleStoreInsertPrepare<this, TReturning> {
		const { sql, generatedIds } = this.dialect.buildInsertQuery(this.config);
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(sql),
			undefined,
			undefined,
			generatedIds,
			this.config.returning,
			{
				type: 'delete',
				tables: extractUsedTable(this.config.table),
			},
		) as SingleStoreInsertPrepare<this, TReturning>;
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

	$dynamic(): SingleStoreInsertDynamic<this> {
		return this as any;
	}
}
