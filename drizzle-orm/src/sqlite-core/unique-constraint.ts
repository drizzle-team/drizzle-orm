import { entityKind } from '~/entity';
import { type AnySQLiteTable, SQLiteTable } from './table';
import { type AnySQLiteColumn } from './columns';

export function uniqueKeyName(table: AnySQLiteTable, columns: string[]) {
	return `${table[SQLiteTable.Symbol.Name]}_${columns.join('_')}_unique`
}

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'SQLiteUniqueConstraintBuilder';

	/** @internal */
	columns: AnySQLiteColumn<{}>[];

	constructor(
		columns: AnySQLiteColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: AnySQLiteTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name);
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

	on(...columns: [AnySQLiteColumn, ...AnySQLiteColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'SQLiteUniqueConstraint';

	readonly columns: AnySQLiteColumn<{}>[];
	readonly name?: string;

	constructor(readonly table: AnySQLiteTable, columns: AnySQLiteColumn<{}>[], name?: string) {
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
	}

	getName() {
		return this.name;
	}
}
