import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnySQLiteTable } from '~/table';

import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export class SQLiteTextBuilder<TData extends string = string>
	extends SQLiteColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: string }>>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteText<TTableName, TData> {
		return new SQLiteText(table, this.config);
	}
}

export class SQLiteText<TTableName extends string, TData extends string>
	extends SQLiteColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $sqliteColumnBrand!: 'SQLiteText';

	getSQLType(): string {
		return 'text';
	}
}

export function text<T extends string = string>(name: string) {
	return new SQLiteTextBuilder<T>(name);
}
