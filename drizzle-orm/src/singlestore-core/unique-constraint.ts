import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { SingleStoreColumn } from './columns/index.ts';
import type { SingleStoreTable } from './table.ts';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export function uniqueKeyName(table: SingleStoreTable, columns: string[]) {
	return `${table[TableName]}_${columns.join('_')}_unique`;
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'SingleStoreUniqueConstraintBuilder';

	/** @internal */
	columns: SingleStoreColumn[];

	constructor(
		columns: SingleStoreColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: SingleStoreTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'SingleStoreUniqueOnConstraintBuilder';

	/** @internal */
	name?: string;

	constructor(
		name?: string,
	) {
		this.name = name;
	}

	on(...columns: [SingleStoreColumn, ...SingleStoreColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'SingleStoreUniqueConstraint';

	readonly columns: SingleStoreColumn[];
	readonly name: string;
	readonly nullsNotDistinct: boolean = false;
	readonly isNameExplicit: boolean;

	constructor(readonly table: SingleStoreTable, columns: SingleStoreColumn[], name?: string) {
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
		this.isNameExplicit = !!name;
	}

	getName() {
		return this.name;
	}
}
