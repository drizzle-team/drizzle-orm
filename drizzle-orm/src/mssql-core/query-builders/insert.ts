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
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { SQL } from '~/sql/sql.ts';
import { type InferInsertModel, type InferSelectModel, Table } from '~/table.ts';
import { type DrizzleTypeError, orderSelectedFields } from '~/utils.ts';
import type { AnyMsSqlColumn, MsSqlColumn } from '../columns/common.ts';
import { QueryBuilder } from './query-builder.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';

export interface MsSqlInsertConfig<TTable extends MsSqlTable = MsSqlTable> {
	table: TTable;
	values: Record<string, unknown>[] | TypedQueryBuilder<MsSqlInsertSelection<TTable>> | SQL;
	output?: SelectedFieldsOrdered;
	select?: boolean;
	columnList?: string[];
}

export type MsSqlInsertValue<
	TTable extends MsSqlTable,
	TColumnsList extends string[] | 'all' = 'all',
	TModel extends Record<string, any> = InferInsertModel<TTable>,
> =
	& {
		[K in keyof TModel as TColumnsList extends 'all' ? K : Extract<K, TColumnsList[number]>]:
			| TModel[K]
			| SQL
			| Placeholder;
	}
	& {};

export type MsSqlInsertSelection<
	TTable extends MsSqlTable,
	TColumnsList extends string[] | 'all' = 'all',
	TModel extends Record<string, unknown> = InferInsertModel<TTable>,
> =
	& {
		[K in keyof TModel as TColumnsList extends 'all' ? K : Extract<K, TColumnsList[number]>]:
			| AnyMsSqlColumn
			| SQL
			| SQL.Aliased
			| TModel[K];
	}
	& {};

export type ValidateInsertSelectionKey<
	TTable extends MsSqlTable,
	TSelection extends MsSqlInsertSelection<any>,
	K extends keyof TSelection,
> = K extends keyof InferInsertModel<TTable> ? TSelection[K]
	: DrizzleTypeError<`Column "${K & string}" does not exist in table "${TTable['_']['name']}"`>;

export type NoUnknownKeysInInsertSelection<
	TTable extends MsSqlTable,
	TSelection extends MsSqlInsertSelection<any>,
	TColumnList extends string[] | 'all' = 'all',
> = {
	[K in keyof TSelection]: TColumnList extends string[]
		? K extends TColumnList[number] ? ValidateInsertSelectionKey<TTable, TSelection, K>
		: DrizzleTypeError<`Column "${K & string}" is not included in the insert column selection`>
		: ValidateInsertSelectionKey<TTable, TSelection, K>;
};

export type NoDuplicateColumns<
	T extends readonly unknown[],
	TSeen = never,
> = T extends readonly [infer Head, ...infer Tail] ? [
		Head extends TSeen ? DrizzleTypeError<`Duplicate columns are not allowed in insert selection: "${Head & string}"`>
			: Head,
		...NoDuplicateColumns<Tail, TSeen | Head>,
	]
	: T;

export class MsSqlInsertBuilder<
	TTable extends MsSqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TOutput extends Record<string, unknown> | undefined = undefined,
	TColumnList extends string[] | 'all' = 'all',
