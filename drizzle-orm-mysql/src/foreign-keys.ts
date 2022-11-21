import { TableName } from 'drizzle-orm/branded-types';
import { tableNameSym } from 'drizzle-orm/utils';
import { AnyMySqlColumn } from './columns/common';
import { AnyMySqlTable } from './table';

import { tableForeignKeys } from './utils';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference<TTableName extends string, TForeignTableName extends string> = () => {
	readonly columns: AnyMySqlColumn<TTableName>[];
	readonly foreignTable: AnyMySqlTable<TForeignTableName>;
	readonly foreignColumns: AnyMySqlColumn<TForeignTableName>[];
};

export class ForeignKeyBuilder<TTableName extends string, TForeignTableName extends string> {
	declare protected $brand: 'MySqlForeignKeyBuilder';
	declare protected $foreignTableName: TForeignTableName;

	/** @internal */
	reference: Reference<TTableName, TForeignTableName>;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined;

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined;

	constructor(
		config: () => {
			columns: AnyMySqlColumn<TTableName>[];
			foreignColumns: AnyMySqlColumn<TForeignTableName>[];
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
	build(table: AnyMySqlTable<TTableName>): ForeignKey<TTableName, TForeignTableName> {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder<TableName, string>;

export class ForeignKey<TTableName extends string, TForeignTableName extends string> {
	readonly reference: Reference<TTableName, TForeignTableName>;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(
		readonly table: AnyMySqlTable<TTableName>,
		builder: ForeignKeyBuilder<TTableName, TForeignTableName>,
	) {
		this.reference = builder.reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}

	getName(): string {
		const { columns, foreignColumns } = this.reference();
		const columnNames = columns.map((column) => column.name);
		const foreignColumnNames = foreignColumns.map((column) => column.name);
		const chunks = [
			this.table[tableNameSym],
			...columnNames,
			foreignColumns[0]!.table[tableNameSym],
			...foreignColumnNames,
		];
		return `${chunks.join('_')}_fk`;
	}
}

export type AnyForeignKey = ForeignKey<any, any>;

type ColumnsWithTable<
	TTableName extends string,
	TColumns extends AnyMySqlColumn[],
> = {
	[Key in keyof TColumns]: TColumns[Key] extends AnyMySqlColumn<any, infer TType> ? AnyMySqlColumn<TTableName, TType>
		: never;
};

export type GetColumnsTable<TColumns extends AnyMySqlColumn | AnyMySqlColumn[]> = (
	TColumns extends AnyMySqlColumn ? TColumns
		: TColumns extends AnyMySqlColumn[] ? TColumns[number]
		: never
) extends AnyMySqlColumn<infer TTableName> ? TTableName
	: never;

export type NotUnion<T, T1 = T> = T extends T ? [T1] extends [T] ? T1 : never : never;
export type NotFKBuilderWithUnion<T> = T extends ForeignKeyBuilder<any, infer TForeignTableName>
	? [NotUnion<TForeignTableName>] extends [never] ? 'Only columns from the same table are allowed in foreignColumns' : T
	: never;

function _foreignKey<
	TColumns extends [AnyMySqlColumn, ...AnyMySqlColumn[]],
	TForeignTableName extends string,
	TForeignColumns extends ColumnsWithTable<TForeignTableName, TColumns>,
>(
	config: () => {
		columns: TColumns;
		foreignColumns: TForeignColumns;
	},
): ForeignKeyBuilder<GetColumnsTable<TColumns>, GetColumnsTable<TForeignColumns>> {
	function mappedConfig() {
		const { columns, foreignColumns } = config();
		return {
			columns: Array.isArray(columns) ? columns : [columns] as AnyMySqlColumn[],
			foreignColumns: Array.isArray(foreignColumns) ? foreignColumns : [foreignColumns] as AnyMySqlColumn[],
		};
	}

	return new ForeignKeyBuilder(mappedConfig);
}

export function foreignKey<
	TColumns extends [AnyMySqlColumn, ...AnyMySqlColumn[]],
	TForeignTableName extends string,
	TForeignColumns extends ColumnsWithTable<TForeignTableName, TColumns>,
>(
	config: () => {
		columns: TColumns;
		foreignColumns: TForeignColumns;
	},
): NotFKBuilderWithUnion<ForeignKeyBuilder<GetColumnsTable<TColumns>, GetColumnsTable<TForeignColumns>>> {
	return _foreignKey(config) as NotFKBuilderWithUnion<
		ForeignKeyBuilder<GetColumnsTable<TColumns>, GetColumnsTable<TForeignColumns>>
	>;
}
