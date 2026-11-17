import { entityKind, is } from '~/entity.ts';
import type { CockroachColumn } from './columns/index.ts';
import type { CockroachTable } from './table.ts';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'CockroachUniqueConstraintBuilder';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	/** @internal */
	columns: CockroachColumn[];

	constructor(
		columns: CockroachColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: CockroachTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'CockroachUniqueOnConstraintBuilder';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	/** @internal */
	name?: string;

	constructor(
		name?: string,
	) {
		this.name = name;
	}

	on(...columns: [CockroachColumn, ...CockroachColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'CockroachUniqueConstraint';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	readonly columns: CockroachColumn[];
	readonly name?: string;
	readonly isNameExplicit: boolean;

	constructor(
		readonly table: CockroachTable,
		columns: CockroachColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
		this.isNameExplicit = !!name;
	}

	getName(): string | undefined {
		return this.name;
	}
}
