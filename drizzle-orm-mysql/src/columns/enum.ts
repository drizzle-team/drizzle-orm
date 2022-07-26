import { AnyTable } from 'drizzle-orm';
import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnWithMapper } from './common';

export class MySqlEnumBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */ values: string[];

	constructor(name: string, values: string[]) {
		super(name);
		this.values = values;
	}
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlEnumColumn<TTableName, TData, TNotNull, THasDefault> {
		return new MySqlEnumColumn(table, this, this.values);
	}
}

export class MySqlEnumColumn<
	TTableName extends TableName,
	TData extends ColumnData<string>,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnWithMapper<TTableName, TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'MySqlEnumColumn';

	values: string[];

	constructor(
		table: AnyMySqlTable<TTableName>,
		builder: MySqlEnumBuilder<TData, TNotNull, THasDefault>,
		values: string[],
	) {
		super(table, builder);
		this.values = values;
	}

	getSQLType(): string {
		return `(${this.values.map((it) => `'${it}'`).join(',')})`;
	}
}

export function mysqlEnum<T extends string = string>(name: string, values: T[]) {
	return new MySqlEnumBuilder<ColumnData<T>>(name, values);
}
