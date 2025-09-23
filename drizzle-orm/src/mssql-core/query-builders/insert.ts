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
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL } from '~/sql/sql.ts';
import { type InferInsertModel, type InferSelectModel, Table } from '~/table.ts';
import { orderSelectedFields } from '~/utils.ts';
import type { MsSqlColumn } from '../columns/common.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';

export interface MsSqlInsertConfig<TTable extends MsSqlTable = MsSqlTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	output?: SelectedFieldsOrdered;
}

export type MsSqlInsertValue<
	TTable extends MsSqlTable,
	TModel extends Record<string, any> = InferInsertModel<TTable>,
> =
	& {
		[Key in keyof TModel]: TModel[Key] | SQL | Placeholder;
	}
	& {};

export class MsSqlInsertBuilder<
	TTable extends MsSqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TOutput extends Record<string, unknown> | undefined = undefined,
> {
	static readonly [entityKind]: string = 'MsSqlInsertBuilder';

	private config: {
		output?: SelectedFieldsOrdered;
		table: TTable;
	};

	protected table: TTable;
	protected session: MsSqlSession;
	protected dialect: MsSqlDialect;

	constructor(
		table: TTable,
		session: MsSqlSession,
		dialect: MsSqlDialect,
		output?: SelectedFieldsOrdered,
	) {
		this.table = table;
		this.session = session;
		this.dialect = dialect;

		this.config = { table, output };
	}

	values(
		value: MsSqlInsertValue<TTable>,
	): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput>;
	values(values: MsSqlInsertValue<TTable>[]): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput>;
	values(
		values: MsSqlInsertValue<TTable> | MsSqlInsertValue<TTable>[],
	): MsSqlInsertBase<TTable, TQueryResult, TPreparedQueryHKT, TOutput> {
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

		return new MsSqlInsertBase(this.table, mappedValues, this.session, this.dialect, this.config.output);
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
	) {
		super();
		this.config = { table, values, output };
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
			this.config.output,
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

	// $dynamic(): MsSqlInsertDynamic<this> {
	// 	return this as any;
	// }
}
