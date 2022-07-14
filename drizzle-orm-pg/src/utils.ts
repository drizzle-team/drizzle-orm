import { AnyPgTable } from './table';

/** @internal */
export const tableIndexes = Symbol('tableIndexes');

/** @internal */
export const tableForeignKeys = Symbol('tableForeignKeys');

/** @internal */
export const tableConstraints = Symbol('tableConstraints');

export function getTableIndexes<TTable extends AnyPgTable>(table: TTable) {
	return table[tableIndexes];
}

export function getTableForeignKeys<TTable extends AnyPgTable>(table: TTable) {
	return table[tableForeignKeys];
}

export function getTableConstraints<TTable extends AnyPgTable>(table: TTable) {
	return table[tableConstraints];
}
