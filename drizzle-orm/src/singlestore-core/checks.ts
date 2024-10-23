import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { SingleStoreTable } from './table.ts';

export class CheckBuilder {
	static readonly [entityKind]: string = 'SingleStoreCheckBuilder';

	protected brand!: 'SingleStoreConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	/** @internal */
	build(table: SingleStoreTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	static readonly [entityKind]: string = 'SingleStoreCheck';

	readonly name: string;
	readonly value: SQL;

	constructor(public table: SingleStoreTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
