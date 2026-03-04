import { entityKind } from '~/entity.ts';
import { Table } from '~/table.ts';
import type { SurrealDBColumn } from './columns/common.ts';
import type { SurrealDBTable } from './table.ts';

export function uniqueKeyName(table: SurrealDBTable, columns: string[]) {
	return `${table[Table.Symbol.Name]}_${columns.join('_')}_unique`;
}

export function uniqueConstraint(name: string): UniqueConstraintBuilderOn {
	return new UniqueConstraintBuilderOn(name);
}

export class UniqueConstraintBuilderOn {
	static readonly [entityKind]: string = 'SurrealDBUniqueConstraintBuilderOn';

	constructor(private name: string) {}

	on(...columns: [SurrealDBColumn, ...SurrealDBColumn[]]): UniqueConstraintBuilder {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export interface AnyUniqueConstraintBuilder {
	build(table: SurrealDBTable): UniqueConstraint;
}

export class UniqueConstraintBuilder implements AnyUniqueConstraintBuilder {
	static readonly [entityKind]: string = 'SurrealDBUniqueConstraintBuilder';

	/** @internal */
	columns: SurrealDBColumn[];
	/** @internal */
	name: string;

	constructor(columns: SurrealDBColumn[], name: string) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: SurrealDBTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'SurrealDBUniqueConstraint';

	readonly columns: SurrealDBColumn[];
	readonly name: string;

	constructor(readonly table: SurrealDBTable, columns: SurrealDBColumn[], name: string) {
		this.columns = columns;
		this.name = name;
	}
}
