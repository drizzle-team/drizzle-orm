import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlDateTimeBuilderInitial<TName extends string> = GoogleSqlDateTimeBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'GoogleSqlDateTime';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class GoogleSqlDateTimeBuilder<T extends ColumnBuilderBaseConfig<'date', 'GoogleSqlDateTime'>>
	extends GoogleSqlColumnBuilder<T, GoogleSqlDatetimeConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlDateTimeBuilder';

	constructor(name: T['name'], config: GoogleSqlDatetimeConfig | undefined) {
		super(name, 'date', 'GoogleSqlDateTime');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlDateTime<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlDateTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlDateTime<T extends ColumnBaseConfig<'date', 'GoogleSqlDateTime'>> extends GoogleSqlColumn<T> {
	static override readonly [entityKind]: string = 'GoogleSqlDateTime';

	readonly fsp: number | undefined;

	constructor(
		table: AnyGoogleSqlTable<{ name: T['tableName'] }>,
		config: GoogleSqlDateTimeBuilder<T>['config'],
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

export type GoogleSqlDateTimeStringBuilderInitial<TName extends string> = GoogleSqlDateTimeStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GoogleSqlDateTimeString';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class GoogleSqlDateTimeStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlDateTimeString'>>
	extends GoogleSqlColumnBuilder<T, GoogleSqlDatetimeConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlDateTimeStringBuilder';

	constructor(name: T['name'], config: GoogleSqlDatetimeConfig | undefined) {
		super(name, 'string', 'GoogleSqlDateTimeString');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlDateTimeString<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlDateTimeString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlDateTimeString<T extends ColumnBaseConfig<'string', 'GoogleSqlDateTimeString'>> extends GoogleSqlColumn<T> {
	static override readonly [entityKind]: string = 'GoogleSqlDateTimeString';

	readonly fsp: number | undefined;

	constructor(
		table: AnyGoogleSqlTable<{ name: T['tableName'] }>,
		config: GoogleSqlDateTimeStringBuilder<T>['config'],
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

export interface GoogleSqlDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	fsp?: DatetimeFsp;
}

export function datetime(): GoogleSqlDateTimeBuilderInitial<''>;
export function datetime<TMode extends GoogleSqlDatetimeConfig['mode'] & {}>(
	config?: GoogleSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? GoogleSqlDateTimeStringBuilderInitial<''> : GoogleSqlDateTimeBuilderInitial<''>;
export function datetime<TName extends string, TMode extends GoogleSqlDatetimeConfig['mode'] & {}>(
	name: TName,
	config?: GoogleSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? GoogleSqlDateTimeStringBuilderInitial<TName> : GoogleSqlDateTimeBuilderInitial<TName>;
export function datetime(a?: string | GoogleSqlDatetimeConfig, b?: GoogleSqlDatetimeConfig) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlDatetimeConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new GoogleSqlDateTimeStringBuilder(name, config);
	}
	return new GoogleSqlDateTimeBuilder(name, config);
}
