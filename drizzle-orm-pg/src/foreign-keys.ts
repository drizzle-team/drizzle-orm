import { TableName } from 'drizzle-orm/branded-types';
import { tableName } from 'drizzle-orm/utils';

import { AnyPgColumn } from './columns';
import { AnyPgTable } from './table';
import { tableForeignKeys } from './utils';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference<TTableName extends TableName, TForeignTableName extends TableName> = () => {
	readonly columns: AnyPgColumn<TTableName>[];
	readonly foreignTable: AnyPgTable<TForeignTableName>;
	readonly foreignColumns: AnyPgColumn<TForeignTableName>[];
};

export class ForeignKeyBuilder<TTableName extends TableName, TForeignTableName extends TableName> {
	protected brand!: 'PgForeignKeyBuilder';

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
			columns: AnyPgColumn<TTableName>[];
			foreignColumns: AnyPgColumn<TForeignTableName>[];
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
	TColumns extends AnyPgColumn[],
> = {
	[Key in keyof TColumns]: TColumns[Key] extends AnyPgColumn<any, infer TType> ? AnyPgColumn<TTableName, TType>
		: never;
};

export type GetColumnsTable<TColumns extends AnyPgColumn | AnyPgColumn[]> = (
	TColumns extends AnyPgColumn ? TColumns
		: TColumns extends AnyPgColumn[] ? TColumns[number]
		: never
) extends AnyPgColumn<infer TTableName> ? TTableName
	: never;

export type NotUnion<T, T1 = T> = T extends T ? [T1] extends [T] ? T1 : never : never;
export type NotFKBuilderWithUnion<T> = T extends ForeignKeyBuilder<any, infer TForeignTableName>
	? [NotUnion<TForeignTableName>] extends [never] ? 'Only columns from the same table are allowed in foreignColumns' : T
	: never;

function _foreignKey<
	TColumns extends [AnyPgColumn, ...AnyPgColumn[]],
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
			columns: Array.isArray(columns) ? columns : [columns] as AnyPgColumn[],
			foreignColumns: Array.isArray(foreignColumns) ? foreignColumns : [foreignColumns] as AnyPgColumn[],
		};
	}

	return new ForeignKeyBuilder(mappedConfig);
}

export function foreignKey<
	TColumns extends [AnyPgColumn, ...AnyPgColumn[]],
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
	TColumns extends [AnyPgColumn<NotUnion<TTableName>>, ...AnyPgColumn<NotUnion<TTableName>>[]],
	TForeignTableName extends TableName,
	TForeignColumns extends ColumnsWithTable<NotGenericTableName<TForeignTableName>, TColumns>,
>(config: {
	table: AnyPgTable<TTableName>;
	columns: TColumns;
	foreignColumns: TForeignColumns;
}) {
	config.table[tableForeignKeys][Symbol()] = (_foreignKey(() => config)).build(config.table as any) as any;
}
