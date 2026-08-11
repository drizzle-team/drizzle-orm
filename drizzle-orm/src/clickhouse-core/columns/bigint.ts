import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { numericLiteral } from '../literals.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';

/** ClickHouse integer types too wide to fit losslessly into a JavaScript `number`. */
export type ClickHouseWideIntTypeName = 'Int64' | 'Int128' | 'Int256' | 'UInt64' | 'UInt128' | 'UInt256';

/**
 * How a wide integer is surfaced in TypeScript.
 *
 * ClickHouse's JSON output formats quote 64-bit-and-wider integers, so the driver always hands us a
 * string. `bigint` (the default) is lossless; `number` is convenient but loses precision beyond
 * `Number.MAX_SAFE_INTEGER`; `string` passes the driver value through untouched.
 */
export type ClickHouseBigIntMode = 'bigint' | 'number' | 'string';

export interface ClickHouseBigIntConfig<TMode extends ClickHouseBigIntMode = ClickHouseBigIntMode> {
	mode?: TMode;
}

interface ClickHouseBigIntRuntimeConfig {
	chType: ClickHouseWideIntTypeName;
	mode: ClickHouseBigIntMode;
}

export type ClickHouseBigIntBuilderInitial<
	TName extends string,
	TColumnType extends string,
	TMode extends ClickHouseBigIntMode,
> = ClickHouseBigIntBuilder<{
	name: TName;
	dataType: TMode extends 'number' ? 'number' : TMode extends 'string' ? 'string' : 'bigint';
	columnType: TColumnType;
	data: TMode extends 'number' ? number : TMode extends 'string' ? string : bigint;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class ClickHouseBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint' | 'number' | 'string', string>>
	extends ClickHouseColumnBuilder<T, ClickHouseBigIntRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseBigIntBuilder';

	constructor(
		name: T['name'],
		columnType: T['columnType'],
		chType: ClickHouseWideIntTypeName,
		mode: ClickHouseBigIntMode,
	) {
		super(name, (mode === 'number' ? 'number' : mode === 'string' ? 'string' : 'bigint') as T['dataType'], columnType);
		this.config.chType = chType;
		this.config.mode = mode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseBigInt<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseBigInt<T extends ColumnBaseConfig<'bigint' | 'number' | 'string', string>>
	extends ClickHouseColumn<T, ClickHouseBigIntRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseBigInt';

	readonly chType: ClickHouseWideIntTypeName = this.config.chType;
	readonly mode: ClickHouseBigIntMode = this.config.mode;

	getBaseSQLType(): string {
		return this.chType;
	}

	override mapFromDriverValue(value: string | number | bigint): bigint | number | string {
		switch (this.mode) {
			case 'number': {
				return typeof value === 'number' ? value : Number(value);
			}
			case 'string': {
				return typeof value === 'string' ? value : String(value);
			}
			default: {
				return typeof value === 'bigint' ? value : BigInt(value);
			}
		}
	}

	override mapToDriverValue(value: bigint | number | string): SQL {
		return numericLiteral(value);
	}
}

function bigIntFactory<TColumnType extends string>(columnType: TColumnType, chType: ClickHouseWideIntTypeName) {
	function column(): ClickHouseBigIntBuilderInitial<'', TColumnType, 'bigint'>;
	function column<TMode extends ClickHouseBigIntMode = 'bigint'>(
		config?: ClickHouseBigIntConfig<TMode>,
	): ClickHouseBigIntBuilderInitial<'', TColumnType, TMode>;
	function column<TName extends string, TMode extends ClickHouseBigIntMode = 'bigint'>(
		name: TName,
		config?: ClickHouseBigIntConfig<TMode>,
	): ClickHouseBigIntBuilderInitial<TName, TColumnType, TMode>;
	function column(a?: string | ClickHouseBigIntConfig, b?: ClickHouseBigIntConfig) {
		const { name, config } = getColumnNameAndConfig<ClickHouseBigIntConfig>(a, b);
		return new ClickHouseBigIntBuilder(name, columnType, chType, config?.mode ?? 'bigint');
	}
	return column;
}

/** `Int64` — signed 64-bit integer. Surfaced as `bigint` unless a different `mode` is given. */
export const int64 = bigIntFactory('ClickHouseInt64', 'Int64');

/** `Int128` — signed 128-bit integer. Surfaced as `bigint` unless a different `mode` is given. */
export const int128 = bigIntFactory('ClickHouseInt128', 'Int128');

/** `Int256` — signed 256-bit integer. Surfaced as `bigint` unless a different `mode` is given. */
export const int256 = bigIntFactory('ClickHouseInt256', 'Int256');

/** `UInt64` — unsigned 64-bit integer. Surfaced as `bigint` unless a different `mode` is given. */
export const uint64 = bigIntFactory('ClickHouseUInt64', 'UInt64');

/** `UInt128` — unsigned 128-bit integer. Surfaced as `bigint` unless a different `mode` is given. */
export const uint128 = bigIntFactory('ClickHouseUInt128', 'UInt128');

/** `UInt256` — unsigned 256-bit integer. Surfaced as `bigint` unless a different `mode` is given. */
export const uint256 = bigIntFactory('ClickHouseUInt256', 'UInt256');
