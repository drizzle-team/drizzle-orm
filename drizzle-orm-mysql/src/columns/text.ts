import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnWithMapper } from './common';

export class MySqlTextBuilder<
	TData extends string = string,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
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
	TData extends string,
> extends MySqlColumnWithMapper<
	TTableName,
	ColumnData<TData>,
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
	TData extends string = string,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
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
	TData extends string,
> extends MySqlColumnWithMapper<
	TTableName,
	ColumnData<TData>,
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
	TData extends string = string,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
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
	TData extends string,
> extends MySqlColumnWithMapper<
	TTableName,
	ColumnData<TData>,
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
	TData extends string = string,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
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
	TData extends string,
> extends MySqlColumnWithMapper<
	TTableName,
	ColumnData<TData>,
	ColumnDriverParam<string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlLongText';

	getSQLType(): string {
		return 'longtext';
	}
}

export function text<T extends string = string>(name: string) {
	return new MySqlTextBuilder<T>(name);
}

export function tinytext<T extends string = string>(name: string) {
	return new MySqlTinyTextBuilder<T>(name);
}

export function mediumtext<T extends string = string>(name: string) {
	return new MySqlMediumTextBuilder<T>(name);
}

export function longtext<T extends string = string>(name: string) {
	return new MySqlLongTextBuilder<T>(name);
}
