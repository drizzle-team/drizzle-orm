import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { MsSqlTable } from './table.ts';

export class CheckBuilder {
	static readonly [entityKind]: string = 'MsSqlCheckBuilder';

	protected brand!: 'MsSqlConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	/** @internal */
	build(table: MsSqlTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	static readonly [entityKind]: string = 'MsSqlCheck';

	readonly name: string;
	readonly value: SQL;

	constructor(public table: MsSqlTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
