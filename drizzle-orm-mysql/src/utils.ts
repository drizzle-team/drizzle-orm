import { AnyMySqlTable, MySqlTable } from './table';
import { SelectFields, SelectFieldsOrdered } from '~/operations';
import { Param, SQL, SQLResponse } from 'drizzle-orm/sql';
import { MySqlUpdateSet } from './queries/update';
import { MySqlColumn } from './columns/common';
import { Table } from 'drizzle-orm/table';

/** @internal */
export const tableIndexes = Symbol('tableIndexes');

/** @internal */
export const tableForeignKeys = Symbol('tableForeignKeys');

/** @internal */
export const tableChecks = Symbol('tableChecks');

export function getTableColumns<TTable extends AnyMySqlTable>(table: TTable) {
	const columns = table[MySqlTable.Symbol.Columns];
	const keys = Reflect.ownKeys(columns);
	return keys.map((key) => columns[key]!);
}

export function getTableIndexes<TTable extends AnyMySqlTable>(table: TTable) {
	const indexes = table[MySqlTable.Symbol.Indexes];
	const keys = Reflect.ownKeys(indexes);
	return keys.map((key) => indexes[key]!);
}

export function getTableForeignKeys<TTable extends AnyMySqlTable>(table: TTable) {
	const foreignKeys = table[MySqlTable.Symbol.ForeignKeys];
	const keys = Reflect.ownKeys(foreignKeys);
	return keys.map((key) => foreignKeys[key]!);
}

export function getTableChecks<TTable extends AnyMySqlTable>(table: TTable) {
	const checks = table[MySqlTable.Symbol.Checks];
	const keys = Reflect.ownKeys(checks);
	return keys.map((key) => checks[key]!);
}

/** @internal */
export function mapUpdateSet(table: AnyMySqlTable, values: Record<string, unknown>): MySqlUpdateSet {
	return Object.fromEntries<MySqlUpdateSet[string]>(
		Object.entries(values).map(([key, value]) => {
			if (value instanceof SQL || value === null || value === undefined) {
				return [key, value];
			} else {
				return [key, new Param(value, table[MySqlTable.Symbol.Columns][key])];
			}
		}),
	);
}

export type Assume<T, U> = T extends U ? T : U;

export function orderSelectedFields(fields: SelectFields, pathPrefix?: string[]): SelectFieldsOrdered {
	return Object.entries(fields).reduce<SelectFieldsOrdered>((result, [name, field]) => {
		if (typeof name !== 'string') {
			return result;
		}

		const newPath = pathPrefix ? [...pathPrefix, name] : [name];
		if (
			field instanceof MySqlColumn
			|| field instanceof SQL
			|| field instanceof SQLResponse
		) {
			result.push({ path: newPath, field });
		} else if (field instanceof MySqlTable) {
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
