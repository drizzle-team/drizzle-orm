import { TableName } from 'drizzle-orm/branded-types';

import { AnyPgSQL } from './sql';
import { AnyPgTable } from './table';

export class CheckBuilder<TTableName extends TableName> {
	protected brand!: 'PgConstraintBuilder';

	constructor(public name: string, public value: AnyPgSQL<TTableName>) {}

	build(table: AnyPgTable<TTableName>): Check<TTableName> {
		return new Check(table, this);
	}
}

export type AnyCheckBuilder<TTableName extends TableName = TableName> = CheckBuilder<TTableName>;

export class Check<TTableName extends TableName> {
	readonly name: string;
	readonly value: AnyPgSQL<TTableName>;

	constructor(public table: AnyPgTable<TTableName>, builder: CheckBuilder<TTableName>) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export type BuildCheck<T extends AnyCheckBuilder> = T extends CheckBuilder<
	infer TTableName
> ? Check<TTableName>
	: never;

export type AnyCheck = Check<TableName>;

export function check<TTableName extends TableName>(
	name: string,
	value: AnyPgSQL<TTableName>,
): CheckBuilder<TTableName> {
	return new CheckBuilder(name, value);
}
