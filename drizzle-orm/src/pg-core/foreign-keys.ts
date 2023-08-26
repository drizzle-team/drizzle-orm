import { entityKind } from '~/entity.ts';
import type { AnyPgColumn, PgColumn } from './columns/index.ts';
import { PgTable } from './table.ts';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference = () => {
	readonly columns: PgColumn[];
	readonly foreignTable: PgTable;
	readonly foreignColumns: PgColumn[];
};

export class ForeignKeyBuilder {
	static readonly [entityKind]: string = 'PgForeignKeyBuilder';

	/** @internal */
	reference: Reference;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined = 'no action';

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined = 'no action';

	constructor(
		config: () => {
			columns: PgColumn[];
			foreignColumns: PgColumn[];
		},
		actions?: {
			onUpdate?: UpdateDeleteAction;
			onDelete?: UpdateDeleteAction;
		} | undefined,
	) {
		this.reference = () => {
			const { columns, foreignColumns } = config();
			return { columns, foreignTable: foreignColumns[0]!.table as PgTable, foreignColumns };
		};
		if (actions) {
			this._onUpdate = actions.onUpdate;
			this._onDelete = actions.onDelete;
		}
	}

	onUpdate(action: UpdateDeleteAction): this {
		this._onUpdate = action === undefined ? 'no action' : action;
		return this;
	}

	onDelete(action: UpdateDeleteAction): this {
		this._onDelete = action === undefined ? 'no action' : action;
		return this;
	}

	/** @internal */
	build(table: PgTable): ForeignKey {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder;

export class ForeignKey {
	static readonly [entityKind]: string = 'PgForeignKey';

	readonly reference: Reference;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(readonly table: PgTable, builder: ForeignKeyBuilder) {
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
	TColumns extends PgColumn[],
> = { [Key in keyof TColumns]: AnyPgColumn<{ tableName: TTableName }> };

export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [AnyPgColumn<{ tableName: TTableName }>, ...AnyPgColumn<{ tableName: TTableName }>[]],
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
