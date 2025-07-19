import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';
import type { Precision } from './timestamp.ts';

export type PgIntervalBuilderInitial<TName extends string> = PgIntervalBuilder<{
	name: TName;
	dataType: 'string';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgIntervalBuilder<T extends ColumnBuilderBaseConfig<'string'>>
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
	override build(table: PgTable) {
		return new PgInterval(table, this.config as any);
	}
}

export class PgInterval<T extends ColumnBaseConfig<'string'>>
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

export interface IntervalConfig {
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
export function interval(
	config?: IntervalConfig,
): PgIntervalBuilderInitial<''>;
export function interval<TName extends string>(
	name: TName,
	config?: IntervalConfig,
): PgIntervalBuilderInitial<TName>;
export function interval(a?: string | IntervalConfig, b: IntervalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<IntervalConfig>(a, b);
	return new PgIntervalBuilder(name, config);
}
