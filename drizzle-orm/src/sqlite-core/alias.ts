import { TableAliasProxyHandler } from '~/alias';
import { BuildAliasTable } from './query-builders/select.types';

import { AnySQLiteTable } from './table';

export function alias<TTable extends AnySQLiteTable, TAlias extends string>(
	table: TTable,
	alias: TAlias,
): BuildAliasTable<TTable, TAlias> {
	return new Proxy(table, new TableAliasProxyHandler(alias)) as any;
}
