import type { AnyPgColumn } from './columns';
import type { AnyPgTable} from './table';
import { PgTable } from './table';

export function primaryKey<
	TTableName extends string,
	TColumns extends AnyPgColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder {
	return new PrimaryKeyBuilder(columns);
}

export class PrimaryKeyBuilder {
	declare protected $brand: 'PgPrimaryKeyBuilder';

	/** @internal */
	columns: AnyPgColumn<{}>[];

	constructor(
		columns: AnyPgColumn[],
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: AnyPgTable): PrimaryKey {
		return new PrimaryKey(table, this.columns);
	}
}

export class PrimaryKey {
	readonly columns: AnyPgColumn<{}>[];

	constructor(readonly table: AnyPgTable, columns: AnyPgColumn<{}>[]) {
		this.columns = columns;
	}

	getName(): string {
		return `${this.table[PgTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
