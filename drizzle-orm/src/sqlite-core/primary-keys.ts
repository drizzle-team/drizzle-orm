import type { AnySQLiteColumn } from './columns';
import type { AnySQLiteTable } from './table';
import { SQLiteTable } from './table';

export function primaryKey<
	TTableName extends string,
	TColumns extends AnySQLiteColumn<{ tableName: TTableName }>[],
>(
	...columns: TColumns
): PrimaryKeyBuilder {
	return new PrimaryKeyBuilder(columns);
}

export class PrimaryKeyBuilder {
	declare _: {
		brand: 'SQLitePrimaryKeyBuilder';
	};

	/** @internal */
	columns: AnySQLiteColumn<{}>[];

	constructor(
		columns: AnySQLiteColumn[],
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: AnySQLiteTable): PrimaryKey {
		return new PrimaryKey(table, this.columns);
	}
}

export class PrimaryKey {
	readonly columns: AnySQLiteColumn<{}>[];

	constructor(readonly table: AnySQLiteTable, columns: AnySQLiteColumn<{}>[]) {
		this.columns = columns;
	}

	getName(): string {
		return `${this.table[SQLiteTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
