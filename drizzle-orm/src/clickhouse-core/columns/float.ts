import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { numberToText, numericLiteral } from '../literals.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';

export type ClickHouseFloatTypeName = 'Float32' | 'Float64';

interface ClickHouseFloatRuntimeConfig {
	chType: ClickHouseFloatTypeName;
}

export type ClickHouseFloatBuilderInitial<TName extends string, TColumnType extends string> = ClickHouseFloatBuilder<{
	name: TName;
	dataType: 'number';
	columnType: TColumnType;
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class ClickHouseFloatBuilder<T extends ColumnBuilderBaseConfig<'number', string>>
	extends ClickHouseColumnBuilder<T, ClickHouseFloatRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseFloatBuilder';

	constructor(name: T['name'], columnType: T['columnType'], chType: ClickHouseFloatTypeName) {
		super(name, 'number', columnType);
		this.config.chType = chType;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseFloat<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseFloat<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseFloat<T extends ColumnBaseConfig<'number', string>>
	extends ClickHouseColumn<T, ClickHouseFloatRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseFloat';

	readonly chType: ClickHouseFloatTypeName = this.config.chType;

	getBaseSQLType(): string {
		return this.chType;
	}

	override mapFromDriverValue(value: number | string): number {
		// `inf`, `-inf` and `nan` come back as strings in ClickHouse's JSON formats.
		if (typeof value === 'number') return value;
		if (value === 'inf') return Number.POSITIVE_INFINITY;
		if (value === '-inf') return Number.NEGATIVE_INFINITY;
		return Number(value);
	}

	override mapToDriverValue(value: number): SQL {
		return numericLiteral(value);
	}

	/**
	 * Finite values pass through as JSON numbers. `NaN` and the infinities do not exist in JSON —
	 * `JSON.stringify` turns them into `null`, which is a rejected insert for a non-nullable column
	 * and a silently wrong value for a nullable one — so they go as the strings ClickHouse spells
	 * them with, which it accepts for a `Float` column and which `mapFromDriverValue` reads back.
	 */
	override mapToRowValue(value: number): number | string {
		return Number.isFinite(value) ? value : numberToText(value);
	}
}

function floatFactory<TColumnType extends string>(columnType: TColumnType, chType: ClickHouseFloatTypeName) {
	function column(): ClickHouseFloatBuilderInitial<'', TColumnType>;
	function column<TName extends string>(name: TName): ClickHouseFloatBuilderInitial<TName, TColumnType>;
	function column(name?: string) {
		return new ClickHouseFloatBuilder(name ?? '', columnType, chType);
	}
	return column;
}

/** `Float32` — single-precision IEEE-754 floating point number. */
export const float32 = floatFactory('ClickHouseFloat32', 'Float32');

/** `Float64` — double-precision IEEE-754 floating point number. */
export const float64 = floatFactory('ClickHouseFloat64', 'Float64');
