import { is } from '~/entity';
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

	const extraConfigBuilder = table[SQLiteTable.Symbol.ExtraConfigBuilder];

	if (extraConfigBuilder !== undefined) {
		const extraConfig = extraConfigBuilder(table[SQLiteTable.Symbol.Columns]);
		for (const builder of Object.values(extraConfig)) {
			if (is(builder, IndexBuilder)) {
				indexes.push(builder.build(table));
			} else if (is(builder, CheckBuilder)) {
				checks.push(builder.build(table));
			} else if (is(builder, PrimaryKeyBuilder)) {
				primaryKeys.push(builder.build(table));
			} else if (is(builder, ForeignKeyBuilder)) {
				foreignKeys.push(builder.build(table));
			}
		}
	}

	return {
		columns,
		indexes,
		foreignKeys,
		checks,
		primaryKeys,
		name,
	};
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
