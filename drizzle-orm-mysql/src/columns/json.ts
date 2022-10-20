import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlJsonBuilder<
	TData,
	TNotNull extends boolean = false,
	THasDefault extends boolean = false,
> extends MySqlColumnBuilder<ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	constructor(name: string) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<TTableName>,
	): MySqlJson<TTableName, TNotNull, THasDefault, TData> {
		return new MySqlJson(table, this);
	}
}

export class MySqlJson<
	TTableName extends string,
	TNotNull extends boolean,
	THasDefault extends boolean,
	TData,
> extends MySqlColumn<TTableName, ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'MySqlJson';

	constructor(table: AnyMySqlTable<TTableName>, builder: MySqlJsonBuilder<TData, TNotNull, THasDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'json';
	}

	override mapToDriverValue(value: TData): string {
		return JSON.stringify(value);
	}
}

export function json<TData>(name: string) {
	return new MySqlJsonBuilder<TData>(name);
}
