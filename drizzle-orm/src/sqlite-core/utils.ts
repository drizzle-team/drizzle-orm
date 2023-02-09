import { Check } from './checks';
import { AnySQLiteColumn } from './columns';
import { ForeignKey } from './foreign-keys';
import { Index } from './indexes';
import { PrimaryKey } from './primary-keys';
import { AnySQLiteTable, GetTableConfig, SQLiteTable } from './table';

export interface GetTableColumnsConfig<TFormat extends 'object' | 'array' = 'object' | 'array'> {
	format: TFormat;
}

export function getTableColumns<TTable extends AnySQLiteTable>(
	table: TTable,
	config: GetTableColumnsConfig<'object'>,
): Record<string, AnySQLiteColumn<{ tableName: GetTableConfig<TTable, 'name'> }>>;
export function getTableColumns<TTable extends AnySQLiteTable>(
	table: TTable,
	config?: GetTableColumnsConfig<'array'>,
): AnySQLiteColumn<{ tableName: GetTableConfig<TTable, 'name'> }>[];
export function getTableColumns<TTable extends AnySQLiteTable>(
	table: TTable,
	config?: GetTableColumnsConfig,
): Record<string, AnySQLiteColumn> | AnySQLiteColumn[] {
	const columns = table[SQLiteTable.Symbol.Columns];
	if (config?.format === 'object') {
		return Object.assign({}, columns);
	}
	return Object.values(columns);
}

export function getTableIndexes<TTable extends AnySQLiteTable>(table: TTable): Index[] {
	const indexes = table[SQLiteTable.Symbol.Indexes];
	const keys = Reflect.ownKeys(indexes);
	return keys.map((key) => indexes[key]!);
}

export function getTableForeignKeys<TTable extends AnySQLiteTable>(table: TTable): ForeignKey[] {
	const foreignKeys = table[SQLiteTable.Symbol.ForeignKeys];
	const keys = Reflect.ownKeys(foreignKeys);
	return keys.map((key) => foreignKeys[key]!);
}

export function getTableCompositePrimaryKeys<TTable extends AnySQLiteTable>(table: TTable): PrimaryKey[] {
	const primaryKeys = table[SQLiteTable.Symbol.PrimaryKeys];
	const keys = Reflect.ownKeys(primaryKeys);
	return keys.map((key) => primaryKeys[key]!);
}

export function getTableChecks<TTable extends AnySQLiteTable>(table: TTable): Check[] {
	const checks = table[SQLiteTable.Symbol.Checks];
	const keys = Reflect.ownKeys(checks);
	return keys.map((key) => checks[key]!);
}

export type OnConflict = 'rollback' | 'abort' | 'fail' | 'ignore' | 'replace';
