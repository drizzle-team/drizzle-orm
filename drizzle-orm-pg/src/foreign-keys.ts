import { UpdateColumnConfig } from 'drizzle-orm';
import { tableNameSym } from 'drizzle-orm/utils';

import { AnyPgColumn, PgColumn } from './columns';
import { AnyPgTable, PgTable } from './table';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference<TTableName extends string, TForeignTableName extends string> = () => {
	readonly columns: AnyPgColumn<{ tableName: TTableName }>[];
	readonly foreignTable: AnyPgTable<{ name: TForeignTableName }>;
	readonly foreignColumns: AnyPgColumn<{ tableName: TForeignTableName }>[];
};

export class ForeignKeyBuilder<TTableName extends string, TForeignTableName extends string> {
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
			columns: AnyPgColumn<{ tableName: TTableName }>[];
			foreignColumns: AnyPgColumn<{ tableName: TForeignTableName }>[];
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

	build(table: AnyPgTable<{ name: TTableName }>): ForeignKey<TTableName, TForeignTableName> {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder<string, string>;

export class ForeignKey<TTableName extends string, TForeignTableName extends string> {
	readonly reference: Reference<TTableName, TForeignTableName>;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;

	constructor(
		readonly table: AnyPgTable<{ name: TTableName }>,
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
	TColumns extends AnyPgColumn[],
> = { [Key in keyof TColumns]: AnyPgColumn<{ tableName: TTableName }> };

export type GetColumnsTable<TColumns extends AnyPgColumn | AnyPgColumn[]> = (
	TColumns extends AnyPgColumn ? TColumns
		: TColumns extends AnyPgColumn[] ? TColumns[number]
		: never
) extends AnyPgColumn<{ tableName: infer TTableName extends string }> ? TTableName
	: never;

export type NotUnion<T, T1 = T> = T extends T ? [T1] extends [T] ? T1 : never : never;
export type NotFKBuilderWithUnion<T> = T extends ForeignKeyBuilder<any, infer TForeignTableName>
	? [NotUnion<TForeignTableName>] extends [never] ? 'Only columns from the same table are allowed in foreignColumns' : T
	: never;

export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [AnyPgColumn<{ tableName: TTableName }>, ...AnyPgColumn<{ tableName: TTableName }>[]],
	TForeignColumns extends ColumnsWithTable<TForeignTableName, TColumns>,
>(
	config: () => {
		columns: TColumns;
		foreignColumns: TForeignColumns;
	},
): NotFKBuilderWithUnion<ForeignKeyBuilder<TTableName, TForeignTableName>> {
	function mappedConfig() {
		const { columns, foreignColumns } = config();
		return {
			columns,
			foreignColumns,
		};
	}

	return new ForeignKeyBuilder<TTableName, TForeignTableName>(mappedConfig) as NotFKBuilderWithUnion<
		ForeignKeyBuilder<TTableName, TForeignTableName>
	>;
}
