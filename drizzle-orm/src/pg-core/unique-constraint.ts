import { entityKind } from '~/entity';
import type { AnyPgColumn } from './columns';
import { PgTable, type AnyPgTable } from './table';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export function uniqueKeyName(table: AnyPgTable, columns: string[]) {
	return `${table[PgTable.Symbol.Name]}_${columns.join('_')}_unique`
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'PgUniqueConstraintBuilder';

	/** @internal */
	columns: AnyPgColumn<{}>[];
	/** @internal */
	nullsNotDistinctConfig = false;

	constructor(
		columns: AnyPgColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	nullsNotDistinct() {
		this.nullsNotDistinctConfig = true;
		return this;
	}

	/** @internal */
	build(table: AnyPgTable): UniqueConstraint {
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

	on(...columns: [AnyPgColumn, ...AnyPgColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'PgUniqueConstraint';

	readonly columns: AnyPgColumn<{}>[];
	readonly name?: string;
	readonly nullsNotDistinct: boolean = false;

	constructor(readonly table: AnyPgTable, columns: AnyPgColumn<{}>[], nullsNotDistinct: boolean, name?: string) {
		this.columns = columns;
		this.name = name;
		this.nullsNotDistinct = nullsNotDistinct;
	}

	getName() {
		return this.name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
	}
}
