import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';
import type { Precision } from './timestamp.ts';

let PostgresInterval: typeof import('postgres-interval') | undefined;
import('postgres-interval')
	.then((mod) => {
		PostgresInterval = mod.default;
	})
	.catch(() => {});

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

	override mapFromDriverValue(value: string): Temporal.Duration {
		try {
			// intervalStyle=iso_8601
			return Temporal.Duration.from(value);
		} catch {
			if (PostgresInterval) {
				try {
					// intervalStyle=postgres
					const durationLike = PostgresInterval(value);
					return Temporal.Duration.from(durationLike);
				} catch {
					throw new DrizzleError({
						message: `Failed to parse PostgreSQL interval from string "${value}". `
							+ `Is \`intervalstyle\` set to other than \`postgres\` or \`iso_8601\`?`,
					});
				}
			} else {
				throw new DrizzleError({
					message: `Failed to parse PostgreSQL interval from string "${value}". `
						+ `Is \`intervalstyle\` set to other than \`iso_8601\`?`
						+ `To parse \`postgres\` style (the default) intervals, the \`postgres-interval\` package is required.`,
				});
			}
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
