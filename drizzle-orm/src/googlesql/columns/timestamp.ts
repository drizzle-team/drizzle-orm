import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlDateBaseColumn, GoogleSqlDateColumnBaseBuilder } from './date.common.ts';

export type GoogleSqlTimestampBuilderInitial<TName extends string> = GoogleSqlTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'GoogleSqlTimestamp';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class GoogleSqlTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'GoogleSqlTimestamp'>>
	extends GoogleSqlDateColumnBaseBuilder<T, GoogleSqlTimestampConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlTimestampBuilder';

	constructor(name: T['name'], config: GoogleSqlTimestampConfig | undefined) {
		super(name, 'date', 'GoogleSqlTimestamp');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlTimestamp<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlTimestamp<T extends ColumnBaseConfig<'date', 'GoogleSqlTimestamp'>>
	extends GoogleSqlDateBaseColumn<T, GoogleSqlTimestampConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlTimestamp';

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

export type GoogleSqlTimestampStringBuilderInitial<TName extends string> = GoogleSqlTimestampStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GoogleSqlTimestampString';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class GoogleSqlTimestampStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlTimestampString'>>
	extends GoogleSqlDateColumnBaseBuilder<T, GoogleSqlTimestampConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlTimestampStringBuilder';

	constructor(name: T['name'], config: GoogleSqlTimestampConfig | undefined) {
		super(name, 'string', 'GoogleSqlTimestampString');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlTimestampString<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlTimestampString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlTimestampString<T extends ColumnBaseConfig<'string', 'GoogleSqlTimestampString'>>
	extends GoogleSqlDateBaseColumn<T, GoogleSqlTimestampConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlTimestampString';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `timestamp${precision}`;
	}
}

export type TimestampFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface GoogleSqlTimestampConfig<TMode extends 'string' | 'date' = 'string' | 'date'> {
	mode?: TMode;
	fsp?: TimestampFsp;
}

export function timestamp(): GoogleSqlTimestampBuilderInitial<''>;
export function timestamp<TMode extends GoogleSqlTimestampConfig['mode'] & {}>(
	config?: GoogleSqlTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? GoogleSqlTimestampStringBuilderInitial<''>
	: GoogleSqlTimestampBuilderInitial<''>;
export function timestamp<TName extends string, TMode extends GoogleSqlTimestampConfig['mode'] & {}>(
	name: TName,
	config?: GoogleSqlTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? GoogleSqlTimestampStringBuilderInitial<TName>
	: GoogleSqlTimestampBuilderInitial<TName>;
export function timestamp(a?: string | GoogleSqlTimestampConfig, b: GoogleSqlTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new GoogleSqlTimestampStringBuilder(name, config);
	}
	return new GoogleSqlTimestampBuilder(name, config);
}
