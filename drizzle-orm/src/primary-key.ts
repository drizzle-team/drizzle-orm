import { type AnyColumn } from './column';
import { type Table } from './table';

export abstract class PrimaryKey {
	declare protected $brand: 'PrimaryKey';

	constructor(readonly table: Table, readonly columns: AnyColumn[]) {}
}
