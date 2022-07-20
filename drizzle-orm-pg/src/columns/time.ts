import { AnyTable } from 'drizzle-orm';
import {
	ColumnData,
	ColumnDriverParam,
	ColumnHasDefault,
	ColumnNotNull,
	TableName,
	Unwrap,
} from 'drizzle-orm/branded-types';

import { PgColumn, PgColumnBuilder } from './common';

export class PgTimeBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyTable<TTableName>,
	): PgTime<TTableName, TData, TNotNull, THasDefault> {
		return new PgTime(table, this);
	}
}

export class PgTime<
	TTableName extends TableName,
	TData extends ColumnData<string>,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'PgTime';

	constructor(table: AnyTable<TTableName>, builder: PgTimeBuilder<TData, TNotNull, THasDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'time';
	}

	override mapFromDriverValue(value: ColumnDriverParam<string>): ColumnData<TData> {
		return value as Unwrap<TData> as ColumnData<TData>;
	}
}

export function time<T extends string = string>(name: string) {
	return new PgTimeBuilder<ColumnData<T>>(name);
}
