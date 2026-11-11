import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { castFromString } from '../literals.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';
import { type ClickHouseDateMode, formatClickHouseDateTime, parseClickHouseDateTime } from './date.common.ts';

export interface ClickHouseDateTimeConfig<TMode extends ClickHouseDateMode = ClickHouseDateMode> {
	/**
	 * An IANA timezone name, e.g. `'UTC'` or `'Europe/Berlin'`.
	 *
	 * Declaring one is strongly recommended: an untyped `DateTime` is rendered in whatever timezone
	 * the *server* is configured with, which makes the stored value depend on deployment config.
	 */
	timezone?: string;
	mode?: TMode;
}

export interface ClickHouseDateTime64Config<TMode extends ClickHouseDateMode = ClickHouseDateMode>
	extends ClickHouseDateTimeConfig<TMode>
{
	/**
	 * Digits of sub-second precision, `0`–`9`. Defaults to `3` (milliseconds), which is as fine as a
	 * JavaScript `Date` can represent — higher precisions round-trip correctly only in `string` mode.
	 */
	precision?: number;
}

interface ClickHouseDateTimeRuntimeConfig {
	precision: number | undefined;
	timezone: string | undefined;
	mode: ClickHouseDateMode;
}

export type ClickHouseDateTimeBuilderInitial<
	TName extends string,
	TColumnType extends string,
	TMode extends ClickHouseDateMode,
> = ClickHouseDateTimeBuilder<{
	name: TName;
	dataType: TMode extends 'string' ? 'string' : 'date';
	columnType: TColumnType;
	data: TMode extends 'string' ? string : Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class ClickHouseDateTimeBuilder<T extends ColumnBuilderBaseConfig<'date' | 'string', string>>
	extends ClickHouseColumnBuilder<T, ClickHouseDateTimeRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseDateTimeBuilder';

	constructor(
		name: T['name'],
		columnType: T['columnType'],
		precision: number | undefined,
		timezone: string | undefined,
		mode: ClickHouseDateMode,
	) {
		super(name, (mode === 'string' ? 'string' : 'date') as T['dataType'], columnType);
		this.config.precision = precision;
		this.config.timezone = timezone;
		this.config.mode = mode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseDateTime<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseDateTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseDateTime<T extends ColumnBaseConfig<'date' | 'string', string>>
	extends ClickHouseColumn<T, ClickHouseDateTimeRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseDateTime';

	readonly precision: number | undefined = this.config.precision;
	readonly timezone: string | undefined = this.config.timezone;
	readonly mode: ClickHouseDateMode = this.config.mode;

	getBaseSQLType(): string {
		const args: string[] = [];
		if (this.precision !== undefined) args.push(String(this.precision));
		if (this.timezone !== undefined) args.push(`'${this.timezone}'`);

		if (this.precision === undefined) {
			return args.length > 0 ? `DateTime(${args.join(', ')})` : 'DateTime';
		}
		return `DateTime64(${args.join(', ')})`;
	}

	override mapFromDriverValue(value: string): Date | string {
		return this.mode === 'string' ? value : parseClickHouseDateTime(value);
	}

	override mapToDriverValue(value: Date | string): SQL {
		const text = typeof value === 'string' ? value : formatClickHouseDateTime(value, this.precision ?? 0);

		// The value is rendered in UTC, so the literal has to be built in UTC too — otherwise
		// ClickHouse would read it in the column's timezone and shift the instant.
		return this.precision === undefined
			? castFromString('toDateTime', text, 'UTC')
			: castFromString('toDateTime64', text, this.precision, 'UTC');
	}

	/**
	 * The textual form without the cast — a row format has no expression to build, and the server
	 * parses it against the column's own type.
	 *
	 * **A column with no declared timezone is parsed in the server's**, so an untyped `DateTime`
	 * written this way lands wherever the deployment happens to be configured. That is the hazard the
	 * literal path sidesteps by passing `'UTC'` explicitly, and it cannot be sidestepped here — one
	 * more reason to declare a timezone on the column.
	 */
	override mapToRowValue(value: Date | string): string {
		return typeof value === 'string' ? value : formatClickHouseDateTime(value, this.precision ?? 0);
	}
}

/**
 * `DateTime([timezone])` — a second-resolution timestamp stored as a 4-byte Unix time.
 *
 * Pass a `timezone` unless you are certain of the server's; it determines how the value is rendered
 * on read and interpreted when written as text.
 */
export function dateTime(): ClickHouseDateTimeBuilderInitial<'', 'ClickHouseDateTime', 'date'>;
export function dateTime<TMode extends ClickHouseDateMode = 'date'>(
	config?: ClickHouseDateTimeConfig<TMode>,
): ClickHouseDateTimeBuilderInitial<'', 'ClickHouseDateTime', TMode>;
export function dateTime<TName extends string, TMode extends ClickHouseDateMode = 'date'>(
	name: TName,
	config?: ClickHouseDateTimeConfig<TMode>,
): ClickHouseDateTimeBuilderInitial<TName, 'ClickHouseDateTime', TMode>;
export function dateTime(a?: string | ClickHouseDateTimeConfig, b?: ClickHouseDateTimeConfig) {
	const { name, config } = getColumnNameAndConfig<ClickHouseDateTimeConfig>(a, b);
	return new ClickHouseDateTimeBuilder(
		name,
		'ClickHouseDateTime',
		undefined,
		config?.timezone,
		config?.mode ?? 'date',
	);
}

/**
 * `DateTime64(precision, [timezone])` — a sub-second-resolution timestamp.
 *
 * Defaults to millisecond precision, matching what a JavaScript `Date` can hold.
 */
export function dateTime64(): ClickHouseDateTimeBuilderInitial<'', 'ClickHouseDateTime64', 'date'>;
export function dateTime64<TMode extends ClickHouseDateMode = 'date'>(
	config?: ClickHouseDateTime64Config<TMode>,
): ClickHouseDateTimeBuilderInitial<'', 'ClickHouseDateTime64', TMode>;
export function dateTime64<TName extends string, TMode extends ClickHouseDateMode = 'date'>(
	name: TName,
	config?: ClickHouseDateTime64Config<TMode>,
): ClickHouseDateTimeBuilderInitial<TName, 'ClickHouseDateTime64', TMode>;
export function dateTime64(a?: string | ClickHouseDateTime64Config, b?: ClickHouseDateTime64Config) {
	const { name, config } = getColumnNameAndConfig<ClickHouseDateTime64Config>(a, b);
	return new ClickHouseDateTimeBuilder(
		name,
		'ClickHouseDateTime64',
		config?.precision ?? 3,
		config?.timezone,
		config?.mode ?? 'date',
	);
}
