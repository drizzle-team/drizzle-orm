import { Primitive } from 'drizzle-orm/sql';

import { AnyColumn, PgColumn, AnyPgTable } from '.';

export class IndexBuilder<TColumnType extends Primitive> {
	unique: boolean;
	name: string | undefined;

	constructor(unique: boolean, name?: string) {
		this.unique = unique;
		this.name = name;
	}

	build<TTableName extends string>(
		column: PgColumn<TTableName, TColumnType>,
	): Index<TTableName, TColumnType> {
		return new Index(column, this);
	}
}

export class Index<TTableName extends string, TColumnType extends Primitive> {
	column: PgColumn<TTableName, TColumnType>;
	unique: boolean;
	name: string | undefined;

	constructor(column: PgColumn<TTableName, TColumnType>, builder: IndexBuilder<TColumnType>) {
		this.column = column;
		this.unique = builder.unique;
		this.name = builder.name;
	}
}

export function index<TColumns extends AnyColumn[], TRefTableName extends string>(
	columns: TColumns,
	table: AnyPgTable<TRefTableName>,
	refColumns: TColumns,
) {
	return new IndexBuilder();
}

export function uniqueIndex() {}
