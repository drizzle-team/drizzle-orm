import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlColumn, GoogleSqlColumn } from './columns/index.ts';
import { GoogleSqlTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnyGoogleSqlColumn<{ tableName: TTableName }>,
	TColumns extends AnyGoogleSqlColumn<{ tableName: TTableName }>[],
>(config: { name?: string; columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder;
/**
 * @deprecated: Please use primaryKey({ columns: [] }) instead of this function
 * @param columns
 */
export function primaryKey<
	TTableName extends string,
	TColumns extends AnyGoogleSqlColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder;
export function primaryKey(...config: any) {
	if (config[0].columns) {
		return new PrimaryKeyBuilder(config[0].columns, config[0].name);
	}
	return new PrimaryKeyBuilder(config);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'GoogleSqlPrimaryKeyBuilder';

	/** @internal */
	columns: GoogleSqlColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: GoogleSqlColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: GoogleSqlTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'GoogleSqlPrimaryKey';

	readonly columns: GoogleSqlColumn[];
	readonly name?: string;

	constructor(readonly table: GoogleSqlTable, columns: GoogleSqlColumn[], name?: string) {
		this.columns = columns;
		this.name = name;
	}

	getName(): string {
		return this.name
			?? `${this.table[GoogleSqlTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
