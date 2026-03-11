import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { AnyDSQLColumn } from './columns/common.ts';
import type { DSQLTable } from './table.ts';

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'DSQLPrimaryKeyBuilder';

	/** @internal */
	columns: AnyDSQLColumn[];
	/** @internal */
	_name?: string;

	constructor(columns: AnyDSQLColumn[], name?: string) {
		this.columns = columns;
		this._name = name;
	}

	/** @internal */
	build(table: DSQLTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this._name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'DSQLPrimaryKey';

	readonly columns: AnyDSQLColumn[];
	readonly name?: string;
	readonly isNameExplicit: boolean;

	constructor(table: DSQLTable, columns: AnyDSQLColumn[], name?: string) {
		if (columns.length === 0) {
			throw new Error('Primary key must include at least one column');
		}
		this.columns = columns;
		this.name = name ?? `${table[TableName]}_${columns.map((c) => c.name).join('_')}_pk`;
		this.isNameExplicit = !!name;
	}

	getName(): string {
		return this.name!;
	}
}

export function primaryKey<TColumns extends AnyDSQLColumn[]>(config: {
	columns: TColumns;
	name?: string;
}): PrimaryKeyBuilder {
	return new PrimaryKeyBuilder(config.columns, config.name);
}
