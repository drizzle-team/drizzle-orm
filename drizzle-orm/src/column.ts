import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, ColumnDataType } from './column-builder.ts';
import { entityKind } from './entity.ts';
import type { DriverValueMapper, SQL, SQLWrapper } from './sql/sql.ts';
import type { Table } from './table.ts';
import type { Update } from './utils.ts';

export interface ColumnBaseConfig<
	TDataType extends ColumnDataType,
	TColumnType extends string,
> extends ColumnBuilderBaseConfig<TDataType, TColumnType> {
	tableName: string;
	notNull: boolean;
	hasDefault: boolean;
}

export type ColumnTypeConfig<T extends ColumnBaseConfig<ColumnDataType, string>, TTypeConfig extends object> = T & {
	brand: 'Column';
	tableName: T['tableName'];
	name: T['name'];
	dataType: T['dataType'];
	columnType: T['columnType'];
	data: T['data'];
	driverParam: T['driverParam'];
	notNull: T['notNull'];
	hasDefault: T['hasDefault'];
	enumValues: T['enumValues'];
	baseColumn: T extends { baseColumn: infer U } ? U : unknown;
} & TTypeConfig;

export type ColumnRuntimeConfig<TData, TRuntimeConfig extends object> = ColumnBuilderRuntimeConfig<
	TData,
	TRuntimeConfig
>;

export interface Column<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TRuntimeConfig extends object = object,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTypeConfig extends object = object,
> extends DriverValueMapper<T['data'], T['driverParam']>, SQLWrapper {
	// SQLWrapper runtime implementation is defined in 'sql/sql.ts'
}
/*
	`Column` only accepts a full `ColumnConfig` as its generic.
	To infer parts of the config, use `AnyColumn` that accepts a partial config.
	See `GetColumnData` for example usage of inferring.
*/
export abstract class Column<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
> implements DriverValueMapper<T['data'], T['driverParam']>, SQLWrapper {
	static readonly [entityKind]: string = 'Column';

	declare readonly _: ColumnTypeConfig<T, TTypeConfig>;

	readonly name: string;
	readonly primary: boolean;
	readonly notNull: boolean;
	readonly default: T['data'] | SQL | undefined;
	readonly defaultFn: (() => T['data'] | SQL) | undefined;
	readonly onUpdateFn: (() => T['data'] | SQL) | undefined;
	readonly hasDefault: boolean;
	readonly isUnique: boolean;
	readonly uniqueName: string | undefined;
	readonly uniqueType: string | undefined;
	readonly dataType: T['dataType'];
	readonly columnType: T['columnType'];
	readonly enumValues: T['enumValues'] = undefined;

	protected config: ColumnRuntimeConfig<T['data'], TRuntimeConfig>;

	constructor(
		readonly table: Table,
		config: ColumnRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		this.config = config;
		this.name = config.name;
		this.notNull = config.notNull;
		this.default = config.default;
		this.defaultFn = config.defaultFn;
		this.onUpdateFn = config.onUpdateFn;
		this.hasDefault = config.hasDefault;
		this.primary = config.primaryKey;
		this.isUnique = config.isUnique;
		this.uniqueName = config.uniqueName;
		this.uniqueType = config.uniqueType;
		this.dataType = config.dataType as T['dataType'];
		this.columnType = config.columnType;
	}

	abstract getSQLType(): string;

	mapFromDriverValue(value: unknown): unknown {
		return value;
	}

	mapToDriverValue(value: unknown): unknown {
		return value;
	}
}

export type UpdateColConfig<
	T extends ColumnBaseConfig<ColumnDataType, string>,
	TUpdate extends Partial<ColumnBaseConfig<ColumnDataType, string>>,
> = Update<T, TUpdate>;

export type AnyColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> = Column<
	Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
>;

export type GetColumnData<TColumn extends Column, TInferMode extends 'query' | 'raw' = 'query'> =
	// dprint-ignore
	TInferMode extends 'raw' // Raw mode
		? TColumn['_']['data'] // Just return the underlying type
		: TColumn['_']['notNull'] extends true // Query mode
		? TColumn['_']['data'] // Query mode, not null
		: TColumn['_']['data'] | null; // Query mode, nullable

export type InferColumnsDataTypes<TColumns extends Record<string, Column>> = {
	[Key in keyof TColumns]: GetColumnData<TColumns[Key], 'query'>;
};
