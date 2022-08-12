import { TableName } from 'drizzle-orm/branded-types';
import { AnyMySQL } from './sql';
import { AnyMySqlTable } from './table';

export class CheckBuilder<TTableName extends TableName> {
	protected brand!: 'MySqlConstraintBuilder';

	constructor(public name: string, public value: AnyMySQL<TTableName>) {}

	build(table: AnyMySqlTable<TTableName>): Check<TTableName> {
		return new Check(table, this);
	}
}

export type AnyCheckBuilder<TTableName extends TableName = TableName> = CheckBuilder<TTableName>;

export class Check<TTableName extends TableName> {
	readonly name: string;
	readonly value: AnyMySQL<TTableName>;

	constructor(public table: AnyMySqlTable<TTableName>, builder: CheckBuilder<TTableName>) {
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
	value: AnyMySQL<TTableName>,
): CheckBuilder<TTableName> {
	return new CheckBuilder(name, value);
}
