import { TableName } from 'drizzle-orm/branded-types';

import { AnySQLiteSQL } from './sql';
import { AnySQLiteTable } from './table';

export class CheckBuilder<TTableName extends TableName> {
	protected brand!: 'SQLiteConstraintBuilder';

	constructor(public name: string, public value: AnySQLiteSQL<TTableName>) {}

	build(table: AnySQLiteTable<TTableName>): Check<TTableName> {
		return new Check(table, this);
	}
}

export type AnyCheckBuilder<TTableName extends TableName = TableName> = CheckBuilder<TTableName>;

export class Check<TTableName extends TableName> {
	readonly name: string;
	readonly value: AnySQLiteSQL<TTableName>;

	constructor(public table: AnySQLiteTable<TTableName>, builder: CheckBuilder<TTableName>) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export type BuildCheck<T extends AnyCheckBuilder> = T extends CheckBuilder<
	infer TTableName
> ? Check<TTableName>
	: never;

export type AnyConstraint = Check<TableName>;

export function check<TTableName extends TableName>(
	name: string,
	value: AnySQLiteSQL<TTableName>,
): CheckBuilder<TTableName> {
	return new CheckBuilder(name, value);
}
