import { AnyTable } from 'drizzle-orm';
import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { PgColumn } from './common';
import { PgDateColumnBaseBuilder } from './date-common';

export class PgDateBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgDateColumnBaseBuilder<ColumnData<Date>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyTable<TTableName>,
	): PgDate<TTableName, TNotNull, THasDefault> {
		return new PgDate(table, this);
	}
}

export class PgDate<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, ColumnData<Date>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'PgDate';

	constructor(table: AnyTable<TTableName>, builder: PgDateBuilder<TNotNull, THasDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'date';
	}

	override mapFromDriverValue(value: ColumnDriverParam<string>): ColumnData<Date> {
		return new Date(value) as ColumnData<Date>;
	}

	override mapToDriverValue(value: ColumnData<Date>): ColumnDriverParam<string> {
		return value.toISOString() as ColumnDriverParam<string>;
	}
}

export class PgDateStringBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgDateColumnBaseBuilder<ColumnData<string>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyTable<TTableName>,
	): PgDateString<TTableName, TNotNull, THasDefault> {
		return new PgDateString(table, this);
	}
}

export class PgDateString<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, ColumnData<string>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	brand!: 'PgDateString';

	constructor(table: AnyTable<TTableName>, builder: PgDateStringBuilder<TNotNull, THasDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'date';
	}
}

export function date(name: string, mode: 'string'): PgDateStringBuilder;
export function date(name: string, mode?: 'date'): PgDateBuilder;
export function date(name: string, mode: 'date' | 'string' = 'date') {
	if (mode === 'date') {
		return new PgDateBuilder(name);
	}
	return new PgDateStringBuilder(name);
}

// const dateS = date('name').notNull();
// const dateD = date('name', 'date').notNull();
