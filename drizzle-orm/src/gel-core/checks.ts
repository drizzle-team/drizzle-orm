import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/index.ts';
import type { GelTable } from './table.ts';

export class CheckBuilder {
	static readonly [entityKind]: string = 'GelCheckBuilder';

	protected brand!: 'GelConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	/** @internal */
	build(table: GelTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	static readonly [entityKind]: string = 'GelCheck';

	readonly name: string;
	readonly value: SQL;

	constructor(public table: GelTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
