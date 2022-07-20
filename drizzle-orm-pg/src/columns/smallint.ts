import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgSmallIntegerBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<ColumnData<number>, ColumnDriverParam<number | string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgSmallInteger<TTableName, TNotNull, THasDefault> {
		return new PgSmallInteger<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class PgSmallInteger<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, ColumnData<number>, ColumnDriverParam<number | string>, TNotNull, THasDefault> {
	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue(value: ColumnDriverParam<number | string>): ColumnData<number> {
		if (typeof value === 'string') {
			return parseInt(value) as ColumnData<number>;
		}
		return value as ColumnData<any>;
	}
}

export function smallint(name: string) {
	return new PgSmallIntegerBuilder(name);
}
