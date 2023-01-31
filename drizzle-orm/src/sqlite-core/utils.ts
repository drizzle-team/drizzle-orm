import { Param, SQL, SQLResponse } from '~/sql';
import { SQLiteColumn } from '~/sqlite-core/columns';
import { SelectFieldsOrdered, SQLiteSelectFields } from '~/sqlite-core/operations';
import { SQLiteUpdateSet } from '~/sqlite-core/query-builders';
import { AnySQLiteTable, SQLiteTable } from '~/sqlite-core/table';
import { Table } from '~/table';

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

export function orderSelectedFields(fields: SQLiteSelectFields, pathPrefix?: string[]): SelectFieldsOrdered {
	return Object.entries(fields).reduce<SelectFieldsOrdered>((result, [name, field]) => {
		if (typeof name !== 'string') {
			return result;
		}

		const newPath = pathPrefix ? [...pathPrefix, name] : [name];
		if (
			field instanceof SQLiteColumn
			|| field instanceof SQL
			|| field instanceof SQLResponse
		) {
			result.push({ path: newPath, field });
		} else if (field instanceof SQLiteTable) {
			result.push(
				...orderSelectedFields(field[Table.Symbol.Columns], newPath),
			);
		} else {
			result.push(
				...orderSelectedFields(field, newPath),
			);
		}
		return result;
	}, []);
}
