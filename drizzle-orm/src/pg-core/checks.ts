import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/index.ts';
import type { PgTable } from './table.ts';

export class CheckBuilder {
	static readonly [entityKind]: string = 'PgCheckBuilder';

	protected brand!: 'PgConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	/** @internal */
	build(table: PgTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	static readonly [entityKind]: string = 'PgCheck';

	readonly name: string;
	readonly value: SQL;

	constructor(public table: PgTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
