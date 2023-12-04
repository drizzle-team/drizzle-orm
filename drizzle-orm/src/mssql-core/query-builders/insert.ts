import { entityKind, is } from '~/entity.ts';
import type { MsSqlDialect } from '~/mssql-core/dialect.ts';
import type {
	AnyQueryResultHKT,
	MsSqlSession,
	PreparedQueryConfig,
	PreparedQueryHKTBase,
	PreparedQueryKind,
	QueryResultHKT,
	QueryResultKind,
} from '~/mssql-core/session.ts';
import type { MsSqlTable } from '~/mssql-core/table.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import { Table } from '~/table.ts';
import { mapUpdateSet } from '~/utils.ts';
import type { MsSqlUpdateSetSource } from './update.ts';

export interface MsSqlInsertConfig<TTable extends MsSqlTable = MsSqlTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	ignore: boolean;
	onConflict?: SQL;
}

export type AnyMsSqlInsertConfig = MsSqlInsertConfig<MsSqlTable>;

export type MsSqlInsertValue<TTable extends MsSqlTable> =
	& {
		[Key in keyof TTable['$inferInsert']]: TTable['$inferInsert'][Key] | SQL | Placeholder;
	}
	& {};

export class MsSqlInsertBuilder<
	TTable extends MsSqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'MsSqlInsertBuilder';

	private shouldIgnore = false;

	constructor(
		private table: TTable,
		private session: MsSqlSession,
		private dialect: MsSqlDialect,
	) {}

	ignore(): this {
		this.shouldIgnore = true;
		return this;
	}

	values(value: MsSqlInsertValue<TTable>): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	values(values: MsSqlInsertValue<TTable>[]): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	values(
		values: MsSqlInsertValue<TTable> | MsSqlInsertValue<TTable>[],
	): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT> {
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

		return new MsSqlInsertBase(this.table, mappedValues, this.shouldIgnore, this.session, this.dialect);
	}
}

export type MsSqlInsertWithout<T extends AnyMsSqlInsert, TDynamic extends boolean, K extends keyof T & string> =
	TDynamic extends true ? T
		: Omit<
			MsSqlInsertBase<
				T['_']['table'],
				T['_']['queryResult'],
				T['_']['preparedQueryHKT'],
				TDynamic,
				T['_']['excludedMethods'] | K
			>,
			T['_']['excludedMethods'] | K
		>;

export type MsSqlInsertDynamic<T extends AnyMsSqlInsert> = MsSqlInsert<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

export type MsSqlInsertPrepare<T extends AnyMsSqlInsert> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	PreparedQueryConfig & {
		execute: QueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

export type MsSqlInsertOnDuplicateKeyUpdateConfig<T extends AnyMsSqlInsert> = {
	set: MsSqlUpdateSetSource<T['_']['table']>;
};

export type MsSqlInsert<
	TTable extends MsSqlTable = MsSqlTable,
	TQueryResult extends QueryResultHKT = AnyQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export type AnyMsSqlInsert = MsSqlInsertBase<any, any, any, any, any>;

export interface MsSqlInsertBase<
	TTable extends MsSqlTable,
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

export class MsSqlInsertBase<
	TTable extends MsSqlTable,
	TQueryResult extends QueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<QueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static readonly [entityKind]: string = 'MsSqlInsert';

	declare protected $table: TTable;

	private config: MsSqlInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: MsSqlInsertConfig['values'],
		ignore: boolean,
		private session: MsSqlSession,
		private dialect: MsSqlDialect,
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
		config: MsSqlInsertOnDuplicateKeyUpdateConfig<this>,
	): MsSqlInsertWithout<this, TDynamic, 'onDuplicateKeyUpdate'> {
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

	prepare(): MsSqlInsertPrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			undefined,
		) as MsSqlInsertPrepare<this>;
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

	$dynamic(): MsSqlInsertDynamic<this> {
		return this as any;
	}
}
