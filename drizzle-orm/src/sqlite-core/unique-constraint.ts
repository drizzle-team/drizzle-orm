import type { CasingCache } from '~/casing.ts';
import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { SQLiteColumn } from './columns/common.ts';
import type { SQLiteTable } from './table.ts';

export function uniqueKeyName(table: SQLiteTable, columns: string[]) {
	return `${table[TableName]}_${columns.join('_')}_unique`;
}

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'SQLiteUniqueConstraintBuilder';

	/** @internal */
	columns: SQLiteColumn[];

	constructor(
		columns: SQLiteColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: SQLiteTable, casing?: CasingCache): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name, casing);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'SQLiteUniqueOnConstraintBuilder';

	/** @internal */
	name?: string;

	constructor(
		name?: string,
	) {
		this.name = name;
	}

	on(...columns: [SQLiteColumn, ...SQLiteColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'SQLiteUniqueConstraint';

	readonly columns: SQLiteColumn[];
	readonly name?: string;

	constructor(readonly table: SQLiteTable, columns: SQLiteColumn[], name?: string, casing?: CasingCache) {
		this.columns = columns;
		this.name = name
			?? uniqueKeyName(
				this.table,
				casing
					? this.columns.map((column) => casing.getColumnCasing(column))
					: this.columns.map((column) => column.name),
			);
	}

	getName() {
		return this.name;
	}
}
