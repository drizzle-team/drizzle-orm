import { entityKind } from '~/entity.ts';
import type { AnyColumn } from './column.ts';
import type { Table } from './table.ts';

export abstract class PrimaryKey {
	static readonly [entityKind]: string = 'PrimaryKey';

	declare protected $brand: 'PrimaryKey';

	constructor(readonly table: Table, readonly columns: AnyColumn[]) {}
}

export abstract class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'PrimaryKeyBuilder';

	abstract columns: AnyColumn[];
}
