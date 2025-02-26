import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { GoogleSqlColumn } from './columns/index.ts';
import type { GoogleSqlTable } from './table.ts';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export function uniqueKeyName(table: GoogleSqlTable, columns: string[]) {
	return `${table[TableName]}_${columns.join('_')}_unique`;
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'GoogleSqlUniqueConstraintBuilder';

	/** @internal */
	columns: GoogleSqlColumn[];

	constructor(
		columns: GoogleSqlColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: GoogleSqlTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'GoogleSqlUniqueOnConstraintBuilder';

	/** @internal */
	name?: string;

	constructor(
		name?: string,
	) {
		this.name = name;
	}

	on(...columns: [GoogleSqlColumn, ...GoogleSqlColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'GoogleSqlUniqueConstraint';

	readonly columns: GoogleSqlColumn[];
	readonly name?: string;
	readonly nullsNotDistinct: boolean = false;

	constructor(readonly table: GoogleSqlTable, columns: GoogleSqlColumn[], name?: string) {
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
	}

	getName() {
		return this.name;
	}
}
