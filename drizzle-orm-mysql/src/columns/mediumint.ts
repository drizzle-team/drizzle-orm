import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnWithMapper } from './common';

export class MySqlMediumIntBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<number>, ColumnDriverParam<number | string>, TNotNull, THasDefault> {
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
> extends MySqlColumnWithMapper<
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

	override mapFromDriverValue = (value: ColumnDriverParam<number | string>): ColumnData<number> => {
		if (typeof value === 'string') {
			return parseInt(value) as ColumnData<number>;
		}
		return value as ColumnData<any>;
	};
}

export function mediumint(name: string) {
	return new MySqlMediumIntBuilder(name);
}
