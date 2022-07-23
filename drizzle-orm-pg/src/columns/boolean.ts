import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnyPgTable } from '~/table';
import { PgColumnBuilder, PgColumnWithMapper } from './common';

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
	): PgBoolean<TTableName, TNotNull, THasDefault> {
		return new PgBoolean<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class PgBoolean<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumnWithMapper<TTableName, ColumnData<boolean>, ColumnDriverParam<boolean>, TNotNull, THasDefault> {
	protected brand!: 'PgBoolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(name: string) {
	return new PgBooleanBuilder(name);
}
