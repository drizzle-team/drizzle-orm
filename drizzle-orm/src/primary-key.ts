import { entityKind, is } from '~/entity.ts';
import type { AnyColumn } from './column.ts';
import type { Table } from './table.ts';

export abstract class PrimaryKey {
	static readonly [entityKind]: string = 'PrimaryKey';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare protected $brand: 'PrimaryKey';

	constructor(readonly table: Table, readonly columns: AnyColumn[]) {}
}
