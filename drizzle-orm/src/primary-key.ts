import { entityKind } from '~/entity';
import { type AnyColumn } from './column';
import { type Table } from './table';

export abstract class PrimaryKey {
	static readonly [entityKind]: string = 'PrimaryKey';

	declare protected $brand: 'PrimaryKey';

	constructor(readonly table: Table, readonly columns: AnyColumn[]) {}
}
