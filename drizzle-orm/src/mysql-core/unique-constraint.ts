import { entityKind } from '~/entity';
import type { AnyMySqlColumn } from './columns';
import { type AnyMySqlTable, MySqlTable } from './table';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export function uniqueKeyName(table: AnyMySqlTable, columns: string[]) {
	return `${table[MySqlTable.Symbol.Name]}_${columns.join('_')}_unique`
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'MySqlUniqueConstraintBuilder';

	/** @internal */
	columns: AnyMySqlColumn<{}>[];

	constructor(
		columns: AnyMySqlColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: AnyMySqlTable): UniqueConstraint {
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

	on(...columns: [AnyMySqlColumn, ...AnyMySqlColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'MySqlUniqueConstraint';

	readonly columns: AnyMySqlColumn<{}>[];
	readonly name?: string;
	readonly nullsNotDistinct: boolean = false;

	constructor(readonly table: AnyMySqlTable, columns: AnyMySqlColumn<{}>[], name?: string) {
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
	}

	getName() {
		return this.name;
	}
}
