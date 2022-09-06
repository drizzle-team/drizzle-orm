import {
	ColumnData,
	ColumnDriverParam,
	ColumnHasDefault,
	ColumnNotNull,
	TableName,
	Unwrap,
} from 'drizzle-orm/branded-types';

import { AnyPgTable } from '~/table';
import { PgColumnWithMapper } from './common';
import { PgDateColumnBaseBuilder } from './date.common';
import { PrecisionLimit } from './timestamp';

export class PgTimeBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgDateColumnBaseBuilder<ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	constructor(
		name: string,
		public readonly withTimezone: boolean,
		public readonly precision: number | undefined,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgTime<TTableName, TData, TNotNull, THasDefault> {
		return new PgTime(table, this);
	}
}

export class PgTime<
	TTableName extends TableName,
	TData extends ColumnData<string>,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumnWithMapper<TTableName, ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'PgTime';

	public readonly withTimezone: boolean;
	public readonly precision: number | undefined;

	constructor(table: AnyPgTable<TTableName>, builder: PgTimeBuilder<TData, TNotNull, THasDefault>) {
		super(table, builder);
		this.withTimezone = builder.withTimezone;
		this.precision = builder.precision;
	}

	getSQLType(): string {
		const precision = typeof this.precision !== 'undefined' ? ` (${this.precision})` : '';
		return `time${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue = (value: ColumnDriverParam<string>): ColumnData<TData> => {
		return value as Unwrap<TData> as ColumnData<TData>;
	};
}

export interface TimeConfig {
	precision?: PrecisionLimit;
	withTimezone?: boolean;
}

export function time(name: string, config?: TimeConfig) {
	return new PgTimeBuilder(name, config?.withTimezone ?? false, config?.precision);
}
