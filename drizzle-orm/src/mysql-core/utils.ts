import { Table } from '~/table';
import { Check, CheckBuilder } from './checks';
import { AnyMySqlColumn } from './columns';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { Index, IndexBuilder } from './indexes';
import { AnyMySqlTable, GetTableConfig, MySqlTable } from './table';

/** @internal */
export const tableIndexes = Symbol('tableIndexes');

/** @internal */
export const tableForeignKeys = Symbol('tableForeignKeys');

/** @internal */
export const tableChecks = Symbol('tableChecks');

export function getTableConfig<TTable extends AnyMySqlTable>(table: TTable) {
	const columns = getTableColumns(table);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const foreignKeys: ForeignKey[] = getTableForeignKeys(table);
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];

	const extraConfig = table[MySqlTable.Symbol.ExtraConfig];

	if (typeof extraConfig === 'undefined') {
		return {
			columns,
			indexes,
			foreignKeys,
			checks,
			name,
			schema,
		};
	}

	const builtConfig = extraConfig(table[MySqlTable.Symbol.Columns]);
	Object.entries(builtConfig).forEach(([_, builder]) => {
		if (builder instanceof IndexBuilder) {
			indexes.push(builder.build(table));
		} else if (builder instanceof CheckBuilder) {
			checks.push(builder.build(table));
		} else if (builder instanceof ForeignKeyBuilder) {
			foreignKeys.push(builder.build(table));
		}
	});

	return {
		columns: getTableColumns(table),
		indexes,
		foreignKeys,
		checks,
		name,
		schema,
	};
}

export interface GetTableColumnsConfig<TFormat extends 'object' | 'array' = 'object' | 'array'> {
	format: TFormat;
}

export function getTableColumns<TTable extends AnyMySqlTable>(
	table: TTable,
	config: GetTableColumnsConfig<'object'>,
): Record<string, AnyMySqlColumn<{ tableName: GetTableConfig<TTable, 'name'> }>>;
export function getTableColumns<TTable extends AnyMySqlTable>(
	table: TTable,
	config?: GetTableColumnsConfig<'array'>,
): AnyMySqlColumn<{ tableName: GetTableConfig<TTable, 'name'> }>[];
export function getTableColumns<TTable extends AnyMySqlTable>(
	table: TTable,
	config?: GetTableColumnsConfig,
): Record<string, AnyMySqlColumn> | AnyMySqlColumn[] {
	const columns = table[MySqlTable.Symbol.Columns];
	if (config?.format === 'object') {
		return Object.assign({}, columns);
	}
	return Object.values(columns);
}

export function getTableIndexes<TTable extends AnyMySqlTable>(table: TTable): Index[] {
	const indexes = table[MySqlTable.Symbol.Indexes];
	const keys = Reflect.ownKeys(indexes);
	return keys.map((key) => indexes[key]!);
}

export function getTableForeignKeys<TTable extends AnyMySqlTable>(table: TTable): ForeignKey[] {
	const foreignKeys = table[MySqlTable.Symbol.ForeignKeys];
	const keys = Reflect.ownKeys(foreignKeys);
	return keys.map((key) => foreignKeys[key]!);
}

export function getTableChecks<TTable extends AnyMySqlTable>(table: TTable): Check[] {
	const checks = table[MySqlTable.Symbol.Checks];
	const keys = Reflect.ownKeys(checks);
	return keys.map((key) => checks[key]!);
}
