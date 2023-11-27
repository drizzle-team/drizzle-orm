import { entityKind, is } from '~/entity.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type {
	AnyQueryResultHKT,
	MySqlSession,
	PreparedQueryConfig,
	PreparedQueryHKTBase,
	PreparedQueryKind,
	QueryResultHKT,
	QueryResultKind,
} from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import { Table } from '~/table.ts';
import { mapUpdateSet } from '~/utils.ts';
import type { MySqlUpdateSetSource } from './update.ts';

export interface MySqlInsertConfig<TTable extends MySqlTable = MySqlTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	ignore: boolean;
	onConflict?: SQL;
}

export type AnyMySqlInsertConfig = MySqlInsertConfig<MySqlTable>;

export type MySqlInsertValue<TTable extends MySqlTable> =
	& {
		[Key in keyof TTable['$inferInsert']]: TTable['$inferInsert'][Key] | SQL | Placeholder;
	}
	& {};

export class MySqlInsertBuilder<
	TTable extends MySqlTable,
	TQueryResult extends QueryResultHKT,
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
}

export type MySqlInsertWithout<T extends AnyMySqlInsert, TDynamic extends boolean, K extends keyof T & string> =
	TDynamic extends true ? T
		: Omit<
			MySqlInsertBase<
				T['_']['table'],
				T['_']['queryResult'],
				T['_']['preparedQueryHKT'],
				TDynamic,
				T['_']['excludedMethods'] | K
			>,
			T['_']['excludedMethods'] | K
		>;

export type MySqlInsertDynamic<T extends AnyMySqlInsert> = MySqlInsert<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

export type MySqlInsertPrepare<T extends AnyMySqlInsert> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	PreparedQueryConfig & {
		execute: QueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

export type MySqlInsertOnDuplicateKeyUpdateConfig<T extends AnyMySqlInsert> = {
	set: MySqlUpdateSetSource<T['_']['table']>;
};

export type MySqlInsert<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends QueryResultHKT = AnyQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = MySqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export type AnyMySqlInsert = MySqlInsertBase<any, any, any, any, any>;

export interface MySqlInsertBase<
	TTable extends MySqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<QueryResultKind<TQueryResult, never>>, SQLWrapper {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class MySqlInsertBase<
	TTable extends MySqlTable,
	TQueryResult extends QueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<QueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static readonly [entityKind]: string = 'MySqlInsert';

	declare protected $table: TTable;

	private config: MySqlInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: MySqlInsertConfig['values'],
		ignore: boolean,
		private session: MySqlSession,
		private dialect: MySqlDialect,
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
		config: MySqlInsertOnDuplicateKeyUpdateConfig<this>,
	): MySqlInsertWithout<this, TDynamic, 'onDuplicateKeyUpdate'> {
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict = sql`update ${setSql}`;
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

	prepare(): MySqlInsertPrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			undefined,
		) as MySqlInsertPrepare<this>;
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
