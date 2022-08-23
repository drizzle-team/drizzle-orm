import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import {
	MySqlColumnBuilder,
	MySqlColumnBuilderWithAutoincrement,
	MySqlColumnWithAutoincrement,
	MySqlColumnWithMapper,
} from './common';

export class MySqlIntegerBuilder<
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
	): MySqlInteger<TTableName, TNotNull, THasDefault> {
		return new MySqlInteger<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlInteger<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnWithAutoincrement<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlInteger';

	getSQLType(): string {
		return 'int';
	}

	override mapFromDriverValue = (value: ColumnDriverParam<number | string>): ColumnData<number> => {
		if (typeof value === 'string') {
			return parseInt(value) as ColumnData<number>;
		}
		return value as ColumnData<any>;
	};
}

export function int(name: string) {
	return new MySqlIntegerBuilder(name);
}
