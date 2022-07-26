import { TableName } from 'drizzle-orm/branded-types';

import { AnyMySQL } from './sql';
import { AnyMySqlTable } from './table';

export class ConstraintBuilder<TTableName extends TableName> {
	protected brand!: 'PgConstraintBuilder';

	constructor(public name: string, public value: AnyMySQL<TTableName>) {}

	build(table: AnyMySqlTable<TTableName>): Constraint<TTableName> {
		return new Constraint(table, this);
	}
}

export type AnyConstraintBuilder<TTableName extends TableName = TableName> = ConstraintBuilder<TTableName>;

export class Constraint<TTableName extends TableName> {
	name: string;
	value: AnyMySQL<TTableName>;

	constructor(public table: AnyMySqlTable<TTableName>, builder: ConstraintBuilder<TTableName>) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export type BuildConstraint<T extends AnyConstraintBuilder> = T extends ConstraintBuilder<
	infer TTableName
> ? Constraint<TTableName>
	: never;

export type AnyConstraint = Constraint<TableName>;

export function constraint<TTableName extends TableName>(
	name: string,
	value: AnyMySQL<TTableName>,
): ConstraintBuilder<TTableName> {
	return new ConstraintBuilder(name, value);
}
