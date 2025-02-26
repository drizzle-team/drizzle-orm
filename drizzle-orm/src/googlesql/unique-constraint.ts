import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { MySqlColumn } from './columns/index.ts';
import type { MySqlTable } from './table.ts';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export function uniqueKeyName(table: MySqlTable, columns: string[]) {
	return `${table[TableName]}_${columns.join('_')}_unique`;
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'MySqlUniqueConstraintBuilder';

	/** @internal */
	columns: MySqlColumn[];

	constructor(
		columns: MySqlColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: MySqlTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'MySqlUniqueOnConstraintBuilder';

	/** @internal */
	name?: string;

	constructor(
		name?: string,
	) {
		this.name = name;
	}

	on(...columns: [MySqlColumn, ...MySqlColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'MySqlUniqueConstraint';

	readonly columns: MySqlColumn[];
	readonly name?: string;
	readonly nullsNotDistinct: boolean = false;

	constructor(readonly table: MySqlTable, columns: MySqlColumn[], name?: string) {
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
	}

	getName() {
		return this.name;
	}
}
