import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlIntegerBuilder<
	TNotNull extends boolean = false,
	THasDefault extends boolean = false,
> extends MySqlColumnBuilderWithAutoIncrement<
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<TTableName>,
	): MySqlInteger<TTableName, TNotNull, THasDefault> {
		return new MySqlInteger<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlInteger<
	TTableName extends string,
	TNotNull extends boolean,
	THasDefault extends boolean,
> extends MySqlColumnWithAutoIncrement<
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

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return parseInt(value);
		}
		return value;
	}
}

export function int(name: string) {
	return new MySqlIntegerBuilder(name);
}
