import { AnyPgColumn } from './columns';
import { AnyPgTable, PgTable } from './table';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference = () => {
	readonly columns: AnyPgColumn[];
	readonly foreignTable: AnyPgTable;
	readonly foreignColumns: AnyPgColumn[];
};

export class ForeignKeyBuilder {
	declare protected $brand: 'PgForeignKeyBuilder';

	/** @internal */
	reference: Reference;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined = 'no action';

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined = 'no action';

	constructor(
		config: () => {
			columns: AnyPgColumn[];
			foreignColumns: AnyPgColumn[];
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
		this._onUpdate = typeof action === 'undefined' ? 'no action' : action;
		return this;
	}

	onDelete(action: UpdateDeleteAction): this {
		this._onDelete = typeof action === 'undefined' ? 'no action' : action;
		return this;
	}

	/** @internal */
	build(table: AnyPgTable): ForeignKey {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder;

export class ForeignKey {
	readonly reference: Reference;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(readonly table: AnyPgTable, builder: ForeignKeyBuilder) {
		this.reference = builder.reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}

	getName(): string {
		const { columns, foreignColumns } = this.reference();
		const columnNames = columns.map((column) => column.name);
		const foreignColumnNames = foreignColumns.map((column) => column.name);
		const chunks = [
			this.table[PgTable.Symbol.Name],
			...columnNames,
			foreignColumns[0]!.table[PgTable.Symbol.Name],
			...foreignColumnNames,
		];
		return `${chunks.join('_')}_fk`;
	}
}

type ColumnsWithTable<
	TTableName extends string,
	TColumns extends AnyPgColumn[],
> = { [Key in keyof TColumns]: AnyPgColumn<{ tableName: TTableName }> };

export type GetColumnsTable<TColumns extends AnyPgColumn | AnyPgColumn[]> = (
	TColumns extends AnyPgColumn ? TColumns
		: TColumns extends AnyPgColumn[] ? TColumns[number]
		: never
) extends AnyPgColumn<{ tableName: infer TTableName extends string }> ? TTableName
	: never;

export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [AnyPgColumn<{ tableName: TTableName }>, ...AnyPgColumn<{ tableName: TTableName }>[]],
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
