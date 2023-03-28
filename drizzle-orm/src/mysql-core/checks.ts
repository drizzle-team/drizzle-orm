import type { SQL } from '~/sql';
import type { AnyMySqlTable } from './table';

export class CheckBuilder {
	protected brand!: 'MySqlConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	/** @internal */
	build(table: AnyMySqlTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	readonly name: string;
	readonly value: SQL;

	constructor(public table: AnyMySqlTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
