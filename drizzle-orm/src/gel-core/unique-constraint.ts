import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { GelColumn } from './columns/index.ts';
import type { GelTable } from './table.ts';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export function uniqueKeyName(table: GelTable, columns: string[]) {
	return `${table[TableName]}_${columns.join('_')}_unique`;
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'GelUniqueConstraintBuilder';

	/** @internal */
	columns: GelColumn[];
	/** @internal */
	nullsNotDistinctConfig = false;

	constructor(
		columns: GelColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	nullsNotDistinct() {
		this.nullsNotDistinctConfig = true;
		return this;
	}

	/** @internal */
	build(table: GelTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.nullsNotDistinctConfig, this.name);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'GelUniqueOnConstraintBuilder';

	/** @internal */
	name?: string;

	constructor(
		name?: string,
	) {
		this.name = name;
	}

	on(...columns: [GelColumn, ...GelColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'GelUniqueConstraint';

	readonly columns: GelColumn[];
	readonly name?: string;
	readonly nullsNotDistinct: boolean = false;

	constructor(readonly table: GelTable, columns: GelColumn[], nullsNotDistinct: boolean, name?: string) {
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
		this.nullsNotDistinct = nullsNotDistinct;
	}

	getName() {
		return this.name;
	}
}
