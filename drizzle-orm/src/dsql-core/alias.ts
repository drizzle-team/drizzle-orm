import { entityKind } from '~/entity.ts';
import { TableAliasProxyHandler } from '~/alias.ts';
import type { DSQLTable, DSQLTableWithColumns } from './table.ts';

export class Alias<TTable extends DSQLTable, TAlias extends string> {
	static readonly [entityKind]: string = 'DSQLAlias';

	constructor(
		readonly table: TTable,
		readonly alias: TAlias,
	) {}
}

export function alias<
	TTable extends DSQLTable,
	TAlias extends string,
>(
	table: TTable,
	aliasName: TAlias,
): DSQLTableWithColumns<any> {
	return new Proxy(table, new TableAliasProxyHandler(aliasName, false)) as any;
}
