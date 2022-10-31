import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnySQLiteTable } from '~/table';
import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export class SQLiteNumericBuilder
	extends SQLiteColumnBuilder<ColumnBuilderConfig<{ data: string; driverParam: string }>>
{
	constructor(name: string) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(table: AnySQLiteTable<{ name: TTableName }>): SQLiteNumeric<TTableName> {
		return new SQLiteNumeric(table, this);
	}
}

export class SQLiteNumeric<TTableName extends string>
	extends SQLiteColumn<ColumnConfig<{ tableName: TTableName; data: string; driverParam: string }>>
{
	protected override $sqliteColumnBrand!: 'SQLiteNumeric';

	getSQLType(): string {
		return 'numeric';
	}
}

export function numeric(name: string) {
	return new SQLiteNumericBuilder(name);
}
