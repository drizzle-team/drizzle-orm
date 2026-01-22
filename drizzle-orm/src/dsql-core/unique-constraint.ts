import { entityKind } from '~/entity.ts';
import type { AnyDSQLColumn } from './columns/common.ts';
import type { DSQLTable } from './table.ts';

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'DSQLUniqueConstraintBuilder';

	constructor(columns: AnyDSQLColumn[], name?: string) {
		throw new Error('Method not implemented.');
	}

	nullsNotDistinct(): this {
		throw new Error('Method not implemented.');
	}

	/** @internal */
	build(table: DSQLTable): UniqueConstraint {
		throw new Error('Method not implemented.');
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'DSQLUniqueConstraint';

	readonly columns: AnyDSQLColumn[];
	readonly name?: string;
	readonly nullsNotDistinct: boolean;

	constructor(table: DSQLTable, columns: AnyDSQLColumn[], nullsNotDistinct: boolean, name?: string) {
		throw new Error('Method not implemented.');
	}

	getName(): string {
		throw new Error('Method not implemented.');
	}
}

export function unique(name?: string): {
	on: (...columns: AnyDSQLColumn[]) => UniqueConstraintBuilder;
} {
	throw new Error('Method not implemented.');
}
