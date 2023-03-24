import { TableAliasProxyHandler } from '~/alias';
import type { BuildAliasTable } from './query-builders/select.types';

import type { AnyMySqlTable } from './table';

export function alias<TTable extends AnyMySqlTable, TAlias extends string>(
	table: TTable,
	alias: TAlias,
): BuildAliasTable<TTable, TAlias> {
	return new Proxy(table, new TableAliasProxyHandler(alias)) as any;
}
