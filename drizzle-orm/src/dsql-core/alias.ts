import { entityKind } from '~/entity.ts';
import type { DSQLColumn } from './columns/common.ts';
import type { DSQLTable, DSQLTableWithColumns, TableConfig } from './table.ts';

export class Alias<TTable extends DSQLTable, TAlias extends string> {
	static readonly [entityKind]: string = 'DSQLAlias';

	constructor(
		readonly table: TTable,
		readonly alias: TAlias,
	) {}
}

export function alias<TTable extends DSQLTableWithColumns<TableConfig>, TAlias extends string>(
	table: TTable,
	alias: TAlias,
): DSQLTableWithColumns<any> {
	throw new Error('Method not implemented.');
}
