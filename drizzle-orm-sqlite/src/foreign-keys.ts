import { TableName } from 'drizzle-orm/branded-types';
import { tableName } from 'drizzle-orm/utils';

import { AnySQLiteColumn } from './columns';
import { AnySQLiteTable } from './table';
import { tableForeignKeys } from './utils';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference<TTableName extends TableName, TForeignTableName extends TableName> = () => {
	readonly columns: AnySQLiteColumn<TTableName>[];
	readonly foreignTable: AnySQLiteTable<TForeignTableName>;
	readonly foreignColumns: AnySQLiteColumn<TForeignTableName>[];
};

export class ForeignKeyBuilder<TTableName extends TableName, TForeignTableName extends TableName> {
	protected brand!: 'SQLiteForeignKeyBuilder';

	protected typeKeeper!: {
		foreignTableName: TForeignTableName;
	};

	/** @internal */
	reference: Reference<TTableName, TForeignTableName>;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined;

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined;

	constructor(
		config: () => {
			columns: AnySQLiteColumn<TTableName>[];
			foreignColumns: AnySQLiteColumn<TForeignTableName>[];
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

	build(table: AnySQLiteTable<TTableName>): ForeignKey<TTableName, TForeignTableName> {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder<TableName, TableName>;

export class ForeignKey<TTableName extends TableName, TForeignTableName extends TableName> {
	readonly reference: Reference<TTableName, TForeignTableName>;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(
		readonly table: AnySQLiteTable<TTableName>,
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
			this.table[tableName],
			...columnNames,
			foreignColumns[0]!.table[tableName],
			...foreignColumnNames,
		];
		return `${chunks.join('_')}_fk`;
	}
}

export type AnyForeignKey = ForeignKey<any, any>;

type ColumnsWithTable<
	TTableName extends TableName,
	TColumns extends AnySQLiteColumn[],
> = {
	[Key in keyof TColumns]: TColumns[Key] extends AnySQLiteColumn<any, infer TType> ? AnySQLiteColumn<TTableName, TType>
		: never;
};

export type GetColumnsTable<TColumns extends AnySQLiteColumn | AnySQLiteColumn[]> = (
	TColumns extends AnySQLiteColumn ? TColumns
		: TColumns extends AnySQLiteColumn[] ? TColumns[number]
		: never
) extends AnySQLiteColumn<infer TTableName> ? TTableName
	: never;

export type NotUnion<T, T1 = T> = T extends T ? [T1] extends [T] ? T1 : never : never;
export type NotFKBuilderWithUnion<T> = T extends ForeignKeyBuilder<any, infer TForeignTableName>
	? [NotUnion<TForeignTableName>] extends [never] ? 'Only columns from the same table are allowed in foreignColumns' : T
	: never;

function _foreignKey<
	TColumns extends [AnySQLiteColumn, ...AnySQLiteColumn[]],
	TForeignTableName extends TableName,
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
			columns: Array.isArray(columns) ? columns : [columns] as AnySQLiteColumn[],
			foreignColumns: Array.isArray(foreignColumns) ? foreignColumns : [foreignColumns] as AnySQLiteColumn[],
		};
	}

	return new ForeignKeyBuilder(mappedConfig);
}

export function foreignKey<
	TColumns extends [AnySQLiteColumn, ...AnySQLiteColumn[]],
	TForeignTableName extends TableName,
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

type NotGenericTableName<T extends TableName> = T extends TableName<infer TTableName>
	? string extends TTableName ? never : TTableName
	: never;

export function addForeignKey<
	TTableName extends TableName,
	TColumns extends [AnySQLiteColumn<NotUnion<TTableName>>, ...AnySQLiteColumn<NotUnion<TTableName>>[]],
	TForeignTableName extends TableName,
	TForeignColumns extends ColumnsWithTable<NotGenericTableName<TForeignTableName>, TColumns>,
>(config: {
	table: AnySQLiteTable<TTableName>;
	columns: TColumns;
	foreignColumns: TForeignColumns;
}) {
	config.table[tableForeignKeys][Symbol()] = (_foreignKey(() => config)).build(config.table as any) as any;
}
