import { SQL } from 'drizzle-orm/sql';
import { AnyPgTable } from './table';

export class CheckBuilder {
	protected brand!: 'PgConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	build(table: AnyPgTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	readonly name: string;
	readonly value: SQL;

	constructor(public table: AnyPgTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
