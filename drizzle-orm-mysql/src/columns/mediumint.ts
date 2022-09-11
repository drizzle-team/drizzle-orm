import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlMediumIntBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilderWithAutoIncrement<
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlMediumInt<TTableName, TNotNull, THasDefault> {
		return new MySqlMediumInt<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlMediumInt<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnWithAutoIncrement<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlMediumInt';

	getSQLType(): string {
		return 'mediumint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return parseInt(value);
		}
		return value;
	}
}

export function mediumint(name: string) {
	return new MySqlMediumIntBuilder(name);
}
