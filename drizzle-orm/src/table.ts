import { AnyColumn } from './column';
import { tableColumns, tableNameSym, tableOriginalNameSym } from './utils';

export type TableExtraConfig = Record<string, unknown>;

export class Table<TName extends string = string> {
	declare protected $brand: 'Table';
	declare protected $name: TName;

	/**
	 *  @internal
	 *  Can be changed if the table is aliased.
	 */
	[tableNameSym]: TName;

	/**
	 * @internal
	 * Used to store the original name of the table, before any aliasing.
	 */
	[tableOriginalNameSym]: TName;

	/** @internal */
	declare [tableColumns]: Record<string | symbol, AnyColumn<{ tableName: TName }>>;

	constructor(name: TName) {
		this[tableNameSym] = this[tableOriginalNameSym] = name;
	}
}
