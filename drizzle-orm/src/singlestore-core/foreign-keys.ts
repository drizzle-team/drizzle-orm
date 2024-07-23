import { entityKind } from '~/entity.ts';
import type { AnySingleStoreColumn, SingleStoreColumn } from './columns/index.ts';
import { SingleStoreTable } from './table.ts';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference = () => {
	readonly name?: string;
	readonly columns: SingleStoreColumn[];
	readonly foreignTable: SingleStoreTable;
	readonly foreignColumns: SingleStoreColumn[];
};

export class ForeignKeyBuilder {
	static readonly [entityKind]: string = 'SingleStoreForeignKeyBuilder';

	/** @internal */
	reference: Reference;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined;

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined;

	constructor(
		config: () => {
			name?: string;
			columns: SingleStoreColumn[];
			foreignColumns: SingleStoreColumn[];
		},
		actions?: {
			onUpdate?: UpdateDeleteAction;
			onDelete?: UpdateDeleteAction;
		} | undefined,
	) {
		this.reference = () => {
			const { name, columns, foreignColumns } = config();
			return { name, columns, foreignTable: foreignColumns[0]!.table as SingleStoreTable, foreignColumns };
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
	build(table: SingleStoreTable): ForeignKey {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder;

export class ForeignKey {
	static readonly [entityKind]: string = 'SingleStoreForeignKey';

	readonly reference: Reference;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(readonly table: SingleStoreTable, builder: ForeignKeyBuilder) {
		this.reference = builder.reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}

	getName(): string {
		const { name, columns, foreignColumns } = this.reference();
		const columnNames = columns.map((column) => column.name);
		const foreignColumnNames = foreignColumns.map((column) => column.name);
		const chunks = [
			this.table[SingleStoreTable.Symbol.Name],
			...columnNames,
			foreignColumns[0]!.table[SingleStoreTable.Symbol.Name],
			...foreignColumnNames,
		];
		return name ?? `${chunks.join('_')}_fk`;
	}
}

type ColumnsWithTable<
	TTableName extends string,
	TColumns extends SingleStoreColumn[],
> = { [Key in keyof TColumns]: AnySingleStoreColumn<{ tableName: TTableName }> };

export type GetColumnsTable<TColumns extends SingleStoreColumn | SingleStoreColumn[]> = (
	TColumns extends SingleStoreColumn ? TColumns
		: TColumns extends SingleStoreColumn[] ? TColumns[number]
		: never
) extends AnySingleStoreColumn<{ tableName: infer TTableName extends string }> ? TTableName
	: never;

export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [
		AnySingleStoreColumn<{ tableName: TTableName }>,
		...AnySingleStoreColumn<{ tableName: TTableName }>[],
	],
>(
	config: {
		name?: string;
		columns: TColumns;
		foreignColumns: ColumnsWithTable<TForeignTableName, TColumns>;
	},
): ForeignKeyBuilder {
	function mappedConfig() {
		const { name, columns, foreignColumns } = config;
		return {
			name,
			columns,
			foreignColumns,
		};
	}

	return new ForeignKeyBuilder(mappedConfig);
}
