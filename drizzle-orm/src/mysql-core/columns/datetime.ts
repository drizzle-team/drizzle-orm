import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import type { Equal } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlDateTimeBuilderInitial<TName extends string> = MySqlDateTimeBuilder<
	{
		name: TName;
		dataType: 'date';
		columnType: 'MySqlDateTime';
		data: Date;
		driverParam: string | number;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlDateTimeBuilder<T extends ColumnBuilderBaseConfig<'date', 'MySqlDateTime'>>
	extends MySqlColumnBuilder<T, MySqlDatetimeConfig>
{
	static readonly [entityKind]: string = 'MySqlDateTimeBuilder';

	constructor(name: T['name'], config: MySqlDatetimeConfig | undefined) {
		super(name, 'date', 'MySqlDateTime');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDateTime<MakeColumnConfig<T, TTableName>> {
		return new MySqlDateTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlDateTime<T extends ColumnBaseConfig<'date', 'MySqlDateTime'>> extends MySqlColumn<T> {
	static readonly [entityKind]: string = 'MySqlDateTime';

	readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateTimeBuilder<T>['config'],
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

	override mapFromDriverValue(value: string): Date {
		return new Date(value.replace(' ', 'T') + 'Z');
	}
}

export type MySqlDateTimeStringBuilderInitial<TName extends string> = MySqlDateTimeStringBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MySqlDateTimeString';
		data: string;
		driverParam: string | number;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlDateTimeStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlDateTimeString'>>
	extends MySqlColumnBuilder<T, MySqlDatetimeConfig>
{
	static readonly [entityKind]: string = 'MySqlDateTimeStringBuilder';

	constructor(name: T['name'], config: MySqlDatetimeConfig | undefined) {
		super(name, 'string', 'MySqlDateTimeString');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDateTimeString<MakeColumnConfig<T, TTableName>> {
		return new MySqlDateTimeString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlDateTimeString<T extends ColumnBaseConfig<'string', 'MySqlDateTimeString'>> extends MySqlColumn<T> {
	static readonly [entityKind]: string = 'MySqlDateTimeString';

	readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateTimeStringBuilder<T>['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `datetime${precision}`;
	}
}

export type DatetimeFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MySqlDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	fsp?: DatetimeFsp;
}

export function datetime<TName extends string, TMode extends MySqlDatetimeConfig['mode'] & {}>(
	name: TName,
	config?: MySqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlDateTimeStringBuilderInitial<TName> : MySqlDateTimeBuilderInitial<TName>;
export function datetime(name: string, config: MySqlDatetimeConfig = {}) {
	if (config.mode === 'string') {
		return new MySqlDateTimeStringBuilder(name, config);
	}
	return new MySqlDateTimeBuilder(name, config);
}
