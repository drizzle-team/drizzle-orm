import { entityKind, is } from '~/entity.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { AnyMySqlQueryResultHKT, MySqlQueryResultHKT, MySqlQueryResultKind } from '~/mysql-core/session.ts';
import type { MySqlSession } from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { CommentInput, Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import type { InferInsertModel, InferModelFromColumns } from '~/table.ts';
import { Table } from '~/table.ts';
import { type Assume, type DrizzleTypeError, mapUpdateSet } from '~/utils.ts';
import type { AnyMySqlColumn } from '../columns/common.ts';
import { QueryBuilder } from './query-builder.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';
import type { MySqlUpdateSetSource } from './update.ts';

export interface MySqlInsertConfig<TTable extends MySqlTable = MySqlTable> {
	table: TTable;
	values: Record<string, Param | SQL>[] | TypedQueryBuilder<MySqlInsertSelection<TTable>> | SQL;
	ignore: boolean;
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
	select?: boolean;
	comment?: SQL;
}

export type AnyMySqlInsertConfig = MySqlInsertConfig<MySqlTable>;

export type MySqlInsertValue<
	TTable extends MySqlTable,
	TModel extends Record<string, any> = InferInsertModel<TTable>,
> =
	& {
		[Key in keyof TModel]: TModel[Key] | SQL | Placeholder;
	}
	& {};

export type MySqlInsertSelection<
	TTable extends MySqlTable,
	TModel extends Record<string, unknown> = InferInsertModel<TTable>,
> =
	& {
		[K in keyof TModel]:
			| AnyMySqlColumn
			| SQL
			| SQL.Aliased
			| TModel[K];
	}
	& {};

export type NoUnknownKeysInInsertSelection<
	TTable extends MySqlTable,
	TSelection extends MySqlInsertSelection<any>,
> = {
	[K in keyof TSelection]: K extends keyof InferInsertModel<TTable> ? TSelection[K]
		: K extends keyof InferInsertModel<TTable, { override: true }> ? DrizzleTypeError<
				`Column "${
					& K
					& string}" in table "${TTable['_'][
					'name'
				]}" is a generated column - manual value insertion restricted`
			>
		: DrizzleTypeError<`Column "${K & string}" does not exist in table "${TTable['_']['name']}"`>;
};

export interface MySqlInsertBuilderConstructor {
	new(
		table: MySqlTable,
		values: MySqlInsertConfig['values'],
		ignore: boolean,
		session: MySqlSession,
		dialect: MySqlDialect,
		select?: boolean,
	): AnyMySqlInsert;
}

export class MySqlInsertBuilder<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TBuilderHKT extends MySqlInsertHKTBase = MySqlInsertHKT,
> {
	static readonly [entityKind]: string = 'MySqlInsertBuilder';

	private shouldIgnore = false;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
		private builder: MySqlInsertBuilderConstructor = MySqlInsertBase as unknown as MySqlInsertBuilderConstructor,
	) {}

	ignore(): this {
		this.shouldIgnore = true;
		return this;
	}

	values(value: MySqlInsertValue<TTable>): MySqlInsertKind<TBuilderHKT, TTable, TQueryResult>;
	values(values: MySqlInsertValue<TTable>[]): MySqlInsertKind<TBuilderHKT, TTable, TQueryResult>;
	values(
		values: MySqlInsertValue<TTable> | MySqlInsertValue<TTable>[],
	): MySqlInsertKind<TBuilderHKT, TTable, TQueryResult> {
		values = Array.isArray(values) ? values : [values];
		if (values.length === 0) {
			throw new Error('values() must be called with at least one value');
		}
		const mappedValues = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue as any, cols[colKey]);
			}
			return result;
		});

		return new this.builder(this.table, mappedValues, this.shouldIgnore, this.session, this.dialect) as any;
	}

	select<TSelection extends MySqlInsertSelection<TTable>>(
		selectQuery: (qb: QueryBuilder) => TypedQueryBuilder<NoUnknownKeysInInsertSelection<TTable, TSelection>>,
	): MySqlInsertKind<TBuilderHKT, TTable, TQueryResult>;
	select(selectQuery: (qb: QueryBuilder) => SQL): MySqlInsertKind<TBuilderHKT, TTable, TQueryResult>;
	select(selectQuery: SQL): MySqlInsertKind<TBuilderHKT, TTable, TQueryResult>;
	select<TSelection extends MySqlInsertSelection<TTable>>(
		selectQuery: TypedQueryBuilder<NoUnknownKeysInInsertSelection<TTable, TSelection>>,
	): MySqlInsertKind<TBuilderHKT, TTable, TQueryResult>;
	select(
		selectQuery:
			| SQL
			| TypedQueryBuilder<NoUnknownKeysInInsertSelection<TTable, MySqlInsertSelection<TTable>>>
			| ((qb: QueryBuilder) =>
				| TypedQueryBuilder<NoUnknownKeysInInsertSelection<TTable, MySqlInsertSelection<TTable>>>
				| SQL),
	): MySqlInsertKind<TBuilderHKT, TTable, TQueryResult> {
		const select = typeof selectQuery === 'function' ? selectQuery(new QueryBuilder()) : selectQuery;
		if ('withoutSelectionCastCodecs' in select) select.withoutSelectionCastCodecs();

		if (!is(select, SQL)) {
			const insertCols = Object.keys(this.table[Table.Symbol.Columns]);
			const selected = Object.keys(select._.selectedFields);

			for (const col of selected) {
				if (!insertCols.includes(col)) {
					throw new Error(
						`Insert select error: column "${col}" does not exist in table "${this.table[Table.Symbol.Name]}"`,
					);
				}
			}
		}

		return new this.builder(this.table, select, this.shouldIgnore, this.session, this.dialect, true) as any;
	}
}

