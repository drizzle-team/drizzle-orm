import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/index.ts';
import type { CockroachDbTable } from './table.ts';

export class CheckBuilder {
	static readonly [entityKind]: string = 'CockroachDbCheckBuilder';

	protected brand!: 'CockroachDbConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	/** @internal */
	build(table: CockroachDbTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	static readonly [entityKind]: string = 'CockroachDbCheck';

	readonly name: string;
	readonly value: SQL;

	constructor(public table: CockroachDbTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
