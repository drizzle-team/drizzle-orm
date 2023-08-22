import { entityKind } from '~/entity';
import type { AnyMySqlColumn, MySqlColumn } from './columns';
import { MySqlTable } from './table';

export function primaryKey<
	TTableName extends string,
	TColumns extends AnyMySqlColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder {
	return new PrimaryKeyBuilder(columns);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'MySqlPrimaryKeyBuilder';

	/** @internal */
	columns: MySqlColumn[];

	constructor(
		columns: MySqlColumn[],
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: MySqlTable): PrimaryKey {
		return new PrimaryKey(table, this.columns);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'MySqlPrimaryKey';

	readonly columns: MySqlColumn[];

	constructor(readonly table: MySqlTable, columns: MySqlColumn[]) {
		this.columns = columns;
	}

	getName(): string {
		return `${this.table[MySqlTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
