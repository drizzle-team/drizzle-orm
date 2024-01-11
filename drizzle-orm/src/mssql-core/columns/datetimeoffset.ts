import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import type { Equal } from '~/utils.ts';
import { MsSqlColumn } from './common.ts';
import type { MsSqlDatetimeConfig } from './date.common.ts';
import { MsSqlDateColumnBaseBuilder } from './date.common.ts';

export type MsSqlDateTimeOffsetBuilderInitial<TName extends string> = MsSqlDateTimeOffsetBuilder<
	{
		name: TName;
		dataType: 'date';
		columnType: 'MsSqlDateTimeOffset';
		data: Date;
		driverParam: string | Date;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MsSqlDateTimeOffsetBuilder<T extends ColumnBuilderBaseConfig<'date', 'MsSqlDateTimeOffset'>>
	extends MsSqlDateColumnBaseBuilder<T, MsSqlDatetimeConfig>
{
	static readonly [entityKind]: string = 'MsSqlDateTimeOffsetBuilder';

	constructor(name: T['name'], config: MsSqlDatetimeConfig | undefined) {
		super(name, 'date', 'MsSqlDateTimeOffset');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDateTimeOffset<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDateTimeOffset<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlDateTimeOffset<T extends ColumnBaseConfig<'date', 'MsSqlDateTimeOffset'>> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlDateTimeOffset';

	readonly precision: number | undefined;

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlDateTimeOffsetBuilder<T>['config'],
	) {
		super(table, config);
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `datetimeoffset${precision}`;
	}
}

export type MsSqlDateTimeOffsetStringBuilderInitial<TName extends string> = MsSqlDateTimeOffsetStringBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MsSqlDateTimeOffsetString';
		data: string;
		driverParam: string | Date;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MsSqlDateTimeOffsetStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlDateTimeOffsetString'>>
	extends MsSqlDateColumnBaseBuilder<T, MsSqlDatetimeConfig>
{
	static readonly [entityKind]: string = 'MsSqlDateTimeOffsetStringBuilder';

	constructor(name: T['name'], config: MsSqlDatetimeConfig | undefined) {
		super(name, 'string', 'MsSqlDateTimeOffsetString');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDateTimeOffsetString<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDateTimeOffsetString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlDateTimeOffsetString<T extends ColumnBaseConfig<'string', 'MsSqlDateTimeOffsetString'>>
	extends MsSqlColumn<T>
{
	static readonly [entityKind]: string = 'MsSqlDateTimeOffsetString';

	readonly precision: number | undefined;

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlDateTimeOffsetStringBuilder<T>['config'],
	) {
		super(table, config);
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `datetimeoffset${precision}`;
	}

	override mapFromDriverValue(value: Date | string | null): string | null {
		return typeof value === 'string' ? value : value?.toISOString() ?? null;
	}
}

export function datetimeoffset<TName extends string, TMode extends MsSqlDatetimeConfig['mode'] & {}>(
	name: TName,
	config?: MsSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateTimeOffsetStringBuilderInitial<TName>
	: MsSqlDateTimeOffsetBuilderInitial<TName>;
export function datetimeoffset(name: string, config: MsSqlDatetimeConfig = {}) {
	if (config.mode === 'string') {
		return new MsSqlDateTimeOffsetStringBuilder(name, config);
	}
	return new MsSqlDateTimeOffsetBuilder(name, config);
}
