import { entityKind } from '~/entity';
import type { SQL } from '~/sql';
import type { MySqlTable } from './table';

export class CheckBuilder {
	static readonly [entityKind]: string = 'MySqlCheckBuilder';

	protected brand!: 'MySqlConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	/** @internal */
	build(table: MySqlTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	static readonly [entityKind]: string = 'MySqlCheck';

	readonly name: string;
	readonly value: SQL;

	constructor(public table: MySqlTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
