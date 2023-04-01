import type { SQL } from '~/sql';
import type { AnySQLiteTable } from './table';

export class CheckBuilder {
	protected brand!: 'SQLiteConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	build(table: AnySQLiteTable): Check {
		return new Check(table, this);
	}
}

export class Check {
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

export function check<TTableName extends string>(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
