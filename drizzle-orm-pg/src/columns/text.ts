import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyPgTable } from '~/table';

import { PgColumn, PgColumnBuilder } from './common';

export class PgTextBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgText<TTableName, TNotNull, THasDefault, TData> {
		return new PgText(table, this);
	}
}

export class PgText<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
	TData extends ColumnData<string>,
> extends PgColumn<TTableName, TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'PgText';

	constructor(table: AnyPgTable<TTableName>, builder: PgTextBuilder<TData, TNotNull, THasDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'text';
	}
}

export function text<T extends string = string>(name: string): PgTextBuilder<ColumnData<T>> {
	return new PgTextBuilder<ColumnData<T>>(name);
}
