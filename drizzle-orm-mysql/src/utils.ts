import { tableColumns } from 'drizzle-orm/utils';

import { AnyMySqlTable, GetTableColumns } from './table';

/** @internal */
export const tableIndexes = Symbol('tableIndexes');

/** @internal */
export const tableForeignKeys = Symbol('tableForeignKeys');

/** @internal */
export const tableConstraints = Symbol('tableConstraints');

/** @internal */
export const tableConflictConstraints = Symbol('tableConflictConstraints');

export function getTableColumns<TTable extends AnyMySqlTable>(table: TTable): GetTableColumns<TTable> {
	return table[tableColumns] as GetTableColumns<TTable>;
}

export function getTableIndexes<TTable extends AnyMySqlTable>(table: TTable) {
	return table[tableIndexes];
}

export function getTableForeignKeys<TTable extends AnyMySqlTable>(table: TTable) {
	return table[tableForeignKeys];
}

export function getTableConstraints<TTable extends AnyMySqlTable>(table: TTable) {
	return table[tableConstraints];
}

export function getTableConflictConstraints<TTable extends AnyMySqlTable>(table: TTable) {
	return table[tableConflictConstraints];
}
