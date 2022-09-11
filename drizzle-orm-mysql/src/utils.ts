import { tableColumns } from 'drizzle-orm/utils';
import { AnyMySqlTable } from './table';

/** @internal */
export const tableIndexes = Symbol('tableIndexes');

/** @internal */
export const tableForeignKeys = Symbol('tableForeignKeys');

/** @internal */
export const tableChecks = Symbol('tableChecks');

export function getTableColumns<TTable extends AnyMySqlTable>(table: TTable) {
	const keys = Reflect.ownKeys(table[tableColumns]);
	return keys.map((key) => table[tableColumns][key]!);
}

export function getTableIndexes<TTable extends AnyMySqlTable>(table: TTable) {
	const keys = Reflect.ownKeys(table[tableIndexes]);
	return keys.map((key) => table[tableIndexes][key]!);
}

export function getTableForeignKeys<TTable extends AnyMySqlTable>(table: TTable) {
	const keys = Reflect.ownKeys(table[tableForeignKeys]);
	return keys.map((key) => table[tableForeignKeys][key]!);
}

export function getTableChecks<TTable extends AnyMySqlTable>(table: TTable) {
	const keys = Reflect.ownKeys(table[tableChecks]);
	return keys.map((key) => table[tableChecks][key]!);
}
