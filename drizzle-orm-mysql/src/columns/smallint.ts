import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnBuilderWithAutoincrement, MySqlColumnWithMapper } from './common';

export class MySqlSmallIntBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilderWithAutoincrement<
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlSmallInt<TTableName, TNotNull, THasDefault> {
		return new MySqlSmallInt<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlSmallInt<
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
	protected brand!: 'MySqlSmallInt';

	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue = (value: ColumnDriverParam<number | string>): ColumnData<number> => {
		if (typeof value === 'string') {
			return parseInt(value) as ColumnData<number>;
		}
		return value as ColumnData<any>;
	};
}

export function smallint(name: string) {
	return new MySqlSmallIntBuilder(name);
}
