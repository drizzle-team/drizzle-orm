import type { AnySQLiteColumn } from './columns';
import type { AnySQLiteTable} from './table';
import { SQLiteTable } from './table';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference = () => {
	readonly columns: AnySQLiteColumn[];
	readonly foreignTable: AnySQLiteTable;
	readonly foreignColumns: AnySQLiteColumn[];
};

export class ForeignKeyBuilder {
	declare protected $brand: 'SQLiteForeignKeyBuilder';
	declare protected $foreignTableName: 'TForeignTableName';

	/** @internal */
	reference: Reference;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined;

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined;

	constructor(
		config: () => {
			columns: AnySQLiteColumn[];
			foreignColumns: AnySQLiteColumn[];
		},
		actions?: {
			onUpdate?: UpdateDeleteAction;
			onDelete?: UpdateDeleteAction;
		} | undefined,
	) {
		this.reference = () => {
			const { columns, foreignColumns } = config();
			return { columns, foreignTable: foreignColumns[0]!.table, foreignColumns };
		};
		if (actions) {
			this._onUpdate = actions.onUpdate;
			this._onDelete = actions.onDelete;
		}
	}

	onUpdate(action: UpdateDeleteAction): this {
		this._onUpdate = action;
		return this;
	}

	onDelete(action: UpdateDeleteAction): this {
		this._onDelete = action;
		return this;
	}

	/** @internal */
	build(table: AnySQLiteTable): ForeignKey {
		return new ForeignKey(table, this);
	}
}

export class ForeignKey {
	readonly reference: Reference;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(readonly table: AnySQLiteTable, builder: ForeignKeyBuilder) {
		this.reference = builder.reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}

	getName(): string {
		const { columns, foreignColumns } = this.reference();
		const columnNames = columns.map((column) => column.name);
		const foreignColumnNames = foreignColumns.map((column) => column.name);
		const chunks = [
			this.table[SQLiteTable.Symbol.Name],
			...columnNames,
			foreignColumns[0]!.table[SQLiteTable.Symbol.Name],
			...foreignColumnNames,
		];
		return `${chunks.join('_')}_fk`;
	}
}

type ColumnsWithTable<
	TTableName extends string,
	TColumns extends AnySQLiteColumn[],
> = { [Key in keyof TColumns]: AnySQLiteColumn<{ tableName: TTableName }> };

export type GetColumnsTable<TColumns extends AnySQLiteColumn | AnySQLiteColumn[]> = (
	TColumns extends AnySQLiteColumn ? TColumns
		: TColumns extends AnySQLiteColumn[] ? TColumns[number]
		: never
) extends AnySQLiteColumn<{ tableName: infer TTableName extends string }> ? TTableName
	: never;

export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [AnySQLiteColumn<{ tableName: TTableName }>, ...AnySQLiteColumn<{ tableName: TTableName }>[]],
>(
	config: () => {
		columns: TColumns;
		foreignColumns: ColumnsWithTable<TForeignTableName, TColumns>;
	},
): ForeignKeyBuilder {
	function mappedConfig() {
		const { columns, foreignColumns } = config();
		return {
			columns,
			foreignColumns,
		};
	}

	return new ForeignKeyBuilder(mappedConfig);
}
