import { AnyTable } from 'drizzle-orm';
import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnWithMapper } from './common';

export class MySqlVarCharBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */ length: number | undefined;

	constructor(name: string, length?: number) {
		super(name);
		this.length = length;
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlVarChar<TTableName, TNotNull, THasDefault, TData> {
		return new MySqlVarChar<TTableName, TNotNull, THasDefault, TData>(table, this);
	}
}

export class MySqlVarChar<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
	TData extends ColumnData<string>,
> extends MySqlColumnWithMapper<
	TTableName,
	TData,
	ColumnDriverParam<string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlVarChar';

	length: number | undefined;

	constructor(table: AnyMySqlTable<TTableName>, builder: MySqlVarCharBuilder<TData, TNotNull, THasDefault>) {
		super(table, builder);
		this.length = builder.length;
	}

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `varchar(${this.length})` : `varchar`;
	}
}

export function varchar(name: string, length: number): MySqlVarCharBuilder;
export function varchar<T extends string = string>(name: string, length: number): MySqlVarCharBuilder<ColumnData<T>>;
export function varchar(name: string, length: number) {
	return new MySqlVarCharBuilder(name, length);
}
