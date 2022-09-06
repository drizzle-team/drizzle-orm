import {
	ColumnData,
	ColumnDriverParam,
	ColumnHasDefault,
	ColumnNotNull,
	TableName,
	Unwrap,
} from 'drizzle-orm/branded-types';

import { AnyPgTable } from '~/table';
import { PgColumnBuilder, PgColumnWithMapper } from './common';
import { PrecisionLimit } from './timestamp';

export class PgIntervalBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	constructor(name: string, public readonly config: IntervalConfig) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgInterval<TTableName, TData, TNotNull, THasDefault> {
		return new PgInterval(table, this);
	}
}

export class PgInterval<
	TTableName extends TableName,
	TData extends ColumnData<string>,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumnWithMapper<TTableName, ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'PgTime';

	public readonly config: IntervalConfig;

	constructor(table: AnyPgTable<TTableName>, builder: PgIntervalBuilder<TData, TNotNull, THasDefault>) {
		super(table, builder);
		this.config = builder.config;
	}

	getSQLType(): string {
		const fields = this.config.fields ? ` ${this.config.fields}` : '';
		const precision = this.config.precision ? ` (${this.config.precision})` : '';
		return `interval${fields}${precision}`;
	}

	override mapFromDriverValue = (value: ColumnDriverParam<string>): ColumnData<TData> => {
		return value as Unwrap<TData> as ColumnData<TData>;
	};
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
	precision?: PrecisionLimit;
}

export function interval<T extends string = string>(
	name: string,
	config: IntervalConfig = {},
) {
	return new PgIntervalBuilder<ColumnData<T>>(name, config);
}
