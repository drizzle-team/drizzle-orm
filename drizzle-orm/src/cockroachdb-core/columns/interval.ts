import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';
import type { Precision } from './timestamp.ts';

export type CockroachDbIntervalBuilderInitial<TName extends string> = CockroachDbIntervalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachDbInterval';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbIntervalBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachDbInterval'>>
	extends CockroachDbColumnWithArrayBuilder<T, { intervalConfig: IntervalConfig }>
{
	static override readonly [entityKind]: string = 'CockroachDbIntervalBuilder';

	constructor(
		name: T['name'],
		intervalConfig: IntervalConfig,
	) {
		super(name, 'string', 'CockroachDbInterval');
		this.config.intervalConfig = intervalConfig;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbInterval<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbInterval<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbInterval<T extends ColumnBaseConfig<'string', 'CockroachDbInterval'>>
	extends CockroachDbColumn<T, { intervalConfig: IntervalConfig }>
{
	static override readonly [entityKind]: string = 'CockroachDbInterval';

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

export function interval(): CockroachDbIntervalBuilderInitial<''>;
export function interval(
	config?: IntervalConfig,
): CockroachDbIntervalBuilderInitial<''>;
export function interval<TName extends string>(
	name: TName,
	config?: IntervalConfig,
): CockroachDbIntervalBuilderInitial<TName>;
export function interval(a?: string | IntervalConfig, b: IntervalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<IntervalConfig>(a, b);
	return new CockroachDbIntervalBuilder(name, config);
}
