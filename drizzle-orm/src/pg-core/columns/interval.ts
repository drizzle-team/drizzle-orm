import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';
import type { Precision } from './timestamp.ts';

export type PgIntervalBuilderInitial<TName extends string> = PgIntervalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgInterval';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgIntervalBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgInterval'>>
	extends PgColumnBuilder<T, { intervalConfig: IntervalConfig }>
{
	static override readonly [entityKind]: string = 'PgIntervalBuilder';

	constructor(
		name: T['name'],
		intervalConfig: IntervalConfig,
	) {
		super(name, 'string', 'PgInterval');
		this.config.intervalConfig = intervalConfig;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgInterval<MakeColumnConfig<T, TTableName>> {
		return new PgInterval<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgInterval<T extends ColumnBaseConfig<'string', 'PgInterval'>>
	extends PgColumn<T, { intervalConfig: IntervalConfig }>
{
	static override readonly [entityKind]: string = 'PgInterval';

	readonly fields: IntervalConfig['fields'] = this.config.intervalConfig.fields;
	readonly precision: IntervalConfig['precision'] = this.config.intervalConfig.precision;

	getSQLType(): string {
		const fields = this.fields ? ` ${this.fields}` : '';
		const precision = this.precision ? `(${this.precision})` : '';
		return `interval${fields}${precision}`;
	}
}

export type PgTemporalIntervalBuilderInitial<TName extends string> = PgTemporalIntervalBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'PgTemporalInterval';
	data: Temporal.Duration;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgTemporalIntervalBuilder<T extends ColumnBuilderBaseConfig<'date', 'PgTemporalInterval'>>
	extends PgColumnBuilder<T, { intervalConfig: IntervalConfig }>
{
	static override readonly [entityKind]: string = 'PgTemporalIntervalBuilder';

	constructor(
		name: T['name'],
		intervalConfig: IntervalConfig,
	) {
		super(name, 'date', 'PgTemporalInterval');
		this.config.intervalConfig = intervalConfig;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgTemporalInterval<MakeColumnConfig<T, TTableName>> {
		return new PgTemporalInterval<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgTemporalInterval<T extends ColumnBaseConfig<'date', 'PgTemporalInterval'>>
	extends PgColumn<T, { intervalConfig: IntervalConfig }>
{
	static override readonly [entityKind]: string = 'PgTemporalInterval';

	readonly fields: IntervalConfig['fields'] = this.config.intervalConfig.fields;
	readonly precision: IntervalConfig['precision'] = this.config.intervalConfig.precision;

	getSQLType(): string {
		const fields = this.fields ? ` ${this.fields}` : '';
		const precision = this.precision ? `(${this.precision})` : '';
		return `interval${fields}${precision}`;
	}

	/**
	 * Parses a PostgreSQL interval string into a `Temporal.Duration`.
	 *
	 * Only the `iso_8601` server `intervalstyle` is supported — the session must
	 * be configured with `set intervalstyle = 'iso_8601'` (or the equivalent
	 * connection setting). `Temporal.Duration.from` accepts the ISO 8601-2
	 * extensions Temporal uses, so values like `P3W1D` or `-P1M` round-trip fine
	 * even though strict ISO 8601-1 would reject them.
	 *
	 * The default `postgres` output (`"2 days 03:45:30"`), as well as
	 * `postgres_verbose` and `sql_standard`, are **not** supported and will
	 * throw. They require format-specific parsing that can't be done reliably
	 * without risking silent data corruption on ambiguous tokens.
	 *
	 * Why we don't fall back to the `postgres-interval` package:
	 * `postgres-interval` never throws — on input it can't tokenize it silently
	 * returns a zero-valued (or worse, *partially* populated) duration. That
	 * breaks two real server outputs:
	 *   - `postgres_verbose` (`@ 2 days 3 hours 45 mins 30 secs`) — it matches
	 *     `"mins"` against its `month` prefix and produces `months: 45`, losing
	 *     the actual minutes and fabricating a year-month component.
	 *   - `sql_standard` (`2 3:45:30`) — it drops the leading day count and
	 *     returns `{ hours: 3, minutes: 45, seconds: 30 }`, off by two days.
	 * Because the output is populated but wrong, we can't reliably detect the
	 * bad parse and fail loudly; the only safe answer is not to use the library.
	 *
	 * https://www.postgresql.org/docs/current/datatype-datetime.html#DATATYPE-INTERVAL-OUTPUT
	 */
	override mapFromDriverValue(value: string): Temporal.Duration {
		try {
			return Temporal.Duration.from(value);
		} catch {
			throw new DrizzleError({
				message: `Failed to parse PostgreSQL interval from string "${value}". `
					+ `Temporal interval columns require \`intervalstyle = 'iso_8601'\` on the session.`,
			});
		}
	}
}

export interface IntervalConfig<T extends 'string' | 'temporal' = 'string' | 'temporal'> {
	mode?: T;
	fields?:
		| 'year'
		| 'month'
		| 'day'
		| 'hour'
		| 'minute'
		| 'second'
		| 'year to month'
		| 'day to hour'
		| 'day to minute'
		| 'day to second'
		| 'hour to minute'
		| 'hour to second'
		| 'minute to second';
	precision?: Precision;
}

export function interval(): PgIntervalBuilderInitial<''>;
export function interval<TMode extends IntervalConfig['mode'] & {}>(
	config?: IntervalConfig<TMode>,
): Equal<TMode, 'temporal'> extends true ? PgTemporalIntervalBuilderInitial<''> : PgIntervalBuilderInitial<''>;
export function interval<TName extends string, TMode extends IntervalConfig['mode'] & {}>(
	name: TName,
	config?: IntervalConfig<TMode>,
): Equal<TMode, 'temporal'> extends true ? PgTemporalIntervalBuilderInitial<TName> : PgIntervalBuilderInitial<TName>;
export function interval(a?: string | IntervalConfig, b: IntervalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<IntervalConfig>(a, b);
	if (config.mode === 'temporal') {
		return new PgTemporalIntervalBuilder(name, config);
	}
	return new PgIntervalBuilder(name, config);
}
