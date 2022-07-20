import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgSmallIntBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<ColumnData<number>, ColumnDriverParam<number | string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgSmallInt<TTableName, TNotNull, THasDefault> {
		return new PgSmallInt<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class PgSmallInt<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, ColumnData<number>, ColumnDriverParam<number | string>, TNotNull, THasDefault> {
	protected brand!: 'PgSmallInt';

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
	return new PgSmallIntBuilder(name);
}
