import { Table } from '~/table';
import { ViewBaseConfig } from '~/view';
import type { Check } from './checks';
import { CheckBuilder } from './checks';
import type { ForeignKey } from './foreign-keys';
import { ForeignKeyBuilder } from './foreign-keys';
import type { Index } from './indexes';
import { IndexBuilder } from './indexes';
import type { PrimaryKey } from './primary-keys';
import { PrimaryKeyBuilder } from './primary-keys';
import type { AnySQLiteTable } from './table';
import { SQLiteTable } from './table';
import { type SQLiteView, SQLiteViewConfig } from './view';

export function getTableConfig<TTable extends AnySQLiteTable>(table: TTable) {
	const columns = Object.values(table[SQLiteTable.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[SQLiteTable.Symbol.InlineForeignKeys]);
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];

	const extraConfigBuilder = table[SQLiteTable.Symbol.ExtraConfigBuilder];

	if (typeof extraConfigBuilder !== 'undefined') {
		const extraConfig = extraConfigBuilder(table[SQLiteTable.Symbol.Columns]);
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

export function getTableColumns(table: AnySQLiteTable) {
	return Object.assign({}, table[SQLiteTable.Symbol.Columns]);
}

export type OnConflict = 'rollback' | 'abort' | 'fail' | 'ignore' | 'replace';

export function getViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: SQLiteView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
		...view[SQLiteViewConfig],
	};
}
