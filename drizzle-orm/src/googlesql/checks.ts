import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { GoogleSqlTable } from './table.ts';

export class CheckBuilder {
	static readonly [entityKind]: string = 'GoogleSqlCheckBuilder';

	protected brand!: 'GoogleSqlConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	/** @internal */
	build(table: GoogleSqlTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	static readonly [entityKind]: string = 'GoogleSqlCheck';

	readonly name: string;
	readonly value: SQL;

	constructor(public table: GoogleSqlTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
