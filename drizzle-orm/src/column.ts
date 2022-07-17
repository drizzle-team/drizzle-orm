import { ColumnBuilder } from './column-builder';
import { MappedParamValue, ParamValueMapper } from './sql';
import { AnyTable } from './table';

export abstract class Column<
	TTableName extends string,
	TType,
	TDriverType,
	TNotNull extends boolean,
	TDefault extends boolean,
> implements ParamValueMapper<TType, TDriverType>
{
	protected enforceCovariance!: {
		brand: 'Column';
		tableName: TTableName;
		type: TType;
		driverType: TDriverType;
		notNull: TNotNull;
		default: TDefault;
	};

	readonly name: string;
	readonly notNull: TNotNull;
	readonly default: InferDefaultColumnValue<TType, TNotNull>;

	constructor(
		readonly table: AnyTable<TTableName>,
		builder: ColumnBuilder<
			Column<string, TType, TDriverType, boolean, boolean>,
			TDriverType,
			TNotNull,
			TDefault
		>,
	) {
		this.name = builder.name;
		this.notNull = builder._notNull;
		this.default = builder._default;
	}

	abstract getSQLType(): string;

	mapFromDriverValue(value: TDriverType): TType {
		return value as unknown as TType;
	}

	mapToDriverValue(value: TType): TDriverType {
		return value as unknown as TDriverType;
	}
}

export type AnyColumn<TTableName extends string = string> = Column<TTableName, any, any, any, any>;

export function param<TType, TDriverType>(
	column: Column<string, TType, TDriverType, any, any>,
	value: TType,
): MappedParamValue<TType, TDriverType> {
	return new MappedParamValue(value, column);
}

export type InferColumnType<
	TColumn,
	TInferMode extends 'query' | 'raw' = 'query',
> = TColumn extends Column<any, infer TType, any, infer TNotNull, any>
	? TInferMode extends 'raw' // Raw mode
		? TType // Just return the underlying type
		: TNotNull extends true // Query mode
		? TType // Query mode, not null
		: TType | null // Query mode, nullable
	: never;

export type InferColumnDriverType<TColumn extends AnyColumn> = TColumn extends Column<
	string,
	any,
	infer TDriverType,
	any,
	any
>
	? TDriverType
	: never;

export type InferColumnsTypes<TColumns extends Record<string, AnyColumn>> = {
	[Key in keyof TColumns]: InferColumnType<TColumns[Key], 'query'>;
};

export type InferDefaultColumnValue<TType, TNotNull extends boolean> = TNotNull extends true
	? TType
	: TType | null;

export type InferColumnTable<T extends AnyColumn> = T extends AnyColumn<infer TTable>
	? TTable
	: never;

export type ChangeColumnTable<
	TColumn extends AnyColumn,
	TTableName extends string,
> = TColumn extends Column<any, infer TType, infer TDriverType, infer TNotNull, infer TDefault>
	? Column<TTableName, TType, TDriverType, TNotNull, TDefault>
	: never;
