import { tableColumns } from 'drizzle-orm/utils';

import { AnyPgTable, GetTableColumns } from './table';

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
	return table[tableIndexes];
}

export function getTableForeignKeys<TTable extends AnyPgTable>(table: TTable) {
	return table[tableForeignKeys];
}

export function getTableConstraints<TTable extends AnyPgTable>(table: TTable) {
	return table[tableConstraints];
}

export function getTableConflictConstraints<TTable extends AnyPgTable>(table: TTable) {
	return table[tableConflictConstraints];
}
