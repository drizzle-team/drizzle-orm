import { entityKind } from '~/entity.ts';
import type { AnyCockroachDbColumn, CockroachDbColumn } from './columns/index.ts';
import type { CockroachDbTable } from './table.ts';

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

export type Reference = () => {
	readonly name?: string;
	readonly columns: CockroachDbColumn[];
	readonly foreignTable: CockroachDbTable;
	readonly foreignColumns: CockroachDbColumn[];
};

export class ForeignKeyBuilder {
	static readonly [entityKind]: string = 'CockroachDbForeignKeyBuilder';

	/** @internal */
	reference: Reference;

	/** @internal */
	_onUpdate: UpdateDeleteAction | undefined = 'no action';

	/** @internal */
	_onDelete: UpdateDeleteAction | undefined = 'no action';

	constructor(
		config: () => {
			name?: string;
			columns: CockroachDbColumn[];
			foreignColumns: CockroachDbColumn[];
		},
		actions?: {
			onUpdate?: UpdateDeleteAction;
			onDelete?: UpdateDeleteAction;
		} | undefined,
	) {
		this.reference = () => {
			const { name, columns, foreignColumns } = config();
			return { name, columns, foreignTable: foreignColumns[0]!.table as CockroachDbTable, foreignColumns };
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
	build(table: CockroachDbTable): ForeignKey {
		return new ForeignKey(table, this);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder;

export class ForeignKey {
	static readonly [entityKind]: string = 'CockroachDbForeignKey';

	readonly reference: Reference;
	readonly onUpdate: UpdateDeleteAction | undefined;
	readonly onDelete: UpdateDeleteAction | undefined;
	readonly name?: string;

	constructor(readonly table: CockroachDbTable, builder: ForeignKeyBuilder) {
		this.reference = builder.reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}

	getName(): string | undefined {
		const { name } = this.reference();

		return name;
	}
}

type ColumnsWithTable<
	TTableName extends string,
	TColumns extends CockroachDbColumn[],
> = { [Key in keyof TColumns]: AnyCockroachDbColumn<{ tableName: TTableName }> };

export function foreignKey<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends [
		AnyCockroachDbColumn<{ tableName: TTableName }>,
		...AnyCockroachDbColumn<{ tableName: TTableName }>[],
	],
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
