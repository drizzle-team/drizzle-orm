import { AnyMySqlColumn } from './columns';
import { AnyMySqlTable, MySqlTable } from './table';

export function primaryKey<
	TTableName extends string,
	TColumns extends AnyMySqlColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder {
	return new PrimaryKeyBuilder(columns);
}

export class PrimaryKeyBuilder {
	declare protected $brand: 'MySqlPrimaryKeyBuilder';

	/** @internal */
	columns: AnyMySqlColumn<{}>[];

	constructor(
		columns: AnyMySqlColumn[],
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: AnyMySqlTable): PrimaryKey {
		return new PrimaryKey(table, this.columns);
	}
}

export class PrimaryKey {
	readonly columns: AnyMySqlColumn<{}>[];

	constructor(readonly table: AnyMySqlTable, columns: AnyMySqlColumn<{}>[]) {
		this.columns = columns;
	}

	getName(): string {
		return `${this.table[MySqlTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
