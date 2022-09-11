import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName, Unwrap } from './branded-types';
import { ColumnBuilder } from './column-builder';
import { BoundParamValue, DriverValueMapper } from './sql';
import { AnyTable } from './table';

export abstract class Column<
	TTableName extends TableName<string>,
	TData extends ColumnData,
	TDriverParam extends ColumnDriverParam,
	TNotNull extends ColumnNotNull<boolean>,
	THasDefault extends ColumnHasDefault<boolean>,
> implements DriverValueMapper<Unwrap<TData>, Unwrap<TDriverParam>> {
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
	}

	abstract getSQLType(): string;

	mapFromDriverValue(value: Unwrap<TDriverParam>): Unwrap<TData> {
		return value as any;
	}

	mapToDriverValue(value: Unwrap<TData>): Unwrap<TDriverParam> {
		return value as any;
	}
}

export type AnyColumn<
	TTableName extends TableName = TableName,
	TData extends ColumnData = ColumnData,
	TDriverParam extends ColumnDriverParam = ColumnDriverParam,
	TNotNull extends ColumnNotNull = ColumnNotNull,
	THasDefault extends ColumnHasDefault = ColumnHasDefault,
> = Column<TTableName, TData, TDriverParam, TNotNull, THasDefault>;

export function param<TData extends ColumnData, TDriver extends ColumnDriverParam>(
	value: Unwrap<TData>,
	mapper: DriverValueMapper<Unwrap<TData>, Unwrap<TDriver>>,
): BoundParamValue<TData, TDriver> {
	return new BoundParamValue(value as TData, mapper);
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
