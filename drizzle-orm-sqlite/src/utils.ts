import { Param, SQL } from 'drizzle-orm/sql';
import { SQLiteUpdateSet } from './queries';
import { AnySQLiteTable, GetTableConfig, SQLiteTable } from './table';

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

export function getTableChecks<TTable extends AnySQLiteTable>(table: TTable) {
	const checks = table[SQLiteTable.Symbol.Checks];
	const keys = Reflect.ownKeys(checks);
	return keys.map((key) => checks[key]!);
}

/** @internal */
export function mapUpdateSet(table: AnySQLiteTable, values: Record<string, unknown>): SQLiteUpdateSet {
	return Object.fromEntries<SQLiteUpdateSet[string]>(
		Object.entries(values).map(([key, value]) => {
			if (value instanceof SQL || value === null || value === undefined) {
				return [key, value];
			} else {
				return [key, new Param(value, table[SQLiteTable.Symbol.Columns][key])];
			}
		}),
	);
}

export type OnConflict = 'rollback' | 'abort' | 'fail' | 'ignore' | 'replace';
