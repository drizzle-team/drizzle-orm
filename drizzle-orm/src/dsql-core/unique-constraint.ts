import { entityKind } from '~/entity.ts';
import type { AnyDSQLColumn } from './columns/common.ts';
import type { DSQLTable } from './table.ts';

export class UniqueConstraintBuilder {
	static readonly [entityKind]: string = 'DSQLUniqueConstraintBuilder';

	constructor(_columns: AnyDSQLColumn[], _name?: string) {
		throw new Error('Method not implemented.');
	}

	nullsNotDistinct(): this {
		throw new Error('Method not implemented.');
	}

	/** @internal */
	build(_table: DSQLTable): UniqueConstraint {
		throw new Error('Method not implemented.');
	}
}

export class UniqueConstraint {
	static readonly [entityKind]: string = 'DSQLUniqueConstraint';

	readonly columns: AnyDSQLColumn[];
	readonly _name?: string;
	readonly _nullsNotDistinct: boolean;

	constructor(_table: DSQLTable, _columns: AnyDSQLColumn[], __nullsNotDistinct: boolean, __name?: string) {
		throw new Error('Method not implemented.');
	}

	getName(): string {
		throw new Error('Method not implemented.');
	}
}

export function unique(_name?: string): {
	on: (...columns: AnyDSQLColumn[]) => UniqueConstraintBuilder;
} {
	throw new Error('Method not implemented.');
}
