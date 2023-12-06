import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import type { Equal } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlDateTimeBuilderInitial<TName extends string> = MsSqlDateTimeBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'MsSqlDateTime';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class MsSqlDateTimeBuilder<T extends ColumnBuilderBaseConfig<'date', 'MsSqlDateTime'>>
	extends MsSqlColumnBuilder<T, MsSqlDatetimeConfig>
{
	static readonly [entityKind]: string = 'MsSqlDateTimeBuilder';

	constructor(name: T['name'], config: MsSqlDatetimeConfig | undefined) {
		super(name, 'date', 'MsSqlDateTime');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDateTime<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDateTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlDateTime<T extends ColumnBaseConfig<'date', 'MsSqlDateTime'>> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlDateTime';

	readonly fsp: number | undefined;

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlDateTimeBuilder<T>['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `datetime${precision}`;
	}

	override mapToDriverValue(value: Date): unknown {
		return value.toISOString().replace('T', ' ').replace('Z', '');
	}

	override mapFromDriverValue(value: Date): Date {
		return value;
	}
}

export type MsSqlDateTimeStringBuilderInitial<TName extends string> = MsSqlDateTimeStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlDateTimeString';
	data: string;
	driverParam: string | number;

	enumValues: undefined;
}>;

export class MsSqlDateTimeStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlDateTimeString'>>
	extends MsSqlColumnBuilder<T, MsSqlDatetimeConfig>
{
	static readonly [entityKind]: string = 'MsSqlDateTimeStringBuilder';

	constructor(name: T['name'], config: MsSqlDatetimeConfig | undefined) {
		super(name, 'string', 'MsSqlDateTimeString');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDateTimeString<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDateTimeString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlDateTimeString<T extends ColumnBaseConfig<'string', 'MsSqlDateTimeString'>> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlDateTimeString';

	readonly fsp: number | undefined;

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlDateTimeStringBuilder<T>['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `datetime${precision}`;
	}

	override mapFromDriverValue(value: Date | string | null): string | null {
		return typeof value === 'string' ? value : value?.toISOString() ?? null;
	}
}

export type DatetimeFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MsSqlDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	fsp?: DatetimeFsp;
}

export function datetime<TName extends string, TMode extends MsSqlDatetimeConfig['mode'] & {}>(
	name: TName,
	config?: MsSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateTimeStringBuilderInitial<TName> : MsSqlDateTimeBuilderInitial<TName>;
export function datetime(name: string, config: MsSqlDatetimeConfig = {}) {
	if (config.mode === 'string') {
		return new MsSqlDateTimeStringBuilder(name, config);
	}
	return new MsSqlDateTimeBuilder(name, config);
}
