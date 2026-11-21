import { entityKind } from '~/entity.ts';
import type { AnyFirebirdColumn, FirebirdColumn } from './columns/index.ts';
import { FirebirdTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnyFirebirdColumn<{ tableName: TTableName }>,
	TColumns extends AnyFirebirdColumn<{ tableName: TTableName }>[],
>(config: { name?: string; columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder;
/**
 * @deprecated: Please use primaryKey({ columns: [] }) instead of this function
 * @param columns
 */
export function primaryKey<
	TTableName extends string,
	TColumns extends AnyFirebirdColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder;
export function primaryKey(...config: any) {
	if (config[0].columns) {
		return new PrimaryKeyBuilder(config[0].columns, config[0].name);
	}
	return new PrimaryKeyBuilder(config);
}
export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'FirebirdPrimaryKeyBuilder';

	declare _: {
		brand: 'FirebirdPrimaryKeyBuilder';
	};

	/** @internal */
	columns: FirebirdColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: FirebirdColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: FirebirdTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'FirebirdPrimaryKey';

	readonly columns: FirebirdColumn[];
	readonly name?: string;

	constructor(readonly table: FirebirdTable, columns: FirebirdColumn[], name?: string) {
		this.columns = columns;
		this.name = name;
	}

	getName(): string {
		return this.name
			?? `${this.table[FirebirdTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
