import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnWithMapper } from './common';

export class MySqlTinyIntBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<number>, ColumnDriverParam<number | string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlTinyInt<TTableName, TNotNull, THasDefault> {
		return new MySqlTinyInt<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlTinyInt<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnWithMapper<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlTinyInt';

	getSQLType(): string {
		return 'tinyint';
	}

	override mapFromDriverValue = (value: ColumnDriverParam<number | string>): ColumnData<number> => {
		if (typeof value === 'string') {
			return parseInt(value) as ColumnData<number>;
		}
		return value as ColumnData<any>;
	};
}

export function tinyint(name: string) {
	return new MySqlTinyIntBuilder(name);
}
