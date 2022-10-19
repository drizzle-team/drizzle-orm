import { AnyPgTable, GetTableConfig, PgTable } from './table';

export function getTableColumns<TTable extends AnyPgTable>(table: TTable) {
	const columns = table[PgTable.Symbol.Columns];
	const keys = Reflect.ownKeys(columns);
	return keys.map((key) => columns[key]!);
}

export function getTableIndexes<TTable extends AnyPgTable>(table: TTable) {
	const indexes = table[PgTable.Symbol.Indexes];
	const keys = Reflect.ownKeys(indexes);
	return keys.map((key) => indexes[key]!);
}

export function getTableForeignKeys<TTable extends AnyPgTable>(table: TTable) {
	const foreignKeys = table[PgTable.Symbol.ForeignKeys];
	const keys = Reflect.ownKeys(foreignKeys);
	return keys.map((key) => foreignKeys[key]!);
}

export function getTableChecks<TTable extends AnyPgTable>(table: TTable) {
	const checks = table[PgTable.Symbol.Checks];
	const keys = Reflect.ownKeys(checks);
	return keys.map((key) => checks[key]!);
}

export function getTableConflictConstraints<TTable extends AnyPgTable>(
	table: TTable,
): GetTableConfig<TTable, 'conflictConstraints'> {
	return table[PgTable.Symbol.ConflictConstraints] as GetTableConfig<TTable, 'conflictConstraints'>;
}
