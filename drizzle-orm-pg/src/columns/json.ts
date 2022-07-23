import { AnyTable } from 'drizzle-orm';
import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { PgColumnBuilder, PgColumnWithMapper } from './common';

export class PgJsonBuilder<
	TData,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	constructor(name: string) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyTable<TTableName>,
	): PgJson<TTableName, TNotNull, THasDefault, TData> {
		return new PgJson(table, this);
	}
}

export class PgJson<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
	TData,
> extends PgColumnWithMapper<TTableName, ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'PgJson';

	constructor(table: AnyTable<TTableName>, builder: PgJsonBuilder<TData, TNotNull, THasDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'json';
	}

	override mapFromDriverValue = (value: ColumnDriverParam<string>): ColumnData<TData> => {
		return value as TData as ColumnData<TData>;
	};
}

export function json<TData>(name: string) {
	return new PgJsonBuilder<TData>(name);
}
