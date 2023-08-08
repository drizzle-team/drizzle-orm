import { entityKind } from '~/entity';
import type { SQL } from '~/sql';
import type { AnySQLiteTable } from './table';

export class CheckBuilder {
	static readonly [entityKind]: string = 'SQLiteCheckBuilder';

	protected brand!: 'SQLiteConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	build(table: AnySQLiteTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	static readonly [entityKind]: string = 'SQLiteCheck';

	declare _: {
		brand: 'SQLiteCheck';
	};

	readonly name: string;
	readonly value: SQL;

	constructor(public table: AnySQLiteTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
