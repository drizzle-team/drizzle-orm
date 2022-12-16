import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';

import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlJsonBuilder<
	TData,
> extends MySqlColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: number | string }>> {
	constructor(name: string) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlJson<TTableName, TData> {
		return new MySqlJson(table, this);
	}
}

export class MySqlJson<
	TTableName extends string,
	TData,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: TData;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlJson';

	constructor(table: AnyMySqlTable<{ name: TTableName }>, builder: MySqlJsonBuilder<TData>) {
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
