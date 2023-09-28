import { entityKind } from '~/entity.ts';
import type { AnyMySqlColumn, MySqlColumn } from './columns/index.ts';
import { MySqlTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnyMySqlColumn<{ tableName: TTableName }>,
	TColumns extends AnyMySqlColumn<{ tableName: TTableName }>[],
>(config: { name?: string; columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder;
/**
 * @deprecated: Please use primaryKey({ columns: [] }) instead of this function
 * @param columns
 */
export function primaryKey<
	TTableName extends string,
	TColumns extends AnyMySqlColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder;
export function primaryKey(...config: any) {
	if (config[0].columns) {
		return new PrimaryKeyBuilder(config[0].columns, config[0].name);
	}
	return new PrimaryKeyBuilder(config);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'MySqlPrimaryKeyBuilder';

	/** @internal */
	columns: MySqlColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: MySqlColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: MySqlTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'MySqlPrimaryKey';

	readonly columns: MySqlColumn[];
	readonly name?: string;

	constructor(readonly table: MySqlTable, columns: MySqlColumn[], name?: string) {
		this.columns = columns;
		this.name = name;
	}

	getName(): string {
		return this.name
			?? `${this.table[MySqlTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