export type MySqlInsertWithout<T extends AnyMySqlInsert, TDynamic extends boolean, K extends keyof T & string> =
	TDynamic extends true ? T
		: Omit<
			MySqlInsertKind<
				T['_']['hkt'],
				T['_']['table'],
				T['_']['queryResult'],
				T['_']['returning'],
				TDynamic,
				T['_']['excludedMethods'] | K
			>,
			T['_']['excludedMethods'] | K
		>;

export type MySqlInsertDynamic<T extends AnyMySqlInsert> = MySqlInsertKind<
	T['_']['hkt'],
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['returning'],
	true,
	never
>;

export type MySqlInsertOnDuplicateKeyUpdateConfig<T extends AnyMySqlInsert> = {
	set: MySqlUpdateSetSource<T['_']['table']>;
};

export type MySqlInsert<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = AnyMySqlQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = MySqlInsertBase<MySqlInsertHKT, TTable, TQueryResult, TReturning, true, never>;

export type MySqlInsertReturning<T extends AnyMySqlInsert> = T extends any ? MySqlInsertWithout<
		MySqlInsertKind<
			T['_']['hkt'],
			T['_']['table'],
			T['_']['queryResult'],
			InferModelFromColumns<GetPrimarySerialOrDefaultKeys<T['_']['table']['_']['columns']>>,
			T['_']['dynamic'],
			T['_']['excludedMethods']
		>,
		T['_']['dynamic'],
		'$returningId'
	>
	: never;

export type AnyMySqlInsert = MySqlInsertBase<any, any, any, any, any, any>;

export interface MySqlInsertHKTBase {
	table: unknown;
	queryResult: unknown;
	returning: unknown;
	dynamic: boolean;
	excludedMethods: string;
	_type: unknown;
}

export interface MySqlInsertHKT extends MySqlInsertHKTBase {
	_type: MySqlInsertBase<
		MySqlInsertHKT,
		Assume<this['table'], MySqlTable>,
		Assume<this['queryResult'], MySqlQueryResultHKT>,
		Assume<this['returning'], Record<string, unknown> | undefined>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type MySqlInsertKind<
	T extends MySqlInsertHKTBase,
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> = (T & {
	table: TTable;
	queryResult: TQueryResult;
	returning: TReturning;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
})['_type'];

export interface MySqlInsertBase<
	THKT extends MySqlInsertHKTBase,
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends SQLWrapper {
	readonly _: {
		readonly dialect: 'mysql';
		readonly hkt: THKT;
		readonly table: TTable;
		readonly queryResult: TQueryResult;
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
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends MySqlInsertHKTBase,
	TTable extends MySqlTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TQueryResult extends MySqlQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'MySqlInsert';

	declare protected $table: TTable;

	protected config: MySqlInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: MySqlInsertConfig['values'],
		ignore: boolean,
		protected session: MySqlSession,
		protected dialect: MySqlDialect,
		select?: boolean,
	) {
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

	$returningId(): MySqlInsertReturning<this> {
		const returning: SelectedFieldsOrdered = [];
		for (const [key, value] of Object.entries(this.config.table[Table.Symbol.Columns])) {
			if (value.primary) {
				returning.push({ field: value, path: [key] });
			}
		}
		this.config.returning = returning;
		return this as any;
	}

	/**
	 * Attach [sqlcommenter](https://google.github.io/sqlcommenter) comment to a query
	 */
	comment(comment: CommentInput): MySqlInsertWithout<this, TDynamic, 'comment'> {
		this.config.comment = sql.comment(comment);
		return this as any;
	}

	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config).sql;
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	$dynamic(): MySqlInsertDynamic<this> {
		return this as any;
	}
}