> {
	static readonly [entityKind]: string = 'MsSqlInsertBuilder';

	private config: {
		output?: SelectedFieldsOrdered;
		table: TTable;
		columnList?: string[];
	};

	protected table: TTable;
	protected session: MsSqlSession;
	protected dialect: MsSqlDialect;

	constructor(
		table: TTable,
		session: MsSqlSession,
		dialect: MsSqlDialect,
		output?: SelectedFieldsOrdered,
		columnList?: string[],
	) {
		this.table = table;
		this.session = session;
		this.dialect = dialect;

		this.config = { table, output, columnList };
	}

	values(
		value: MsSqlInsertValue<TTable, TColumnList>,
	): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput>;
	values(
		values: MsSqlInsertValue<TTable, TColumnList>[],
	): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput>;
	values(
		values: MsSqlInsertValue<TTable, TColumnList> | MsSqlInsertValue<TTable, TColumnList>[],
	): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput> {
		values = Array.isArray(values) ? values : [values];
		if (values.length === 0) {
			throw new Error('values() must be called with at least one value');
		}
		return new MsSqlInsertBase(
			this.table,
			values,
			this.session,
			this.dialect,
			this.config.output,
			this.config.columnList,
		);
	}

	select<TSelection extends MsSqlInsertSelection<TTable, TColumnList>>(
		selectQuery: (
			qb: QueryBuilder,
		) => TypedQueryBuilder<NoUnknownKeysInInsertSelection<TTable, TSelection, TColumnList>>,
	): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput>;
	select(selectQuery: (qb: QueryBuilder) => SQL): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput>;
	select(selectQuery: SQL): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput>;
	select<TSelection extends MsSqlInsertSelection<TTable, TColumnList>>(
		selectQuery: TypedQueryBuilder<NoUnknownKeysInInsertSelection<TTable, TSelection, TColumnList>>,
	): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput>;
	select(
		selectQuery:
			| SQL
			| TypedQueryBuilder<
				NoUnknownKeysInInsertSelection<TTable, MsSqlInsertSelection<TTable, TColumnList>, TColumnList>
			>
			| ((qb: QueryBuilder) =>
				| TypedQueryBuilder<
					NoUnknownKeysInInsertSelection<TTable, MsSqlInsertSelection<TTable, TColumnList>, TColumnList>
				>
				| SQL),
	): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput> {
		const select = typeof selectQuery === 'function' ? selectQuery(new QueryBuilder()) : selectQuery;

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

		return new MsSqlInsertBase(
			this.table,
			select,
			this.session,
			this.dialect,
			this.config.output,
			this.config.columnList,
			true,
		);
	}

	/**
	 * Adds an `output` clause to the query.
	 *
	 * Calling this method will return the specified fields of the inserted rows. If no fields are specified, all fields will be returned.
	 *
	 * @example
	 * ```ts
	 * // Insert one row and return all fields
	 * const insertedCar: Car[] = await db.insert(cars)
	 *   .output();
	 *   .values({ brand: 'BMW' })
	 *
	 * // Insert one row and return only the id
	 * const insertedCarId: { id: number }[] = await db.insert(cars)
	 *   .output({ id: cars.id });
	 *   .values({ brand: 'BMW' })
	 * ```
	 */
	output(): Omit<MsSqlInsertBuilder<TTable, TQueryResult, TPreparedQueryHKT, InferSelectModel<TTable>>, 'output'>;
	output<SelectedFields extends SelectedFieldsFlat>(
		fields: SelectedFields,
	): Omit<MsSqlInsertBuilder<TTable, TQueryResult, TPreparedQueryHKT, SelectResultFields<SelectedFields>>, 'output'>;
	output(
		fields: SelectedFieldsFlat = this.table[Table.Symbol.Columns],
	) {
		this.config.output = orderSelectedFields<MsSqlColumn>(fields);
		return this as any;
	}
}

export type MsSqlInsertWithout<T extends AnyMsSqlInsert, TDynamic extends boolean, K extends keyof T & string> =
	TDynamic extends true ? T
		: Omit<
			MsSqlInsertBase<
				T['_']['table'],
				T['_']['queryResult'],
				T['_']['preparedQueryHKT'],
				T['_']['output'],
				TDynamic,
				T['_']['excludedMethods'] | K
			>,
			T['_']['excludedMethods'] | K
		>;

export type MsSqlInsertDynamic<T extends AnyMsSqlInsert> = MsSqlInsert<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT'],
	T['_']['output']
>;

export type MsSqlInsertPrepare<T extends AnyMsSqlInsert> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	PreparedQueryConfig & {
		execute: T['_']['output'] extends undefined ? QueryResultKind<T['_']['queryResult'], any> : T['_']['output'][];
		iterator: never;
	}
>;

export type MsSqlInsert<
	TTable extends MsSqlTable = MsSqlTable,
	TQueryResult extends QueryResultHKT = AnyQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TOutput extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput, true, never>;

export type AnyMsSqlInsert = MsSqlInsertBase<any, any, any, any, any, any>;

export interface MsSqlInsertBase<
	TTable extends MsSqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TOutput extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<TOutput extends undefined ? QueryResultKind<TQueryResult, any> : TOutput[]>, SQLWrapper {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly output: TOutput;
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
	TOutput extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TOutput extends undefined ? QueryResultKind<TQueryResult, any> : TOutput[]>
	implements SQLWrapper
{
	static override readonly [entityKind]: string = 'MsSqlInsert';

	declare protected $table: TTable;

	private config: MsSqlInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: MsSqlInsertConfig['values'],
		private session: MsSqlSession,
		private dialect: MsSqlDialect,
		output?: SelectedFieldsOrdered,
		columnList?: string[],
		select?: boolean,
	) {
		super();
		this.config = { table, values: values as any, output, columnList, select };
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	prepare(): MsSqlInsertPrepare<this> {
		const fields = this.config.output;

		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			fields ? 'arrays' : 'raw',
			fields ? this.dialect.mapperGenerators.rows(fields, undefined) : undefined,
		) as MsSqlInsertPrepare<this>;
	}

	override execute(
		placeholderValues?: Record<string, unknown>,
	): Promise<TOutput extends undefined ? QueryResultKind<TQueryResult, any> : TOutput[]> {
		return this.prepare().execute(placeholderValues) as any;
	}

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
