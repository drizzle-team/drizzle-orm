import type { AnyMySqlColumn } from './columns';
import type { AnyMySqlTable } from './table';
import { MySqlTable } from './table';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference = () => {
	readonly columns: AnyMySqlColumn[];
	readonly foreignTable: AnyMySqlTable;
	readonly foreignColumns: AnyMySqlColumn[];
};

export class ForeignKeyBuilder {
	/** @internal */
	reference: Reference;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined;

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined;

	constructor(
		config: () => {
			columns: AnyMySqlColumn[];
			foreignColumns: AnyMySqlColumn[];
		},
		actions?: {
			onUpdate?: UpdateDeleteAction;
			onDelete?: UpdateDeleteAction;
		} | undefined,
	) {
		this.reference = () => {
			const { columns, foreignColumns } = config();
			return { columns, foreignTable: foreignColumns[0]!.table as AnyMySqlTable, foreignColumns };
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
	build(table: AnyMySqlTable): ForeignKey {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder;

export class ForeignKey {
	readonly reference: Reference;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(readonly table: AnyMySqlTable, builder: ForeignKeyBuilder) {
		this.reference = builder.reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}

	getName(): string {
		const { columns, foreignColumns } = this.reference();
		const columnNames = columns.map((column) => column.name);
		const foreignColumnNames = foreignColumns.map((column) => column.name);
		const chunks = [
			this.table[MySqlTable.Symbol.Name],
			...columnNames,
			foreignColumns[0]!.table[MySqlTable.Symbol.Name],
			...foreignColumnNames,
		];
		return `${chunks.join('_')}_fk`;
	}
}

type ColumnsWithTable<
	TTableName extends string,
	TColumns extends AnyMySqlColumn[],
> = { [Key in keyof TColumns]: AnyMySqlColumn<{ tableName: TTableName }> };

export type GetColumnsTable<TColumns extends AnyMySqlColumn | AnyMySqlColumn[]> = (
	TColumns extends AnyMySqlColumn ? TColumns
		: TColumns extends AnyMySqlColumn[] ? TColumns[number]
		: never
) extends AnyMySqlColumn<{ tableName: infer TTableName extends string }> ? TTableName
	: never;

export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [AnyMySqlColumn<{ tableName: TTableName }>, ...AnyMySqlColumn<{ tableName: TTableName }>[]],
>(
	config: {
		columns: TColumns;
		foreignColumns: ColumnsWithTable<TForeignTableName, TColumns>;
	},
): ForeignKeyBuilder {
	function mappedConfig() {
		const { columns, foreignColumns } = config;
		return {
			columns,
			foreignColumns,
		};
	}

	return new ForeignKeyBuilder(mappedConfig);
}
