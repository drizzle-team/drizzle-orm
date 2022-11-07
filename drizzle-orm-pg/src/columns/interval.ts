import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';
import { Precision } from './timestamp';

export class PgIntervalBuilder<TData extends string = string>
	extends PgColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: string }>>
{
	constructor(
		name: string,
		/** @internal */ readonly intervalConfig: IntervalConfig,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgInterval<TTableName, TData> {
		return new PgInterval(table, this);
	}
}

export class PgInterval<TTableName extends string, TData extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgTime';

	readonly config: IntervalConfig;

	constructor(table: AnyPgTable<{ name: TTableName }>, builder: PgIntervalBuilder<TData>) {
		super(table, builder);
		this.config = builder.intervalConfig;
	}

	getSQLType(): string {
		const fields = this.config.fields ? ` ${this.config.fields}` : '';
		const precision = this.config.precision ? ` (${this.config.precision})` : '';
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

export function interval<T extends string = string>(
	name: string,
	config: IntervalConfig = {},
) {
	return new PgIntervalBuilder<T>(name, config);
}
