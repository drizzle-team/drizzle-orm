import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';
import type { Precision } from './timestamp.ts';

export class CockroachIntervalBuilder extends CockroachColumnWithArrayBuilder<{
	dataType: 'string interval';
	data: string;
	driverParam: string;
}, { intervalConfig: IntervalConfig }> {
	static override readonly [entityKind]: string = 'CockroachIntervalBuilder';

	constructor(
		name: string,
		intervalConfig: IntervalConfig,
	) {
		super(name, 'string interval', 'CockroachInterval');
		this.config.intervalConfig = intervalConfig;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachInterval(
			table,
			this.config,
		);
	}
}

export class CockroachInterval<T extends ColumnBaseConfig<'string interval'>>
	extends CockroachColumn<T, { intervalConfig: IntervalConfig }>
{
	static override readonly [entityKind]: string = 'CockroachInterval';

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

export function interval(
	config?: IntervalConfig,
): CockroachIntervalBuilder;
export function interval(
	name: string,
	config?: IntervalConfig,
): CockroachIntervalBuilder;
export function interval(a?: string | IntervalConfig, b: IntervalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<IntervalConfig>(a, b);
	return new CockroachIntervalBuilder(name, config);
}
