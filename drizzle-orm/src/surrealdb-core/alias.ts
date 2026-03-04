import { TableAliasProxyHandler } from '~/alias.ts';
import type { SurrealDBTable } from './table.ts';

export function alias<TTable extends SurrealDBTable, TAlias extends string>(
	table: TTable,
	alias: TAlias,
): TTable {
	return new Proxy(table, new TableAliasProxyHandler(alias, false)) as any;
}
