import { TableName } from 'drizzle-orm/branded-types';

import { AnyPgColumn, PgColumn } from './columns';
import { AnyPgTable } from './table';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference<TTableName extends TableName, TForeignTableName extends TableName> = () => {
	readonly columns: AnyPgColumn<TTableName>[];
	readonly foreignTable: AnyPgTable<TForeignTableName>;
	readonly foreignColumns: AnyPgColumn<TForeignTableName>[];
};

export class ForeignKeyBuilder<TTableName extends TableName, TForeignTableName extends TableName> {
	protected brand!: 'PgForeignKeyBuilder';

	/** @internal */
	_reference: Reference<TTableName, TForeignTableName>;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined;

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined;

	constructor(
		reference: () => readonly [
			columns: AnyPgColumn<TTableName>[],
			foreignTable: AnyPgTable<TForeignTableName>,
			foreignColumns: AnyPgColumn<TForeignTableName>[],
		],
	) {
		this._reference = () => {
			const [columns, foreignTable, foreignColumns] = reference();
			return { columns, foreignTable, foreignColumns };
		};
	}

	onUpdate(action: UpdateDeleteAction): Omit<this, 'onUpdate'> {
		this._onUpdate = action;
		return this;
	}

	onDelete(action: UpdateDeleteAction): Omit<this, 'onDelete'> {
		this._onDelete = action;
		return this;
	}

	build(table: AnyPgTable<TTableName>): ForeignKey<TTableName, TForeignTableName> {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder<TableName, TableName>;

export class ForeignKey<TTableName extends TableName, TForeignTableName extends TableName> {
	readonly reference: Reference<TTableName, TForeignTableName>;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(
		readonly table: AnyPgTable<TTableName>,
		builder: ForeignKeyBuilder<TTableName, TForeignTableName>,
	) {
		this.reference = builder._reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}
}

export type AnyForeignKey = ForeignKey<TableName, TableName>;

type ColumnsWithTable<
	TTableName extends TableName,
	TColumns extends AnyPgColumn | [AnyPgColumn, ...AnyPgColumn[]],
> = TColumns extends PgColumn<any, infer TType, any, any, any> ? PgColumn<TTableName, TType, any, any, any>
	: TColumns extends AnyPgColumn[] ? {
			[Key in keyof TColumns]: TColumns[Key] extends PgColumn<any, infer TType, any, any, any>
				? PgColumn<TTableName, TType, any, any, any>
				: never;
		}
	: never;

type GetColumnsTable<TColumns extends AnyPgColumn | AnyPgColumn[]> = (
	TColumns extends AnyPgColumn ? TColumns
		: TColumns extends AnyPgColumn[] ? TColumns[number]
		: never
) extends AnyPgColumn<infer TTableName> ? TTableName
	: never;

export function foreignKey<
	TColumns extends AnyPgColumn | [AnyPgColumn, ...AnyPgColumn[]],
	TForeignTableName extends TableName,
>(
	config: () => [
		columns: TColumns,
		foreignTable: AnyPgTable<TForeignTableName>,
		foreignColumns: ColumnsWithTable<TForeignTableName, TColumns>,
	],
): ForeignKeyBuilder<
	GetColumnsTable<TColumns>,
	TForeignTableName
> {
	function mappedConfig() {
		const [columns, foreignTable, foreignColumns] = config();
		return [
			(columns instanceof PgColumn ? [columns] : columns) as AnyPgColumn<
				GetColumnsTable<TColumns>
			>[],
			foreignTable,
			(foreignColumns instanceof PgColumn
				? [foreignColumns]
				: foreignColumns) as AnyPgColumn<TForeignTableName>[],
		] as const;
	}

	return new ForeignKeyBuilder(mappedConfig);
}
