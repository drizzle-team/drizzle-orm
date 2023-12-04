import { entityKind } from '~/entity.ts';
import type { AnyMsSqlColumn, MsSqlColumn } from './columns/index.ts';
import { MsSqlTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnyMsSqlColumn<{ tableName: TTableName }>,
	TColumns extends AnyMsSqlColumn<{ tableName: TTableName }>[],
>(config: { name?: string; columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder;
/**
 * @deprecated: Please use primaryKey({ columns: [] }) instead of this function
 * @param columns
 */
export function primaryKey<
	TTableName extends string,
	TColumns extends AnyMsSqlColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder;
export function primaryKey(...config: any) {
	if (config[0].columns) {
		return new PrimaryKeyBuilder(config[0].columns, config[0].name);
	}
	return new PrimaryKeyBuilder(config);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'MsSqlPrimaryKeyBuilder';

	/** @internal */
	columns: MsSqlColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: MsSqlColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: MsSqlTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'MsSqlPrimaryKey';

	readonly columns: MsSqlColumn[];
	readonly name?: string;

	constructor(readonly table: MsSqlTable, columns: MsSqlColumn[], name?: string) {
		this.columns = columns;
		this.name = name;
	}

	getName(): string {
		return this.name
			?? `${this.table[MsSqlTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
