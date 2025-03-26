import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlDateBaseColumn, MySqlDateColumnBaseBuilder } from './date.common.ts';

export type MySqlTimestampBuilderInitial<TName extends string> = MySqlTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'MySqlTimestamp';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class MySqlTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'MySqlTimestamp'>>
	extends MySqlDateColumnBaseBuilder<T, MySqlTimestampConfig>
{
	static override readonly [entityKind]: string = 'MySqlTimestampBuilder';

	constructor(name: T['name'], config: MySqlTimestampConfig | undefined) {
		super(name, 'date', 'MySqlTimestamp');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlTimestamp<MakeColumnConfig<T, TTableName>> {
		return new MySqlTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlTimestamp<T extends ColumnBaseConfig<'date', 'MySqlTimestamp'>>
	extends MySqlDateBaseColumn<T, MySqlTimestampConfig>
{
	static override readonly [entityKind]: string = 'MySqlTimestamp';

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

export type MySqlTimestampStringBuilderInitial<TName extends string> = MySqlTimestampStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlTimestampString';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class MySqlTimestampStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlTimestampString'>>
	extends MySqlDateColumnBaseBuilder<T, MySqlTimestampConfig>
{
	static override readonly [entityKind]: string = 'MySqlTimestampStringBuilder';

	constructor(name: T['name'], config: MySqlTimestampConfig | undefined) {
		super(name, 'string', 'MySqlTimestampString');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlTimestampString<MakeColumnConfig<T, TTableName>> {
		return new MySqlTimestampString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlTimestampString<T extends ColumnBaseConfig<'string', 'MySqlTimestampString'>>
	extends MySqlDateBaseColumn<T, MySqlTimestampConfig>
{
	static override readonly [entityKind]: string = 'MySqlTimestampString';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `timestamp${precision}`;
	}
}

export type TimestampFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MySqlTimestampConfig<TMode extends 'string' | 'date' = 'string' | 'date'> {
	mode?: TMode;
	fsp?: TimestampFsp;
}

export function timestamp(): MySqlTimestampBuilderInitial<''>;
export function timestamp<TMode extends MySqlTimestampConfig['mode'] & {}>(
	config?: MySqlTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlTimestampStringBuilderInitial<''>
	: MySqlTimestampBuilderInitial<''>;
export function timestamp<TName extends string, TMode extends MySqlTimestampConfig['mode'] & {}>(
	name: TName,
	config?: MySqlTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlTimestampStringBuilderInitial<TName>
	: MySqlTimestampBuilderInitial<TName>;
export function timestamp(a?: string | MySqlTimestampConfig, b: MySqlTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MySqlTimestampStringBuilder(name, config);
	}
	return new MySqlTimestampBuilder(name, config);
}
