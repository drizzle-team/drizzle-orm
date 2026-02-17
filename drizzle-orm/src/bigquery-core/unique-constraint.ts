import { entityKind } from '~/entity.ts';
import { TableName } from '~/table.utils.ts';
import type { BigQueryColumn } from './columns/index.ts';
import type { BigQueryTable } from './table.ts';

export function unique(name?: string): UniqueOnConstraintBuilder {
	return new UniqueOnConstraintBuilder(name);
}

export function uniqueKeyName(table: BigQueryTable, columns: string[]) {
	return `${table[TableName]}_${columns.join('_')}_unique`;
}

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'BigQueryUniqueConstraintBuilder';

	/** @internal */
	columns: BigQueryColumn[];

	constructor(
		columns: BigQueryColumn[],
		private name?: string,
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: BigQueryTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.name);
	}
}

export class UniqueOnConstraintBuilder {
	static readonly [entityKind]: string = 'BigQueryUniqueOnConstraintBuilder';

	/** @internal */
	name?: string;

	constructor(
		name?: string,
	) {
		this.name = name;
	}

	on(...columns: [BigQueryColumn, ...BigQueryColumn[]]) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'BigQueryUniqueConstraint';

	readonly columns: BigQueryColumn[];
	readonly name?: string;
	readonly nullsNotDistinct: boolean = false;

	constructor(readonly table: BigQueryTable, columns: BigQueryColumn[], name?: string) {
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
	}

	getName() {
		return this.name;
	}
}
