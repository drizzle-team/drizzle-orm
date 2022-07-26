import { AnyTable } from 'drizzle-orm';
import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnWithMapper } from './common';

export class MySqlCharBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<string>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */ length: number | undefined;

	constructor(name: string, length?: number) {
		super(name);
		this.length = length;
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlChar<TTableName, TNotNull, THasDefault> {
		return new MySqlChar<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlChar<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnWithMapper<
	TTableName,
	ColumnData<string>,
	ColumnDriverParam<string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlChar';

	length: number | undefined;

	constructor(table: AnyMySqlTable<TTableName>, builder: MySqlCharBuilder<TNotNull, THasDefault>) {
		super(table, builder);
		this.length = builder.length;
	}

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `char(${this.length})` : `char`;
	}
}

export function char(name: string, length?: number) {
	return new MySqlCharBuilder(name, length);
}
