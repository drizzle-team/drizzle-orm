import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import type { Equal } from '~/utils.ts';
import { MsSqlDateBaseColumn, MsSqlDateColumnBaseBuilder } from './date.common.ts';

export type MsSqlTimestampBuilderInitial<TName extends string> = MsSqlTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'MsSqlTimestamp';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class MsSqlTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'MsSqlTimestamp'>>
	extends MsSqlDateColumnBaseBuilder<T, MsSqlTimestampConfig>
{
	static readonly [entityKind]: string = 'MsSqlTimestampBuilder';

	constructor(name: T['name'], config: MsSqlTimestampConfig | undefined) {
		super(name, 'date', 'MsSqlTimestamp');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlTimestamp<MakeColumnConfig<T, TTableName>> {
		return new MsSqlTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlTimestamp<T extends ColumnBaseConfig<'date', 'MsSqlTimestamp'>>
	extends MsSqlDateBaseColumn<T, MsSqlTimestampConfig>
{
	static readonly [entityKind]: string = 'MsSqlTimestamp';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `timestamp${precision}`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value + '+0000');
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString().slice(0, -1).replace('T', ' ');
	}
}

export type MsSqlTimestampStringBuilderInitial<TName extends string> = MsSqlTimestampStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlTimestampString';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class MsSqlTimestampStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlTimestampString'>>
	extends MsSqlDateColumnBaseBuilder<T, MsSqlTimestampConfig>
{
	static readonly [entityKind]: string = 'MsSqlTimestampStringBuilder';

	constructor(name: T['name'], config: MsSqlTimestampConfig | undefined) {
		super(name, 'string', 'MsSqlTimestampString');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlTimestampString<MakeColumnConfig<T, TTableName>> {
		return new MsSqlTimestampString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlTimestampString<T extends ColumnBaseConfig<'string', 'MsSqlTimestampString'>>
	extends MsSqlDateBaseColumn<T, MsSqlTimestampConfig>
{
	static readonly [entityKind]: string = 'MsSqlTimestampString';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `timestamp${precision}`;
	}
}

export type TimestampFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MsSqlTimestampConfig<TMode extends 'string' | 'date' = 'string' | 'date'> {
	mode?: TMode;
	fsp?: TimestampFsp;
}

export function timestamp<TName extends string, TMode extends MsSqlTimestampConfig['mode'] & {}>(
	name: TName,
	config?: MsSqlTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlTimestampStringBuilderInitial<TName>
	: MsSqlTimestampBuilderInitial<TName>;
export function timestamp(name: string, config: MsSqlTimestampConfig = {}) {
	if (config.mode === 'string') {
		return new MsSqlTimestampStringBuilder(name, config);
	}
	return new MsSqlTimestampBuilder(name, config);
}
