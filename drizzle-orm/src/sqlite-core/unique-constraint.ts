import { entityKind } from '~/entity';
import { type AnySQLiteTable, SQLiteTable } from './table';
import { type AnySQLiteColumn } from './columns';

export function unique(): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder();
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
		return new UniqueConstraint(table, this.columns);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'SQLiteUniqueOnConstraintBuilder';

	on(...columns: [AnySQLiteColumn, ...AnySQLiteColumn[]]) {
		return new UniqueConstraintBuilder(columns);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'SQLiteUniqueConstraint';

	readonly columns: AnySQLiteColumn<{}>[];

	constructor(readonly table: AnySQLiteTable, columns: AnySQLiteColumn<{}>[]) {
		this.columns = columns;
	}

	getName() {
		return `${this.table[SQLiteTable.Symbol.Name]}_${this.columns.join('_')}_unique`;
	}
}
