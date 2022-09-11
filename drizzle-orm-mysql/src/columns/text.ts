import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export type MySqlTextColumnType = 'tinytext' | 'text' | 'mediumtext' | 'longtext';

export class MySqlTextBuilder<
	TTextType extends MySqlTextColumnType = 'text',
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	constructor(
		name: string,
		/** @internal */ readonly textType: TTextType,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlText<TTextType, TTableName, TNotNull, THasDefault, TData> {
		return new MySqlText<TTextType, TTableName, TNotNull, THasDefault, TData>(table, this);
	}
}

export class MySqlText<
	TTextType extends MySqlTextColumnType,
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
	TData extends ColumnData<string>,
> extends MySqlColumn<
	TTableName,
	TData,
	ColumnDriverParam<string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlText';
	private textType: TTextType;

	constructor(table: AnyMySqlTable<TTableName>, builder: MySqlTextBuilder<TTextType, TData, TNotNull, THasDefault>) {
		super(table, builder);
		this.textType = builder.textType;
	}

	getSQLType(): string {
		return this.textType;
	}
}

export function text<T extends string = string>(name: string): MySqlTextBuilder<'text', ColumnData<T>> {
	return new MySqlTextBuilder(name, 'text');
}

export function tinytext<T extends string = string>(name: string): MySqlTextBuilder<'tinytext', ColumnData<T>> {
	return new MySqlTextBuilder(name, 'tinytext');
}

export function mediumtext<T extends string = string>(name: string): MySqlTextBuilder<'mediumtext', ColumnData<T>> {
	return new MySqlTextBuilder(name, 'mediumtext');
}

export function longtext<T extends string = string>(name: string): MySqlTextBuilder<'longtext', ColumnData<T>> {
	return new MySqlTextBuilder(name, 'longtext');
}
