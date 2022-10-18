import { SQL } from 'drizzle-orm/sql';
import { PgTable } from './table';

export class CheckBuilder<TTableName extends string> {
	protected brand!: 'PgConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	build(table: AnyPgTable<{ name: TTableName }>): Check<TTableName> {
		return new Check(table, this);
	}
}

export type AnyCheckBuilder<TTableName extends string = string> = CheckBuilder<TTableName>;

export class Check<TTableName extends string> {
	readonly name: string;
	readonly value: SQL;

	constructor(public table: AnyPgTable<{ name: TTableName }>, builder: CheckBuilder<TTableName>) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export type BuildCheck<T extends AnyCheckBuilder> = T extends CheckBuilder<infer TTableName> ? Check<TTableName>
	: never;

export type AnyCheck = Check<string>;

export function check<TTableName extends string>(name: string, value: SQL): CheckBuilder<TTableName> {
	return new CheckBuilder(name, value);
}
