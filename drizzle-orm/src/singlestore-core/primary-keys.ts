import { entityKind } from '~/entity.ts';
import type { AnySingleStoreColumn, SingleStoreColumn } from './columns/index.ts';
import { SingleStoreTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnySingleStoreColumn<{ tableName: TTableName }>,
	TColumns extends AnySingleStoreColumn<{ tableName: TTableName }>[],
>(config: { name?: string; columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder;
/**
 * @deprecated: Please use primaryKey({ columns: [] }) instead of this function
 * @param columns
 */
export function primaryKey<
	TTableName extends string,
	TColumns extends AnySingleStoreColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder;
export function primaryKey(...config: any) {
	if (config[0].columns) {
		return new PrimaryKeyBuilder(config[0].columns, config[0].name);
	}
	return new PrimaryKeyBuilder(config);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'SingleStorePrimaryKeyBuilder';

	/** @internal */
	columns: SingleStoreColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: SingleStoreColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: SingleStoreTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'SingleStorePrimaryKey';

	readonly columns: SingleStoreColumn[];
	readonly name?: string;
	readonly isNameExplicit: boolean;

	constructor(readonly table: SingleStoreTable, columns: SingleStoreColumn[], name?: string) {
		this.columns = columns;
		this.name = name;
		this.isNameExplicit = !!name;
	}

	getName(): string {
		return this.name
			?? `${this.table[SingleStoreTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
