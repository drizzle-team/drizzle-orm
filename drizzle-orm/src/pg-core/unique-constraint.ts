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
	/** @internal */
	_deferrable: 'deferrable' | 'not deferrable' | undefined;
	/** @internal */
	_initially: 'deferred' | 'immediate' | undefined;

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

	deferrable() {
		this._deferrable = 'deferrable';
		return this;
	}

	notDeferrable() {
		this._deferrable = 'not deferrable';
		return this;
	}

	initiallyDeferred() {
		this._initially = 'deferred';
		return this;
	}

	initiallyImmediate() {
		this._initially = 'immediate';
		return this;
	}

	/** @internal */
	build(table: PgTable): UniqueConstraint {
		return new UniqueConstraint(table, this.columns, this.nullsNotDistinctConfig, this.name, this._deferrable, this._initially);
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
	readonly nullsNotDistinct: boolean = false;
	readonly deferrable: 'deferrable' | 'not deferrable' | undefined;
	readonly initially: 'deferred' | 'immediate' | undefined;

	constructor(
		readonly table: PgTable,
		columns: PgColumn[],
		nullsNotDistinct: boolean,
		name?: string,
		deferrable?: 'deferrable' | 'not deferrable',
		initially?: 'deferred' | 'immediate',
	) {
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
		this.nullsNotDistinct = nullsNotDistinct;
		this.deferrable = deferrable;
		this.initially = initially;
	}

	getName() {
		return this.name;
	}
}
