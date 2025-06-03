import { entityKind } from '~/entity.ts';
import type { CockroachDbColumn } from './columns/index.ts';
import type { CockroachDbTable } from './table.ts';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'CockroachDbUniqueConstraintBuilder';

	/** @internal */
	columns: CockroachDbColumn[];

	constructor(
		columns: CockroachDbColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: CockroachDbTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'CockroachDbUniqueOnConstraintBuilder';

	/** @internal */
	name?: string;

	constructor(
		name?: string,
	) {
		this.name = name;
	}

	on(...columns: [CockroachDbColumn, ...CockroachDbColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'CockroachDbUniqueConstraint';

	readonly columns: CockroachDbColumn[];
	readonly name?: string;
	readonly explicitName: boolean;

	constructor(
		readonly table: CockroachDbTable,
		columns: CockroachDbColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
		this.explicitName = name ? true : false;
	}

	getName(): string | undefined {
		return this.name;
	}
}
