import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgBooleanBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<
	ColumnData<boolean>,
	ColumnDriverParam<boolean>,
	TNotNull,
	THasDefault
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgBooleanInteger<TTableName, TNotNull, THasDefault> {
		return new PgBooleanInteger<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class PgBooleanInteger<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, ColumnData<boolean>, ColumnDriverParam<boolean>, TNotNull, THasDefault> {
	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(name: string) {
	return new PgBooleanBuilder(name);
}
