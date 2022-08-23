import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnWithMapper } from './common';

export class MySqlTextBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlText<TTableName, TNotNull, THasDefault, TData> {
		return new MySqlText<TTableName, TNotNull, THasDefault, TData>(table, this);
	}
}

export class MySqlText<
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
	protected brand!: 'MySqlText';

	getSQLType(): string {
		return 'text';
	}
}

export class MySqlTinyTextBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlTinyText<TTableName, TNotNull, THasDefault, TData> {
		return new MySqlTinyText<TTableName, TNotNull, THasDefault, TData>(table, this);
	}
}

export class MySqlTinyText<
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
	protected brand!: 'MySqlTinyText';

	getSQLType(): string {
		return 'tinytext';
	}
}

export class MySqlMediumTextBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlMediumText<TTableName, TNotNull, THasDefault, TData> {
		return new MySqlMediumText<TTableName, TNotNull, THasDefault, TData>(table, this);
	}
}

export class MySqlMediumText<
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
	protected brand!: 'MySqlMediumText';

	getSQLType(): string {
		return 'mediumtext';
	}
}

export class MySqlLongTextBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlLongText<TTableName, TNotNull, THasDefault, TData> {
		return new MySqlLongText<TTableName, TNotNull, THasDefault, TData>(table, this);
	}
}

export class MySqlLongText<
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
	protected brand!: 'MySqlLongText';

	getSQLType(): string {
		return 'longtext';
	}
}

export function text(name: string): MySqlTextBuilder;
export function text<T extends string = string>(name: string): MySqlTextBuilder<ColumnData<T>>;
export function text(name: string) {
	return new MySqlTextBuilder(name);
}

export function tinytext(name: string): MySqlTinyTextBuilder;
export function tinytext<T extends string = string>(name: string): MySqlTinyTextBuilder<ColumnData<T>>;
export function tinytext(name: string) {
	return new MySqlTinyTextBuilder(name);
}

export function mediumtext(name: string): MySqlMediumTextBuilder;
export function mediumtext<T extends string = string>(name: string): MySqlMediumTextBuilder<ColumnData<T>>;
export function mediumtext(name: string) {
	return new MySqlMediumTextBuilder(name);
}

export function longtext(name: string): MySqlLongTextBuilder;
export function longtext<T extends string = string>(name: string): MySqlLongTextBuilder<ColumnData<T>>;
export function longtext(name: string) {
	return new MySqlLongTextBuilder(name);
}
