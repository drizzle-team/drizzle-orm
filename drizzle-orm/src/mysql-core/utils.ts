import { Param, SQL } from '~/sql';
import { Table } from '~/table';
import { Check, CheckBuilder } from './checks';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { Index, IndexBuilder } from './indexes';
import { MySqlUpdateSet } from './query-builders/update';
import { AnyMySqlTable, MySqlTable } from './table';

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
