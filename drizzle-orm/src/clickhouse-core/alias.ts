import { TableAliasProxyHandler } from '~/alias.ts';
import type { BuildAliasTable } from './query-builders/select.types.ts';
import type { ClickHouseTable } from './table.ts';

export function alias<TTable extends ClickHouseTable, TAlias extends string>( // | ClickHouseViewBase
	table: TTable,
	alias: TAlias,
): BuildAliasTable<TTable, TAlias> {
	return new Proxy(table, new TableAliasProxyHandler(alias, false)) as any;
}
