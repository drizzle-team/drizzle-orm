import { Table } from '~/table';
import { Check, CheckBuilder } from './checks';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { Index, IndexBuilder } from './indexes';
import { PrimaryKey, PrimaryKeyBuilder } from './primary-keys';
import { AnyMySqlTable, MySqlTable } from './table';

export function getTableConfig(table: AnyMySqlTable) {
	const columns = Object.values(table[MySqlTable.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[MySqlTable.Symbol.InlineForeignKeys]);
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];

	const extraConfigBuilder = table[MySqlTable.Symbol.ExtraConfigBuilder];

	if (typeof extraConfigBuilder !== 'undefined') {
		const extraConfig = extraConfigBuilder(table[MySqlTable.Symbol.Columns]);
		Object.values(extraConfig).forEach((builder) => {
			if (builder instanceof IndexBuilder) {
				indexes.push(builder.build(table));
			} else if (builder instanceof CheckBuilder) {
				checks.push(builder.build(table));
			} else if (builder instanceof PrimaryKeyBuilder) {
				primaryKeys.push(builder.build(table));
			} else if (builder instanceof ForeignKeyBuilder) {
				foreignKeys.push(builder.build(table));
			}
		});
	}

	return {
		columns,
		indexes,
		foreignKeys,
		checks,
		primaryKeys,
		name,
		schema,
	};
}

export function getTableColumns(table: AnyMySqlTable) {
	return Object.assign({}, table[MySqlTable.Symbol.Columns]);
}
