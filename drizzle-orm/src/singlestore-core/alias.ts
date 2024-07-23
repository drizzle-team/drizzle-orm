import { TableAliasProxyHandler } from '~/alias.ts';
import type { BuildAliasTable } from './query-builders/select.types.ts';
import type { SingleStoreTable } from './table.ts';
import type { SingleStoreViewBase } from './view-base.ts';

export function alias<TTable extends SingleStoreTable | SingleStoreViewBase, TAlias extends string>(
	table: TTable,
	alias: TAlias,
): BuildAliasTable<TTable, TAlias> {
	return new Proxy(table, new TableAliasProxyHandler(alias, false)) as any;
}
