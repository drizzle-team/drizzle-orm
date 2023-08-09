import { TableAliasProxyHandler } from '~/alias';
import type { BuildAliasTable } from './query-builders/select.types';

import type { AnyPgTable } from './table';
import { type PgViewBase } from './view';

export function alias<TTable extends AnyPgTable | PgViewBase, TAlias extends string>(
	table: TTable,
	alias: TAlias,
): BuildAliasTable<TTable, TAlias> {
	return new Proxy(table, new TableAliasProxyHandler(alias, false)) as any;
}
