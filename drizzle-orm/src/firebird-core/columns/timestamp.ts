import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { FirebirdColumn } from './common.ts';
import { FirebirdDateColumnBaseBuilder } from './date.common.ts';

export type FirebirdTimestampBuilderInitial<TName extends string> = FirebirdTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'FirebirdTimestamp';
	data: Date;
	driverParam: Date;
	enumValues: undefined;
}>;

export class FirebirdTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'FirebirdTimestamp'>>
	extends FirebirdDateColumnBaseBuilder<
		T,
		{ withTimezone: boolean; precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'FirebirdTimestampBuilder';

	constructor(
		name: T['name'],
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'date', 'FirebirdTimestamp');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdTimestamp<MakeColumnConfig<T, TTableName>> {
		return new FirebirdTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdTimestamp<T extends ColumnBaseConfig<'date', 'FirebirdTimestamp'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdTimestamp';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyFirebirdTable<{ name: T['tableName'] }>, config: FirebirdTimestampBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		return `timestamp${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue(value: Date | string): Date {
		if (typeof value === 'string') return new Date(this.withTimezone ? value : value + '+0000');

		return value;
	}

	override mapToDriverValue = (value: Date): Date => {
		return value;
	};
}

export type FirebirdTimestampStringBuilderInitial<TName extends string> = FirebirdTimestampStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'FirebirdTimestampString';
	data: string;
	driverParam: Date | string;
	enumValues: undefined;
}>;

export class FirebirdTimestampStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'FirebirdTimestampString'>>
	extends FirebirdDateColumnBaseBuilder<
		T,
		{ withTimezone: boolean; precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'FirebirdTimestampStringBuilder';

	constructor(
		name: T['name'],
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'string', 'FirebirdTimestampString');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdTimestampString<MakeColumnConfig<T, TTableName>> {
		return new FirebirdTimestampString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdTimestampString<T extends ColumnBaseConfig<'string', 'FirebirdTimestampString'>>
	extends FirebirdColumn<T>
{
	static override readonly [entityKind]: string = 'FirebirdTimestampString';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyFirebirdTable<{ name: T['tableName'] }>, config: FirebirdTimestampStringBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		return `timestamp${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;

		const shortened = formatFirebirdTimestamp(value);
		if (this.withTimezone) {
			const offset = value.getTimezoneOffset();
			const sign = offset <= 0 ? '+' : '-';
			return `${shortened}${sign}${Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0')}`;
		}

		return shortened;
	}

	override mapToDriverValue(value: string): Date | string {
		const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,4}))?$/.exec(value);
		if (!match) return value;

		const [, year, month, day, hours, minutes, seconds, fraction = '0'] = match;
		return new Date(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hours),
			Number(minutes),
			Number(seconds),
			Number(fraction.padEnd(3, '0').slice(0, 3)),
		);
	}
}

function formatFirebirdTimestamp(value: Date): string {
	const year = String(value.getFullYear()).padStart(4, '0');
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');
	const hours = String(value.getHours()).padStart(2, '0');
	const minutes = String(value.getMinutes()).padStart(2, '0');
	const seconds = String(value.getSeconds()).padStart(2, '0');
	const milliseconds = String(value.getMilliseconds()).padStart(3, '0');

	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface FirebirdTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	precision?: Precision;
	withTimezone?: boolean;
}

export function timestamp(): FirebirdTimestampBuilderInitial<''>;
export function timestamp<TMode extends FirebirdTimestampConfig['mode'] & {}>(
	config?: FirebirdTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? FirebirdTimestampStringBuilderInitial<''>
	: FirebirdTimestampBuilderInitial<''>;
export function timestamp<TName extends string, TMode extends FirebirdTimestampConfig['mode'] & {}>(
	name: TName,
	config?: FirebirdTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? FirebirdTimestampStringBuilderInitial<TName>
	: FirebirdTimestampBuilderInitial<TName>;
export function timestamp(a?: string | FirebirdTimestampConfig, b: FirebirdTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<FirebirdTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new FirebirdTimestampStringBuilder(name, config.withTimezone ?? false, config.precision);
	}
	return new FirebirdTimestampBuilder(name, config?.withTimezone ?? false, config?.precision);
}
