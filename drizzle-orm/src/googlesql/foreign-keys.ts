import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { AnyGoogleSqlColumn, GoogleSqlColumn } from './columns/index.ts';
import type { GoogleSqlTable } from './table.ts';

export type UpdateDeleteAction = 'cascade' | 'no action';

export type Reference = () => {
	readonly name?: string;
	readonly columns: GoogleSqlColumn[];
	readonly foreignTable: GoogleSqlTable;
	readonly foreignColumns: GoogleSqlColumn[];
};

export class ForeignKeyBuilder {
	static readonly [entityKind]: string = 'GoogleSqlForeignKeyBuilder';

	/** @internal */
	reference: Reference;

	// /** @internal */
	// _onUpdate: UpdateDeleteAction | undefined;

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined;

	constructor(
		config: () => {
			name?: string;
			columns: GoogleSqlColumn[];
			foreignColumns: GoogleSqlColumn[];
		},
		actions?: {
			// onUpdate?: UpdateDeleteAction;
			onDelete?: UpdateDeleteAction;
		} | undefined,
	) {
		this.reference = () => {
			const { name, columns, foreignColumns } = config();
			return { name, columns, foreignTable: foreignColumns[0]!.table as GoogleSqlTable, foreignColumns };
		};
		if (actions) {
			// this._onUpdate = actions.onUpdate;
			this._onDelete = actions.onDelete;
		}
	}

	// onUpdate(action: UpdateDeleteAction): this {
	// 	this._onUpdate = action;
	// 	return this;
	// }

	onDelete(action: UpdateDeleteAction): this {
		this._onDelete = action;
		return this;
	}

	/** @internal */
	build(table: GoogleSqlTable): ForeignKey {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder;

export class ForeignKey {
	static readonly [entityKind]: string = 'GoogleSqlForeignKey';

	readonly reference: Reference;
	// readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(readonly table: GoogleSqlTable, builder: ForeignKeyBuilder) {
		this.reference = builder.reference;
		// this.onUpdate = builder._onUpdate;
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
}

type ColumnsWithTable<
	TTableName extends string,
	TColumns extends GoogleSqlColumn[],
> = { [Key in keyof TColumns]: AnyGoogleSqlColumn<{ tableName: TTableName }> };

export type GetColumnsTable<TColumns extends GoogleSqlColumn | GoogleSqlColumn[]> = (
	TColumns extends GoogleSqlColumn ? TColumns
		: TColumns extends GoogleSqlColumn[] ? TColumns[number]
		: never
) extends AnyGoogleSqlColumn<{ tableName: infer TTableName extends string }> ? TTableName
	: never;

export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [AnyGoogleSqlColumn<{ tableName: TTableName }>, ...AnyGoogleSqlColumn<{ tableName: TTableName }>[]],
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
