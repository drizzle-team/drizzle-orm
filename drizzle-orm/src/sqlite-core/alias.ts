import { TableAliasProxyHandler } from '~/alias.ts';
import type { BuildAliasTable } from './query-builders/select.types.ts';

import type { SQLiteTable } from './table.ts';
import type { SQLiteViewBase } from './view-base.ts';

export function alias<TTable extends SQLiteTable | SQLiteViewBase, TAlias extends string>(
	table: TTable,
	alias: TAlias,
): BuildAliasTable<TTable, TAlias> {
	return new Proxy(table, new TableAliasProxyHandler(alias, false)) as any;
}
