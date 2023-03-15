import type { AnySQLiteColumn } from './columns';

import type { AnySQLiteTable } from './table';

export class UniqueBuilder<TTableName extends string> {
	protected brand!: 'SQLiteConstraintBuilder';

	constructor(public name: string, public column: AnySQLiteColumn) {}

	/** @internal */
	build(table: AnySQLiteTable<{ name: TTableName }>): Unique<TTableName> {
		return new Unique(table, this);
	}
}

export type AnyUniqueBuilder<TTableName extends string = string> = UniqueBuilder<TTableName>;

export class Unique<TTableName extends string> {
	readonly name: string;
	readonly column: AnySQLiteColumn;

	constructor(public table: AnySQLiteTable<{ name: TTableName }>, builder: UniqueBuilder<TTableName>) {
		this.name = builder.name;
		this.column = builder.column;
	}
}

export type BuildUnique<T extends AnyUniqueBuilder> = T extends UniqueBuilder<
	infer TTableName
> ? Unique<TTableName>
	: never;

export type AnyUnique = Unique<string>;

export function unique<TTableName extends string>(
	name: string,
	column: AnySQLiteColumn<{ tableName: TTableName }>,
): UniqueBuilder<TTableName> {
	return new UniqueBuilder(name, column);
}
