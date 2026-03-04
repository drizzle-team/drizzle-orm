import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { AnyMySqlColumn, MySqlColumn } from './columns/index.ts';
import type { MySqlTable } from './table.ts';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference = () => {
	readonly name?: string;
	readonly columns: MySqlColumn[];
	readonly foreignTable: MySqlTable;
	readonly foreignColumns: MySqlColumn[];
};

export class ForeignKeyBuilder {
	static readonly [entityKind]: string = 'MySqlForeignKeyBuilder';

	/** @internal */
	reference: Reference;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined;

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined;

	constructor(
		config: () => {
			name?: string;
			columns: MySqlColumn[];
			foreignColumns: MySqlColumn[];
		},
		actions?: {
			onUpdate?: UpdateDeleteAction;
			onDelete?: UpdateDeleteAction;
		} | undefined,
	) {
		this.reference = () => {
			const { name, columns, foreignColumns } = config();
			return { name, columns, foreignTable: foreignColumns[0]!.table as MySqlTable, foreignColumns };
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
	build(table: MySqlTable): ForeignKey {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder;

export class ForeignKey {
	static readonly [entityKind]: string = 'MySqlForeignKey';

	readonly reference: Reference;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(readonly table: MySqlTable, builder: ForeignKeyBuilder) {
		this.reference = builder.reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}

	getName(): string {
		const { name, columns, foreignColumns } = this.reference();
		const columnNames = columns.map((column) => column.name);
		const foreignColumnNames = foreignColumns.map((column) => column.name);
		const chunks = [
			this.table[TableName],
			...columnNames,
			foreignColumns[0]!.table[TableName],
			...foreignColumnNames,
		];
		return name ?? `${chunks.join('_')}_fk`;
	}

	isNameExplicit(): boolean {
		return this.reference().name ? true : false;
	}
}

type ColumnsWithTable<
	TTableName extends string,
	TColumns extends MySqlColumn[],
> = { [Key in keyof TColumns]: AnyMySqlColumn<{ tableName: TTableName }> };

export type GetColumnsTable<TColumns extends MySqlColumn | MySqlColumn[]> = (
	TColumns extends MySqlColumn ? TColumns
		: TColumns extends MySqlColumn[] ? TColumns[number]
		: never
) extends AnyMySqlColumn<{ tableName: infer TTableName extends string }> ? TTableName
	: never;

export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [AnyMySqlColumn<{ tableName: TTableName }>, ...AnyMySqlColumn<{ tableName: TTableName }>[]],
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
