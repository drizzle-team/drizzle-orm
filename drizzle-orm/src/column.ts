import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName, Unwrap } from './branded-types';
import { ColumnBuilder } from './column-builder';
import { BoundParamValue, ParamValueMapper } from './sql';
import { AnyTable } from './table';

export abstract class Column<
	TTableName extends TableName<string>,
	TData extends ColumnData,
	TDriverParam extends ColumnDriverParam,
	TNotNull extends ColumnNotNull<boolean>,
	THasDefault extends ColumnHasDefault<boolean>,
> implements ParamValueMapper<any, any> {
	protected typeKeeper!: {
		brand: 'Column';
		tableName: TTableName;
		type: TData;
		driverType: TDriverParam;
		notNull: TNotNull;
		default: THasDefault;
	};

	readonly name: string;
	readonly primary: boolean;
	readonly references: (() => Column<
		TableName,
		TData,
		ColumnDriverParam,
		ColumnNotNull,
		ColumnHasDefault
	>)[];
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

	/*
		mapFromDriverValue and mapToDriverValue are provided just as a runtime fallback - if you need to override them,
		extend the ColumnWithMapper class instead for proper type-checking.
	*/
	mapFromDriverValue = (value: any): any => {
		return value;
	};

	mapToDriverValue = (value: any): any => {
		return value;
	};

	abstract getSQLType(): string;
}

export abstract class ColumnWithMapper<
	TTableName extends TableName<string>,
	TData extends ColumnData,
	TDriverParam extends ColumnDriverParam,
	TNotNull extends ColumnNotNull<boolean>,
	THasDefault extends ColumnHasDefault<boolean>,
> extends Column<TTableName, TData, TDriverParam, TNotNull, THasDefault>
	implements ParamValueMapper<TData, TDriverParam>
{
	override mapFromDriverValue = (value: Unwrap<TDriverParam>): Unwrap<TData> => {
		return value as any;
	};

	override mapToDriverValue = (value: Unwrap<TData>): Unwrap<TDriverParam> => {
		return value as any;
	};
}

export type AnyColumn<
	TTableName extends TableName = TableName,
	TData extends ColumnData = any,
	TDriverParam extends ColumnDriverParam = any,
	TNotNull extends ColumnNotNull = ColumnNotNull,
	THasDefault extends ColumnHasDefault = ColumnHasDefault,
> = Column<TTableName, TData, TDriverParam, TNotNull, THasDefault>;

export type AnyColumnWithMapper<
	TTableName extends TableName = TableName,
	TData extends ColumnData = any,
	TDriverParam extends ColumnDriverParam = any,
	TNotNull extends ColumnNotNull = ColumnNotNull,
	THasDefault extends ColumnHasDefault = ColumnHasDefault,
> = ColumnWithMapper<TTableName, TData, TDriverParam, TNotNull, THasDefault>;

export function param<TDataType extends ColumnData, TDriverType extends ColumnDriverParam>(
	column: AnyColumn<any, TDataType, TDriverType>,
	value: Unwrap<TDataType>,
): BoundParamValue<TDataType, TDriverType> {
	return new BoundParamValue(value as TDataType, column);
}

export type GetColumnData<
	TColumn,
	TInferMode extends 'query' | 'raw' = 'query',
> =
	// dprint-ignore
	TColumn extends Column<any, infer TData, any, infer TNotNull, any>
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
> ? Unwrap<TDriverType>
	: never;

export type InferColumnsDataTypes<TColumns extends Record<string, AnyColumn>> = {
	[Key in keyof TColumns]: GetColumnData<TColumns[Key], 'query'>;
};

export type InferColumnTable<T extends AnyColumn> = T extends AnyColumn<infer TTable> ? TTable
	: never;

export type ChangeColumnTable<
	TColumn extends AnyColumn,
	TTableName extends TableName,
> = TColumn extends Column<any, infer TType, infer TDriverType, infer TNotNull, infer THasDefault>
	? ColumnWithMapper<TTableName, TType, TDriverType, TNotNull, THasDefault>
	: never;
