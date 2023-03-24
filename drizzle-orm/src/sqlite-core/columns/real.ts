import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnySQLiteTable } from '../table';
import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export class SQLiteRealBuilder extends SQLiteColumnBuilder<ColumnBuilderConfig<{ data: number; driverParam: number }>> {
	/** @internal */
	override build<TTableName extends string>(table: AnySQLiteTable<{ name: TTableName }>): SQLiteReal<TTableName> {
		return new SQLiteReal(table, this.config);
	}
}

export class SQLiteReal<TTableName extends string>
	extends SQLiteColumn<ColumnConfig<{ tableName: TTableName; data: number; driverParam: number }>>
{
	protected override $sqliteColumnBrand!: 'SQLiteInteger';

	getSQLType(): string {
		return 'real';
	}
}

export function real(name: string) {
	return new SQLiteRealBuilder(name);
}
