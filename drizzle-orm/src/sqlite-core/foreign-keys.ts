import { entityKind } from '~/entity.ts';
import type { AnySQLiteColumn, SQLiteColumn } from './columns/index.ts';
import { SQLiteTable } from './table.ts';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference = () => {
	readonly name?: string;
	readonly columns: SQLiteColumn[];
	readonly foreignTable: SQLiteTable;
	readonly foreignColumns: SQLiteColumn[];
};

export class ForeignKeyBuilder {
	static readonly [entityKind]: string = 'SQLiteForeignKeyBuilder';

	declare _: {
		brand: 'SQLiteForeignKeyBuilder';
		foreignTableName: 'TForeignTableName';
	};

	/** @internal */
	reference: Reference;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined;

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined;

	constructor(
		config: () => {
			name?: string;
			columns: SQLiteColumn[];
			foreignColumns: SQLiteColumn[];
		},
		actions?: {
			onUpdate?: UpdateDeleteAction;
			onDelete?: UpdateDeleteAction;
		} | undefined,
	) {
		this.reference = () => {
			const { name, columns, foreignColumns } = config();
			return { name, columns, foreignTable: foreignColumns[0]!.table as SQLiteTable, foreignColumns };
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
	build(table: SQLiteTable): ForeignKey {
		return new ForeignKey(table, this);
	}
}

export class ForeignKey {
	static readonly [entityKind]: string = 'SQLiteForeignKey';

	readonly reference: Reference;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(readonly table: SQLiteTable, builder: ForeignKeyBuilder) {
		this.reference = builder.reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}

	getName(): string {
		const { name, columns, foreignColumns } = this.reference();
		const columnNames = columns.map((column) => column.name);
		const foreignColumnNames = foreignColumns.map((column) => column.name);
		const chunks = [
			this.table[SQLiteTable.Symbol.Name],
			...columnNames,
			foreignColumns[0]!.table[SQLiteTable.Symbol.Name],
			...foreignColumnNames,
		];
		return name ?? `${chunks.join('_')}_fk`;
	}
}

type ColumnsWithTable<
	TTableName extends string,
	TColumns extends SQLiteColumn[],
> = { [Key in keyof TColumns]: AnySQLiteColumn<{ tableName: TTableName }> };

/**
 * @deprecated please use `foreignKey({ columns: [], foreignColumns: [] })` syntax without callback
 * @param config
 * @returns
 */
export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [AnySQLiteColumn<{ tableName: TTableName }>, ...AnySQLiteColumn<{ tableName: TTableName }>[]],
>(
	config: () => {
		name?: string;
		columns: TColumns;
		foreignColumns: ColumnsWithTable<TForeignTableName, TColumns>;
	},
): ForeignKeyBuilder;
export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [AnySQLiteColumn<{ tableName: TTableName }>, ...AnySQLiteColumn<{ tableName: TTableName }>[]],
>(
	config: {
		name?: string;
		columns: TColumns;
		foreignColumns: ColumnsWithTable<TForeignTableName, TColumns>;
	},
): ForeignKeyBuilder;
export function foreignKey(
	config: any,
): ForeignKeyBuilder {
	function mappedConfig() {
		if (typeof config === 'function') {
			const { name, columns, foreignColumns } = config();
			return {
				name,
				columns,
				foreignColumns,
			};
		}
		return config;
	}

	return new ForeignKeyBuilder(mappedConfig);
}
