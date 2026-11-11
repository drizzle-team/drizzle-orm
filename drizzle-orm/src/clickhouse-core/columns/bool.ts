import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';

export type ClickHouseBooleanBuilderInitial<TName extends string> = ClickHouseBooleanBuilder<{
	name: TName;
	dataType: 'boolean';
	columnType: 'ClickHouseBoolean';
	data: boolean;
	driverParam: boolean | number | string;
	enumValues: undefined;
}>;

export class ClickHouseBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'ClickHouseBoolean'>>
	extends ClickHouseColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'ClickHouseBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'ClickHouseBoolean');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseBoolean<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseBoolean<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseBoolean<T extends ColumnBaseConfig<'boolean', 'ClickHouseBoolean'>> extends ClickHouseColumn<T> {
	static override readonly [entityKind]: string = 'ClickHouseBoolean';

	getBaseSQLType(): string {
		return 'Bool';
	}

	override mapFromDriverValue(value: boolean | number | string): boolean {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'number') return value !== 0;
		return value === 'true' || value === '1';
	}

	override mapToDriverValue(value: boolean): boolean {
		return value;
	}
}

/** `Bool` — a boolean stored as `UInt8` under the hood. */
export function bool(): ClickHouseBooleanBuilderInitial<''>;
export function bool<TName extends string>(name: TName): ClickHouseBooleanBuilderInitial<TName>;
export function bool(name?: string) {
	return new ClickHouseBooleanBuilder(name ?? '');
}

/** Alias for {@link bool}. */
export const boolean = bool;
