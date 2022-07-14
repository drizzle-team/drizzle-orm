import { tableColumns } from 'drizzle-orm/utils';

import { AnyPgTable, PgTable, TableColumns } from './table';

/** @internal */
export const tableIndexes = Symbol('tableIndexes');

/** @internal */
export const tableForeignKeys = Symbol('tableForeignKeys');

/** @internal */
export const tableConstraints = Symbol('tableConstraints');

export function getTableColumns<TTable extends AnyPgTable>(table: TTable): TableColumns<TTable> {
	return table[tableColumns] as TableColumns<TTable>;
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
