import { entityKind } from '~/entity.ts';
import type { AnyMsSqlColumn, MsSqlColumn } from './columns/index.ts';
import type { MsSqlTable } from './table.ts';

export type UpdateDeleteAction = 'cascade' | 'no action' | 'set null' | 'set default';

export type Reference = () => {
	readonly name?: string;
	readonly columns: MsSqlColumn[];
	readonly foreignTable: MsSqlTable;
	readonly foreignColumns: MsSqlColumn[];
};

export class ForeignKeyBuilder {
	static readonly [entityKind]: string = 'MsSqlForeignKeyBuilder';

	/** @internal */
	reference: Reference;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined;

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined;

	constructor(
		config: () => {
			name?: string;
			columns: MsSqlColumn[];
			foreignColumns: MsSqlColumn[];
		},
		actions?: {
			onUpdate?: UpdateDeleteAction;
			onDelete?: UpdateDeleteAction;
		} | undefined,
	) {
		this.reference = () => {
			const { name, columns, foreignColumns } = config();
			return { name, columns, foreignTable: foreignColumns[0]!.table as MsSqlTable, foreignColumns };
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
	build(table: MsSqlTable): ForeignKey {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder;

export class ForeignKey {
	static readonly [entityKind]: string = 'MsSqlForeignKey';

	readonly reference: Reference;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(readonly table: MsSqlTable, builder: ForeignKeyBuilder) {
		this.reference = builder.reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}

	getName() {
		const { name } = this.reference();
		return name;
	}

	isNameExplicit() {
		return !!this.reference().name;
	}
}

type ColumnsWithTable<
	TTableName extends string,
	TColumns extends MsSqlColumn[],
> = { [Key in keyof TColumns]: AnyMsSqlColumn<{ tableName: TTableName }> };

export type GetColumnsTable<TColumns extends MsSqlColumn | MsSqlColumn[]> = (
	TColumns extends MsSqlColumn ? TColumns
		: TColumns extends MsSqlColumn[] ? TColumns[number]
		: never
) extends AnyMsSqlColumn<{ tableName: infer TTableName extends string }> ? TTableName
	: never;

export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [AnyMsSqlColumn<{ tableName: TTableName }>, ...AnyMsSqlColumn<{ tableName: TTableName }>[]],
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
