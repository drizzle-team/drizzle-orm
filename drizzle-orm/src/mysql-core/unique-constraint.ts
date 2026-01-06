import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { MySqlColumn } from './columns/index.ts';
import type { MySqlTable } from './table.ts';

export function unique<TName extends string | undefined = undefined>(name?: TName): UniqueOnConstraintBuilder<TName> {
	return new UniqueOnConstraintBuilder<TName>(name);
}

export function uniqueKeyName(table: MySqlTable, columns: string[]) {
	return `${table[TableName]}_${columns.join('_')}_unique`;
}

export class UniqueConstraintBuilder<TName extends string | undefined = undefined> {
	static readonly [entityKind]: string = 'MySqlUniqueConstraintBuilder';

	/** @internal */
	columns: MySqlColumn[];
	/** @internal */
	name?: TName;

	constructor(
		columns: MySqlColumn[],
		name?: TName,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: MySqlTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name);
	}
}

export class UniqueOnConstraintBuilder<TName extends string | undefined = undefined> {
	static readonly [entityKind]: string = 'MySqlUniqueOnConstraintBuilder';

	/** @internal */
	name?: TName;

	constructor(
		name?: TName,
	) {
		this.name = name;
	}

	on(...columns: [MySqlColumn, ...MySqlColumn[]]) {
		return new UniqueConstraintBuilder<TName>(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'MySqlUniqueConstraint';

	readonly columns: MySqlColumn[];
	readonly name: string;
	readonly isNameExplicit: boolean;
	readonly nullsNotDistinct: boolean = false;

	constructor(readonly table: MySqlTable, columns: MySqlColumn[], name?: string) {
		this.columns = columns;
		this.isNameExplicit = !!name;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
	}

	getName() {
		return this.name;
	}
}
