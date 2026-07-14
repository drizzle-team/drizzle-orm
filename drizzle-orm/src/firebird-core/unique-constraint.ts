import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { FirebirdColumn } from './columns/common.ts';
import type { FirebirdTable } from './table.ts';

export function uniqueKeyName(table: FirebirdTable, columns: string[]) {
	return `${table[TableName]}_${columns.join('_')}_unique`;
}

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'FirebirdUniqueConstraintBuilder';

	/** @internal */
	columns: FirebirdColumn[];

	constructor(
		columns: FirebirdColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: FirebirdTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'FirebirdUniqueOnConstraintBuilder';

	/** @internal */
	name?: string;

	constructor(
		name?: string,
	) {
		this.name = name;
	}

	on(...columns: [FirebirdColumn, ...FirebirdColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'FirebirdUniqueConstraint';

	readonly columns: FirebirdColumn[];
	readonly name?: string;

	constructor(readonly table: FirebirdTable, columns: FirebirdColumn[], name?: string) {
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
	}

	getName() {
		return this.name;
	}
}
