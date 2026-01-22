import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { DSQLTable } from './table.ts';

export class CheckBuilder {
	static readonly [entityKind]: string = 'DSQLCheckBuilder';

	readonly name: string;
	readonly value: SQL;

	constructor(name: string, value: SQL) {
		this.name = name;
		this.value = value;
	}

	/** @internal */
	build(table: DSQLTable): Check {
		throw new Error('Method not implemented.');
	}
}

export class Check {
	static readonly [entityKind]: string = 'DSQLCheck';

	readonly name: string;
	readonly value: SQL;

	constructor(table: DSQLTable, builder: CheckBuilder) {
		throw new Error('Method not implemented.');
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
