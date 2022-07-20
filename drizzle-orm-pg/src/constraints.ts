import { TableName } from 'drizzle-orm/branded-types';

import { AnyPgSQL } from './sql';
import { AnyPgTable } from './table';

export class ConstraintBuilder<TTableName extends TableName> {
	protected brand!: 'PgConstraintBuilder';

	constructor(public name: string, public value: AnyPgSQL<TTableName>) {}

	build(table: AnyPgTable<TTableName>): Constraint<TTableName> {
		return new Constraint(table, this);
	}
}

export type AnyConstraintBuilder<TTableName extends TableName = TableName> = ConstraintBuilder<TTableName>;

export class Constraint<TTableName extends TableName> {
	name: string;
	value: AnyPgSQL<TTableName>;

	constructor(public table: AnyPgTable<TTableName>, builder: ConstraintBuilder<TTableName>) {
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
	value: AnyPgSQL<TTableName>,
): ConstraintBuilder<TTableName> {
	return new ConstraintBuilder(name, value);
}
