import { TableAliasProxyHandler } from '~/alias';
import type { BuildAliasTable } from './query-builders/select.types';

import type { PgTable } from './table';
import { type PgViewBase } from './view';

export function alias<TTable extends PgTable | PgViewBase, TAlias extends string>(
	table: TTable,
	alias: TAlias,
): BuildAliasTable<TTable, TAlias> {
	return new Proxy(table, new TableAliasProxyHandler(alias, false)) as any;
}
