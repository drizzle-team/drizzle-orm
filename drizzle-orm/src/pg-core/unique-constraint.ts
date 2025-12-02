import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { PgColumn } from './columns/index.ts';
import type { PgTable } from './table.ts';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export function uniqueKeyName(table: PgTable, columns: string[]) {
	return `${table[TableName]}_${columns.join('_')}_unique`;
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'PgUniqueConstraintBuilder';

	/** @internal */
	columns: PgColumn[];
	/** @internal */
	nullsNotDistinctConfig = false;

	constructor(
		columns: PgColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	nullsNotDistinct() {
		this.nullsNotDistinctConfig = true;
		return this;
	}

	/** @internal */
	build(table: PgTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.nullsNotDistinctConfig, this.name);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'PgUniqueOnConstraintBuilder';

	/** @internal */
	name?: string;

	constructor(
		name?: string,
	) {
		this.name = name;
	}

	on(...columns: [PgColumn, ...PgColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'PgUniqueConstraint';

	readonly columns: PgColumn[];
	readonly name?: string;
	readonly isNameExplicit: boolean;
	readonly nullsNotDistinct: boolean = false;

	constructor(readonly table: PgTable, columns: PgColumn[], nullsNotDistinct: boolean, name?: string) {
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
		this.isNameExplicit = !!name;
		this.nullsNotDistinct = nullsNotDistinct;
	}

	getName() {
		return this.name;
	}
}
