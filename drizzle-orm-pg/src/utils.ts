import { tableColumns } from 'drizzle-orm/utils';

import { AnyPgTable, GetTableColumns, GetTableConflictConstraints } from './table';

/** @internal */
export const tableIndexes = Symbol('tableIndexes');

/** @internal */
export const tableForeignKeys = Symbol('tableForeignKeys');

/** @internal */
export const tableConstraints = Symbol('tableConstraints');

/** @internal */
export const tableConflictConstraints = Symbol('tableConflictConstraints');

export function getTableColumns<TTable extends AnyPgTable>(table: TTable): GetTableColumns<TTable> {
	return table[tableColumns] as GetTableColumns<TTable>;
}

export function getTableIndexes<TTable extends AnyPgTable>(table: TTable) {
	const keys = Reflect.ownKeys(table[tableIndexes]);
	return keys.map((key) => table[tableIndexes][key]!);
}

export function getTableForeignKeys<TTable extends AnyPgTable>(table: TTable) {
	const keys = Reflect.ownKeys(table[tableForeignKeys]);
	return keys.map((key) => table[tableForeignKeys][key]!);
}

export function getTableConstraints<TTable extends AnyPgTable>(table: TTable) {
	const keys = Reflect.ownKeys(table[tableConstraints]);
	return keys.map((key) => table[tableConstraints][key]!);
}

export function getTableConflictConstraints<TTable extends AnyPgTable>(
	table: TTable,
): GetTableConflictConstraints<TTable> {
	return table[tableConflictConstraints];
}
