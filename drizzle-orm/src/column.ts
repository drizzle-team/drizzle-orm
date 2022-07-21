import {
	ColumnData,
	ColumnDriverParam,
	ColumnHasDefault,
	ColumnNotNull,
	TableName,
	Unwrap,
} from './branded-types';
import { ColumnBuilder } from './column-builder';
import { BoundParamValue, ParamValueMapper } from './sql';
import { AnyTable } from './table';

export abstract class Column<
	TTableName extends TableName<string>,
	TData extends ColumnData,
	TDriverParam extends ColumnDriverParam,
	TNotNull extends ColumnNotNull<boolean>,
	THasDefault extends ColumnHasDefault<boolean>,
> implements ParamValueMapper<TData, TDriverParam>
{
	protected typeKeeper!: {
		brand: 'Column';
		tableName: Unwrap<TTableName>;
		type: Unwrap<TData>;
		driverType: Unwrap<TDriverParam>;
		notNull: Unwrap<TNotNull>;
		default: Unwrap<THasDefault>;
	};

	readonly name: string;
	readonly primary: boolean;
	readonly references: (() => Column<
		TableName,
		TData,
		ColumnDriverParam,
		ColumnNotNull,
		ColumnHasDefault
	>)[] = [];
	readonly notNull: TNotNull;
	readonly default: TData | undefined;

	constructor(
		readonly table: AnyTable<TTableName>,
		builder: ColumnBuilder<TData, TDriverParam, TNotNull, THasDefault>,
	) {
		this.name = builder.name;
		this.notNull = builder._notNull;
		this.default = builder._default;
		this.primary = builder._primaryKey;
		this.references = builder._references;
	}

	abstract getSQLType(): string;

	mapFromDriverValue(value: TDriverParam): TData {
		return value as unknown as TData;
	}

	mapToDriverValue(value: TData): TDriverParam {
		return value as unknown as TDriverParam;
	}
}

export type AnyColumn<TTableName extends TableName = TableName> = Column<
	TTableName,
	ColumnData,
	ColumnDriverParam,
	ColumnNotNull,
	ColumnHasDefault
>;

export function param<TDataType extends ColumnData, TDriverType extends ColumnDriverParam>(
	column: Column<any, TDataType, TDriverType, any, any>,
	value: Unwrap<TDataType>,
): BoundParamValue<TDataType, TDriverType> {
	return new BoundParamValue(value as TDataType, column);
}

export type GetColumnData<
	TColumn,
	TInferMode extends 'query' | 'raw' = 'query',
> = TColumn extends Column<any, infer TData, any, infer TNotNull, any>
	? TInferMode extends 'raw' // Raw mode
		? Unwrap<TData> // Just return the underlying type
		: TNotNull extends true // Query mode
		? Unwrap<TData> // Query mode, not null
		: Unwrap<TData> | null // Query mode, nullable
	: never;

export type InferColumnDriverParam<TColumn extends AnyColumn> = TColumn extends Column<
	TableName,
	ColumnData,
	infer TDriverType,
	ColumnNotNull,
	ColumnHasDefault
>
	? Unwrap<TDriverType>
	: never;

export type InferColumnsDataTypes<TColumns extends Record<string, AnyColumn>> = {
	[Key in keyof TColumns]: GetColumnData<TColumns[Key], 'query'>;
};

export type InferColumnTable<T extends AnyColumn> = T extends AnyColumn<infer TTable>
	? TTable
	: never;

export type ChangeColumnTable<
	TColumn extends AnyColumn,
	TTableName extends TableName,
> = TColumn extends Column<any, infer TType, infer TDriverType, infer TNotNull, infer THasDefault>
	? Column<TTableName, TType, TDriverType, TNotNull, THasDefault>
	: never;
