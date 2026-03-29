import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, CustomTypeAnyConfig } from './column-builder.ts';
import type { SQL } from './sql/sql.ts';
import { entityKind } from './entity.ts';
import type { AnyTable } from './table.ts';
import type { Assume, IfNotAny } from './utils.ts';

export interface ColumnBaseConfig<TDataType extends ColumnDataType, TColumnType extends string> {
	name: string;
	tableName: string;
	dataType: TDataType;
	columnType: TColumnType;
	data: unknown;
	driverParam: unknown;
	enumValues: TDataType extends 'enum' ? string[] : undefined;
	notNull: boolean;
	hasDefault: boolean;
	primaryKey: boolean;
	unique: boolean;
}

export type ColumnDataType =
	| 'array'
	| 'bigint'
	| 'boolean'
	| 'custom'
	| 'date'
	| 'enum'
	| 'json'
	| 'number'
	| 'string'
	| 'text'
	| 'time'
	| 'timestamp'
	| 'uuid';

export type GetColumnData<TColumn extends AnyColumn, TType = unknown> = TColumn['_']['data'] extends TType
	? TColumn['_']['data']
	: never;

export type AnyColumn<
	T extends {
		tableName?: string;
		dataType?: ColumnDataType;
	} = {},
> = Column<{
	tableName: T['tableName'];
	dataType: T['dataType'];
}>;

export class Column<T extends ColumnBaseConfig<ColumnDataType, string>> {
	static readonly [entityKind]: string = 'Column';

	declare protected $brand: 'Column';

	/** @internal */
	readonly config: ColumnBuilderRuntimeConfig<T>;

	constructor(table: AnyTable<{ name: string }>, config: ColumnBuilderRuntimeConfig<T>) {
		this.config = {
			...config,
			tableName: table._.name,
		};
	}

	getSQLType(): string {
		return this.config.columnType;
	}

	/** @internal */
	getDataType(): T['dataType'] {
		return this.config.dataType;
	}

	mapToDriverValue(value: T['data']): T['driverParam'] {
		return value as T['driverParam'];
	}

	mapFromDriverValue(value: T['driverParam']): T['data'] {
		return value as T['data'];
	}

	/** @internal */
	abstract getSQLValueType(): string;
}

export type AnyCustomColumn = Column<{
	dataType: 'custom';
	columnType: string;
	driverParam: unknown;
	data: unknown;
}>;

export type UpdateColConfig<
	T extends ColumnBaseConfig<ColumnDataType, string>,
	K extends Partial<ColumnBaseConfig<ColumnDataType, string>>,
> = ColumnBaseConfig<ColumnDataType, string> & Omit<T, keyof K> & K;