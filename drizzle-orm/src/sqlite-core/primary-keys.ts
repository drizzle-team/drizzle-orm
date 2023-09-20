import { entityKind } from '~/entity.ts';
import type { AnySQLiteColumn, SQLiteColumn } from './columns/index.ts';
import { SQLiteTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumns extends AnySQLiteColumn<{ tableName: TTableName }>,
>(config: { name?: string; columns: [TColumns, ...TColumns[]] }): PrimaryKeyBuilder;
/**
 * @deprecated: Please use primaryKey({ columns: [] }) instead of this function
 * @param columns
 */
export function primaryKey<
	TTableName extends string,
	TColumns extends AnySQLiteColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder;
export function primaryKey(config: any) {
	if (config.name) {
		return new PrimaryKeyBuilder(config.columns, config.name);
	}
	return new PrimaryKeyBuilder(config);
}
export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'SQLitePrimaryKeyBuilder';

	declare _: {
		brand: 'SQLitePrimaryKeyBuilder';
	};

	/** @internal */
	columns: SQLiteColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: SQLiteColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: SQLiteTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'SQLitePrimaryKey';

	readonly columns: SQLiteColumn[];
	readonly name?: string;

	constructor(readonly table: SQLiteTable, columns: SQLiteColumn[], name?: string) {
		this.columns = columns;
		this.name = name;
	}

	getName(): string {
		return this.name ?? `${this.table[SQLiteTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
