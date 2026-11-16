import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn } from './common.ts';
import { PgDateColumnBaseBuilder } from './date.common.ts';

export type PgTimestampBuilderInitial<TName extends string> = PgTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'PgTimestamp';
	data: Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'PgTimestamp'>>
	extends PgDateColumnBaseBuilder<
		T,
		{ withTimezone: boolean; precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'PgTimestampBuilder';

	constructor(
		name: T['name'],
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'date', 'PgTimestamp');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgTimestamp<MakeColumnConfig<T, TTableName>> {
		return new PgTimestamp<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgTimestamp<T extends ColumnBaseConfig<'date', 'PgTimestamp'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgTimestamp';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgTimestampBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : ` (${this.precision})`;
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue(value: Date | string): Date {
		if (typeof value === 'string') return parsePgTimestamp(value, this.withTimezone);

		return value;
	}

	override mapToDriverValue = (value: Date): string => {
		return value.toISOString();
	};
}

export type PgTimestampStringBuilderInitial<TName extends string> = PgTimestampStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgTimestampString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgTimestampStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgTimestampString'>>
	extends PgDateColumnBaseBuilder<
		T,
		{ withTimezone: boolean; precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'PgTimestampStringBuilder';

	constructor(
		name: T['name'],
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'string', 'PgTimestampString');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgTimestampString<MakeColumnConfig<T, TTableName>> {
		return new PgTimestampString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgTimestampString<T extends ColumnBaseConfig<'string', 'PgTimestampString'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgTimestampString';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgTimestampStringBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;

		const shortened = value.toISOString().slice(0, -1).replace('T', ' ');
		if (this.withTimezone) {
			const offset = value.getTimezoneOffset();
			const sign = offset <= 0 ? '+' : '-';
			return `${shortened}${sign}${Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0')}`;
		}

		return shortened;
	}
}

export type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PgTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	precision?: Precision;
	withTimezone?: boolean;
}

export function timestamp(): PgTimestampBuilderInitial<''>;
export function timestamp<TMode extends PgTimestampConfig['mode'] & {}>(
	config?: PgTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? PgTimestampStringBuilderInitial<''> : PgTimestampBuilderInitial<''>;
export function timestamp<TName extends string, TMode extends PgTimestampConfig['mode'] & {}>(
	name: TName,
	config?: PgTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? PgTimestampStringBuilderInitial<TName> : PgTimestampBuilderInitial<TName>;
export function timestamp(a?: string | PgTimestampConfig, b: PgTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<PgTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new PgTimestampStringBuilder(name, config.withTimezone ?? false, config.precision);
	}
	return new PgTimestampBuilder(name, config?.withTimezone ?? false, config?.precision);
}

/**
 * Matches the text form Postgres uses for `timestamp` and `timestamptz` under the
 * default ISO `DateStyle`: `YYYY-MM-DD HH:MM:SS[.ffffff][+HH[:MM[:SS]]][ BC]`.
 *
 * The year may have more than four digits, the fraction may have up to six digits,
 * and the offset may carry minutes and seconds (Postgres prints local mean time
 * offsets such as `+09:18:59` for instants before a zone's standard time).
 */
const pgTimestampRegex =
	/^(\d{4,})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([+-])(\d{2})(?::(\d{2}))?(?::(\d{2}))?)?( BC)?$/;

/**
 * Parses the text form of a Postgres `timestamp` / `timestamptz` into a `Date`.
 *
 * `new Date(text)` is not enough: the text is not in the ECMAScript date-time string
 * format, so engines fall back to heuristics that reject offsets with seconds, turn
 * years 1–99 into 1901–1999, and reject years with more than four digits.
 *
 * A value this function does not recognise falls back to `new Date` so that any
 * other format still behaves as before.
 */
function parsePgTimestamp(value: string, withTimezone: boolean): Date {
	const match = pgTimestampRegex.exec(value);
	if (!match) {
		return new Date(withTimezone ? value : value + '+0000');
	}

	const [
		,
		year,
		month,
		day,
		hours,
		minutes,
		seconds,
		fraction,
		offsetSign,
		offsetHours,
		offsetMinutes,
		offsetSeconds,
		bc,
	] = match;

	// `Date.UTC` maps years 0–99 onto 1900–1999; setting the fields separately does not.
	const date = new Date(0);
	date.setUTCFullYear(bc ? 1 - Number(year) : Number(year), Number(month) - 1, Number(day));
	date.setUTCHours(
		Number(hours),
		Number(minutes),
		Number(seconds),
		fraction ? Number((fraction + '00').slice(0, 3)) : 0,
	);

	if (withTimezone && offsetSign) {
		const offsetInSeconds = Number(offsetHours) * 3600
			+ (offsetMinutes ? Number(offsetMinutes) * 60 : 0)
			+ (offsetSeconds ? Number(offsetSeconds) : 0);
		date.setTime(date.getTime() - (offsetSign === '+' ? 1 : -1) * offsetInSeconds * 1000);
	}

	return date;
}
