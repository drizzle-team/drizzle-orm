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
		return new Check(table, this);
	}
}

export class Check {
	static readonly [entityKind]: string = 'DSQLCheck';

	readonly name: string;
	readonly value: SQL;

	constructor(_table: DSQLTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
