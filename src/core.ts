import { Primitive, SQL } from './sql';

export interface DriverResponse {
	rows: any[];
	rowCount: number;
	command: string;
}

export abstract class Session {
	public abstract query(
		query: string,
		params: unknown[],
	): Promise<DriverResponse>;
}

export type RequiredKeyOnly<TKey, T extends AnyColumn> = T extends Column<
	any,
	any,
	any,
	infer TDefault
>
	? TDefault extends false
		? TKey
		: never
	: never;

export type OptionalKeyOnly<TKey, T extends AnyColumn> = T extends Column<
	any,
	any,
	any,
	infer TDefault
>
	? [TDefault] extends [true]
		? TKey
		: never
	: never;

export type InferType<
	TTable extends AnyTable,
	TInferMode extends 'select' | 'insert' = 'select',
> = TTable extends Table<any, infer TColumns>
	? TInferMode extends 'insert'
		? {
				[Key in keyof TColumns as RequiredKeyOnly<
					Key,
					TColumns[Key]
				>]: InferColumnType<TColumns[Key], 'query'>;
		  } & {
				[Key in keyof TColumns as OptionalKeyOnly<
					Key,
					TColumns[Key]
				>]?: InferColumnType<TColumns[Key], 'query'>;
		  }
		: {
				[Key in keyof TColumns]: InferColumnType<
					TColumns[Key],
					'query'
				>;
		  }
	: never;

export interface UpdateConfig {
	where: SQL;
	set: SQL;
	table: AnyTable;
}

export type SelectFields<TTable extends string> = {
	[Key: string]: SQL<TTable> | Column<TTable>;
};

export interface SelectConfig<TTable extends AnyTable> {
	fields: SelectFields<TableName<TTable>> | undefined;
	where: SQL<TableName<TTable>>;
	table: TTable;
}

export interface Return {}

export abstract class ColumnBuilder<
	TColumnType extends AnyColumn = AnyColumn,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> {
	/** @internal */ private columnType!: TColumnType;
	/** @internal */ _notNull = false as TNotNull;
	/** @internal */ _default!: InferDefaultColumnValue<
		InferColumnType<TColumnType, 'raw'>,
		TNotNull
	>;
	/** @internal */ _primaryKey = false;

	/** @internal */ name: string;

	constructor(name: string) {
		this.name = name;
	}

	notNull(): ColumnBuilder<TColumnType, true, TDefault> {
		this._notNull = true as TNotNull;
		return this as ColumnBuilder<TColumnType, true, TDefault>;
	}

	default(
		value: InferDefaultColumnValue<
			InferColumnType<TColumnType, 'raw'>,
			TNotNull
		>,
	): ColumnBuilder<TColumnType, TNotNull, true> {
		this._default = value;
		return this as ColumnBuilder<TColumnType, TNotNull, true>;
	}

	primaryKey(): ColumnBuilder<TColumnType, true, TDefault> {
		this._primaryKey = true;
		return this as ColumnBuilder<TColumnType, true, TDefault>;
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): TColumnType;
}

export type InferColumnConfigType<TConfig extends ColumnBuilder> =
	TConfig extends ColumnBuilder<infer TColumnType> ? TColumnType : never;

export type InferColumnConfigNotNull<TConfig extends ColumnBuilder> =
	TConfig extends ColumnBuilder<any, infer TNotNull> ? TNotNull : never;

export type InferColumnConfigDefault<TConfig extends ColumnBuilder> =
	TConfig extends ColumnBuilder<any, any, infer TDefault> ? TDefault : never;

export type BuildColumnsWithTable<
	TTableName extends string,
	TConfigMap extends Record<string, ColumnBuilder>,
> = {
	[Key in keyof TConfigMap]: Column<
		TTableName,
		InferColumnType<InferColumnConfigType<TConfigMap[Key]>, 'raw'>,
		InferColumnConfigNotNull<TConfigMap[Key]>,
		InferColumnConfigDefault<TConfigMap[Key]>
	>;
};

export abstract class Column<
	TTableName extends string,
	TType extends Primitive = Primitive,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> {
	readonly name: string;
	readonly notNull: TNotNull;
	readonly default: InferDefaultColumnValue<TType, TNotNull>;
	private type!: TType;

	constructor(
		readonly table: AnyTable<TTableName>,
		builder: ColumnBuilder<
			Column<string, TType, TNotNull, TDefault>,
			TNotNull,
			TDefault
		>,
	) {
		this.name = builder.name;
		this.notNull = builder._notNull;
		this.default = builder._default;
	}

	abstract getSQLType(): string;
}

export type AnyColumn = Column<string>;

export type InferColumnType<
	TColumn extends AnyColumn,
	TInferMode extends 'query' | 'raw',
> = TColumn extends Column<any, infer TType, infer TNotNull, infer TDefault>
	? TInferMode extends 'raw' // Raw mode
		? TType // Just return the underlying type
		: TNotNull extends true // Query mode
		? TType // Query mode, not null
		: TType | null // Query mode, nullable
	: never;

export type InferDefaultColumnValue<
	TType,
	TNotNull extends boolean,
> = TNotNull extends true ? TType : TType | null;

export type InferColumnTable<T extends AnyColumn> = T extends Column<
	infer TTable
>
	? TTable
	: never;

export function table<
	TTableName extends string,
	TConfigMap extends Record<string, ColumnBuilder>,
>(
	name: TTableName,
	config: TConfigMap,
): Table<TTableName, BuildColumnsWithTable<TTableName, TConfigMap>> &
	BuildColumnsWithTable<TTableName, TConfigMap> {
	const table = new Table<
		TTableName,
		BuildColumnsWithTable<TTableName, TConfigMap>
	>(name);

	const builtColumns = Object.fromEntries(
		Object.entries(config).map(([name, colConfig]) => [
			name,
			colConfig.build(table),
		]),
	) as BuildColumnsWithTable<TTableName, TConfigMap>;

	table[columns] = builtColumns;

	return Object.assign(table, builtColumns);
}

/** @internal */
export const tableName = Symbol('tableName');

/** @internal */
export const columns = Symbol('columns');

export class Table<
	TName extends string,
	TColumns extends Record<string, AnyColumn>,
> {
	/** @internal */
	[tableName]: TName;

	/** @internal */
	[columns]!: TColumns;

	constructor(name: TName) {
		this[tableName] = name;
	}
}

export type TableName<T extends AnyTable> = T extends AnyTable<infer TName>
	? TName
	: never;

export type AnyTable<TName extends string = string> = Table<
	TName,
	Record<string, AnyColumn>
>;
