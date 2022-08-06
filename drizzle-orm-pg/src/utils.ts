import { tableColumns } from 'drizzle-orm/utils';
import { AnyPgColumn } from './columns/common';

import { AnyPgTable, GetTableColumns, GetTableConflictConstraints } from './table';

/** @internal */
export const tableIndexes = Symbol('tableIndexes');

/** @internal */
export const tableForeignKeys = Symbol('tableForeignKeys');

/** @internal */
export const tableChecks = Symbol('tableChecks');

/** @internal */
export const tableConflictConstraints = Symbol('tableConflictConstraints');

export function getTableColumns<TTable extends AnyPgTable>(table: TTable) {
	const keys = Reflect.ownKeys(table[tableColumns]);
	return keys.map((key) => table[tableColumns][key]!);
}

export function getTableIndexes<TTable extends AnyPgTable>(table: TTable) {
	const keys = Reflect.ownKeys(table[tableIndexes]);
	return keys.map((key) => table[tableIndexes][key]!);
}

export function getTableForeignKeys<TTable extends AnyPgTable>(table: TTable) {
	const keys = Reflect.ownKeys(table[tableForeignKeys]);
	return keys.map((key) => table[tableForeignKeys][key]!);
}

export function getTableChecks<TTable extends AnyPgTable>(table: TTable) {
	const keys = Reflect.ownKeys(table[tableChecks]);
	return keys.map((key) => table[tableChecks][key]!);
}

export function getTableConflictConstraints<TTable extends AnyPgTable>(
	table: TTable,
): GetTableConflictConstraints<TTable> {
	return table[tableConflictConstraints];
}
