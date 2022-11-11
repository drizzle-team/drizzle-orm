import { TableName } from 'drizzle-orm/branded-types';
import { MySQL } from './sql';
import { AnyMySqlTable } from './table';

export class CheckBuilder<TTableName extends string> {
	protected brand!: 'MySqlConstraintBuilder';

	constructor(public name: string, public value: MySQL<TTableName>) {}

	build(table: AnyMySqlTable<TTableName>): Check<TTableName> {
		return new Check(table, this);
	}
}

export type AnyCheckBuilder<TTableName extends string = string> = CheckBuilder<TTableName>;

export class Check<TTableName extends string> {
	readonly name: string;
	readonly value: MySQL<TTableName>;

	constructor(public table: AnyMySqlTable<TTableName>, builder: CheckBuilder<TTableName>) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export type BuildCheck<T extends AnyCheckBuilder> = T extends CheckBuilder<
	infer TTableName
> ? Check<TTableName>
	: never;

export type AnyConstraint = Check<string>;

export function check<TTableName extends string>(
	name: string,
	value: MySQL<TTableName>,
): CheckBuilder<TTableName> {
	return new CheckBuilder(name, value);
}
