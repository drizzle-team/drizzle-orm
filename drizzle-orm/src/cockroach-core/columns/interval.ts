import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';
import type { Precision } from './timestamp.ts';

export type CockroachIntervalBuilderInitial<TName extends string> = CockroachIntervalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachInterval';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachIntervalBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachInterval'>>
	extends CockroachColumnWithArrayBuilder<T, { intervalConfig: IntervalConfig }>
{
	static override readonly [entityKind]: string = 'CockroachIntervalBuilder';

	constructor(
		name: T['name'],
		intervalConfig: IntervalConfig,
	) {
		super(name, 'string', 'CockroachInterval');
		this.config.intervalConfig = intervalConfig;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachInterval<MakeColumnConfig<T, TTableName>> {
		return new CockroachInterval<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachInterval<T extends ColumnBaseConfig<'string', 'CockroachInterval'>>
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

export function interval(): CockroachIntervalBuilderInitial<''>;
export function interval(
	config?: IntervalConfig,
): CockroachIntervalBuilderInitial<''>;
export function interval<TName extends string>(
	name: TName,
	config?: IntervalConfig,
): CockroachIntervalBuilderInitial<TName>;
export function interval(a?: string | IntervalConfig, b: IntervalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<IntervalConfig>(a, b);
	return new CockroachIntervalBuilder(name, config);
}
