import { entityKind } from '~/entity';
import type { AnySQLiteColumn, SQLiteColumn } from './columns';
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
	static readonly [entityKind]: string = 'SQLitePrimaryKeyBuilder';

	declare _: {
		brand: 'SQLitePrimaryKeyBuilder';
	};

	/** @internal */
	columns: SQLiteColumn[];

	constructor(
		columns: SQLiteColumn[],
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: SQLiteTable): PrimaryKey {
		return new PrimaryKey(table, this.columns);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'SQLitePrimaryKey';

	readonly columns: SQLiteColumn[];

	constructor(readonly table: SQLiteTable, columns: SQLiteColumn[]) {
		this.columns = columns;
	}

	getName(): string {
		return `${this.table[SQLiteTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
