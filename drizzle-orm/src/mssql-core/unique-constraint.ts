import { entityKind } from '~/entity.ts';
import type { MsSqlColumn } from './columns/index.ts';
import type { MsSqlTable } from './table.ts';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'MsSqlUniqueConstraintBuilder';

	/** @internal */
	columns: MsSqlColumn[];

	constructor(
		columns: MsSqlColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: MsSqlTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'MsSqlUniqueOnConstraintBuilder';

	/** @internal */
	name?: string;

	constructor(
		name?: string,
	) {
		this.name = name;
	}

	on(...columns: [MsSqlColumn, ...MsSqlColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'MsSqlUniqueConstraint';

	readonly columns: MsSqlColumn[];
	readonly name?: string;
	readonly nullsNotDistinct: boolean = false;
	readonly isNameExplicit: boolean;

	constructor(readonly table: MsSqlTable, columns: MsSqlColumn[], name?: string) {
		this.columns = columns;
		this.name = name;
		this.isNameExplicit = !!name;
	}

	getName() {
		return this.name;
	}
}
