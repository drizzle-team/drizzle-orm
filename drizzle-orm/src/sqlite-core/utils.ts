import { AnySQLiteTable, SQLiteTable } from '~/sqlite-core/table';

export function getTableColumns<TTable extends AnySQLiteTable>(table: TTable) {
	const columns = table[SQLiteTable.Symbol.Columns];
	const keys = Reflect.ownKeys(columns);
	return keys.map((key) => columns[key]!);
}

export function getTableIndexes<TTable extends AnySQLiteTable>(table: TTable) {
	const indexes = table[SQLiteTable.Symbol.Indexes];
	const keys = Reflect.ownKeys(indexes);
	return keys.map((key) => indexes[key]!);
}

export function getTableForeignKeys<TTable extends AnySQLiteTable>(table: TTable) {
	const foreignKeys = table[SQLiteTable.Symbol.ForeignKeys];
	const keys = Reflect.ownKeys(foreignKeys);
	return keys.map((key) => foreignKeys[key]!);
}

export function getTableCompositePrimaryKeys<TTable extends AnySQLiteTable>(table: TTable) {
	const primaryKeys = table[SQLiteTable.Symbol.PrimaryKeys];
	const keys = Reflect.ownKeys(primaryKeys);
	return keys.map((key) => primaryKeys[key]!);
}

export function getTableChecks<TTable extends AnySQLiteTable>(table: TTable) {
	const checks = table[SQLiteTable.Symbol.Checks];
	const keys = Reflect.ownKeys(checks);
	return keys.map((key) => checks[key]!);
}

export type OnConflict = 'rollback' | 'abort' | 'fail' | 'ignore' | 'replace';
