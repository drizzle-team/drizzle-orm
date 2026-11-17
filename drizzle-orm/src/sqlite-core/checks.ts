import { entityKind, is } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { SQLiteTable } from './table.ts';

export class CheckBuilder {
	static readonly [entityKind]: string = 'SQLiteCheckBuilder';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	protected brand!: 'SQLiteConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	build(table: SQLiteTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	static readonly [entityKind]: string = 'SQLiteCheck';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare _: {
		brand: 'SQLiteCheck';
	};

	readonly name: string;
	readonly value: SQL;

	constructor(public table: SQLiteTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
