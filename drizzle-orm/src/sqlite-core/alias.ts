import { TableAliasProxyHandler } from '~/alias';
import { type BuildAliasTable } from './query-builders/select.types';

import { type AnySQLiteTable } from './table';
import { type SQLiteViewBase } from './view';

export function alias<TTable extends AnySQLiteTable | SQLiteViewBase, TAlias extends string>(
	table: TTable,
	alias: TAlias,
): BuildAliasTable<TTable, TAlias> {
	return new Proxy(table, new TableAliasProxyHandler(alias, false)) as any;
}
