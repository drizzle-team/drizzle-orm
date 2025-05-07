import { entityKind } from '~/entity.ts';
import { type MsSqlTableFn, mssqlTableWithSchema } from './table.ts';
import { type mssqlView, mssqlViewWithSchema } from './view.ts';

export class MsSqlSchema<TName extends string = string> {
	static readonly [entityKind]: string = 'MsSqlSchema';

	constructor(
		public readonly schemaName: TName,
	) {}

	table: MsSqlTableFn<TName> = (name, columns, extraConfig) => {
		return mssqlTableWithSchema(name, columns, extraConfig, this.schemaName);
	};

	view = ((name, columns) => {
		return mssqlViewWithSchema(name, columns, this.schemaName);
	}) as typeof mssqlView;
}

/**
 * Create a MySQL schema.
 * https://dev.mssql.com/doc/refman/8.0/en/create-database.html
 *
 * @param name mssql use schema name
 * @returns MySQL schema
 */
export function mssqlDatabase<TName extends string>(name: TName) {
	return new MsSqlSchema(name);
}

/**
 * @see mssqlDatabase
 */
export const mssqlSchema = mssqlDatabase;
