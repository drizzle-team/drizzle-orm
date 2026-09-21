import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';

/** ClickHouse integer types that fit losslessly into a JavaScript `number`. */
export type ClickHouseNumericIntTypeName = 'Int8' | 'Int16' | 'Int32' | 'UInt8' | 'UInt16' | 'UInt32';

export interface ClickHouseIntConfig {
	chType: ClickHouseNumericIntTypeName;
}

export type ClickHouseIntBuilderInitial<TName extends string, TColumnType extends string> = ClickHouseIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: TColumnType;
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class ClickHouseIntBuilder<T extends ColumnBuilderBaseConfig<'number', string>>
	extends ClickHouseColumnBuilder<T, ClickHouseIntConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseIntBuilder';

	constructor(name: T['name'], columnType: T['columnType'], chType: ClickHouseNumericIntTypeName) {
		super(name, 'number', columnType);
		this.config.chType = chType;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseInt<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseInt<T extends ColumnBaseConfig<'number', string>>
	extends ClickHouseColumn<T, ClickHouseIntConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseInt';

	readonly chType: ClickHouseNumericIntTypeName = this.config.chType;

	getBaseSQLType(): string {
		return this.chType;
	}

	override mapFromDriverValue(value: number | string): number {
		// ClickHouse's JSON formats quote integers wider than 32 bits, and `UInt32` is among them
		// whenever `output_format_json_quote_64bit_integers` is widened by the caller.
		return typeof value === 'string' ? Number(value) : value;
	}
}

function intFactory<TColumnType extends string>(columnType: TColumnType, chType: ClickHouseNumericIntTypeName) {
	function column(): ClickHouseIntBuilderInitial<'', TColumnType>;
	function column<TName extends string>(name: TName): ClickHouseIntBuilderInitial<TName, TColumnType>;
	function column(name?: string) {
		return new ClickHouseIntBuilder(name ?? '', columnType, chType);
	}
	return column;
}

/** `Int8` — signed 8-bit integer, range `-128` to `127`. */
export const int8 = intFactory('ClickHouseInt8', 'Int8');

/** `Int16` — signed 16-bit integer, range `-32768` to `32767`. */
export const int16 = intFactory('ClickHouseInt16', 'Int16');

/** `Int32` — signed 32-bit integer, range `-2147483648` to `2147483647`. */
export const int32 = intFactory('ClickHouseInt32', 'Int32');

/** `UInt8` — unsigned 8-bit integer, range `0` to `255`. */
export const uint8 = intFactory('ClickHouseUInt8', 'UInt8');

/** `UInt16` — unsigned 16-bit integer, range `0` to `65535`. */
export const uint16 = intFactory('ClickHouseUInt16', 'UInt16');

/** `UInt32` — unsigned 32-bit integer, range `0` to `4294967295`. */
export const uint32 = intFactory('ClickHouseUInt32', 'UInt32');
