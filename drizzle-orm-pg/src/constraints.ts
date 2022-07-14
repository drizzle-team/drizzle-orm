import { SQL } from 'drizzle-orm/sql';

import { AnyPgTable } from './table';

export class ConstraintBuilder<TTableName extends string> {
	protected brand!: 'PgConstraintBuilder';

	constructor(public value: SQL<TTableName>) {}

	build(table: AnyPgTable<TTableName>): Constraint<TTableName> {
		return new Constraint(table, this);
	}
}

export type AnyConstraintBuilder = ConstraintBuilder<string>;

export class Constraint<TTableName extends string> {
	value: SQL<TTableName>;

	constructor(public table: AnyPgTable<TTableName>, builder: ConstraintBuilder<TTableName>) {
		this.value = builder.value;
	}
}

export type AnyConstraint = Constraint<string>;

export function constraint<TTableName extends string>(
	value: SQL<TTableName>,
): ConstraintBuilder<TTableName> {
	return new ConstraintBuilder(value);
}
