import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyPgTable } from '~/pg-core/table';
import { type Assume } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';
import type { Precision } from './timestamp';

export interface PgIntervalBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgIntervalBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgIntervalHKT;
}

export interface PgIntervalHKT extends ColumnHKTBase {
	_type: PgInterval<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgIntervalBuilderInitial<TName extends string> = PgIntervalBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgIntervalBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<
	PgIntervalBuilderHKT,
	T,
	{ intervalConfig: IntervalConfig }
> {
	static readonly [entityKind]: string = 'PgIntervalBuilder';

	constructor(
		name: T['name'],
		intervalConfig: IntervalConfig,
	) {
		super(name);
		this.config.intervalConfig = intervalConfig;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgInterval<MakeColumnConfig<T, TTableName>> {
		return new PgInterval<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgInterval<T extends ColumnBaseConfig>
	extends PgColumn<PgIntervalHKT, T, { intervalConfig: IntervalConfig }>
{
	static readonly [entityKind]: string = 'PgInterval';

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

export function interval<TName extends string>(
	name: TName,
	config: IntervalConfig = {},
): PgIntervalBuilderInitial<TName> {
	return new PgIntervalBuilder(name, config);
}
