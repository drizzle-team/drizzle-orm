import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { AnyDSQLColumn } from './columns/common.ts';
import type { DSQLTable } from './table.ts';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export function uniqueKeyName(table: DSQLTable, columns: string[]) {
	return `${table[TableName]}_${columns.join('_')}_unique`;
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'DSQLUniqueConstraintBuilder';

	/** @internal */
	columns: AnyDSQLColumn[];
	/** @internal */
	nullsNotDistinctConfig = false;

	constructor(
		columns: AnyDSQLColumn[],
		private _name?: string,
	) {
		this.columns = columns;
	}

	nullsNotDistinct() {
		this.nullsNotDistinctConfig = true;
		return this;
	}

	/** @internal */
	build(table: DSQLTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.nullsNotDistinctConfig, this._name);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'DSQLUniqueOnConstraintBuilder';

	/** @internal */
	name?: string;

	constructor(name?: string) {
		this.name = name;
	}

	on(...columns: [AnyDSQLColumn, ...AnyDSQLColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'DSQLUniqueConstraint';

	readonly columns: AnyDSQLColumn[];
	readonly name?: string;
	readonly nullsNotDistinct: boolean = false;

	constructor(readonly table: DSQLTable, columns: AnyDSQLColumn[], nullsNotDistinct: boolean, name?: string) {
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
		this.nullsNotDistinct = nullsNotDistinct;
	}

	getName() {
		return this.name;
	}
}
