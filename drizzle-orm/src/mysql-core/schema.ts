import { type MySqlTableFn, mysqlTableWithSchema } from './table';
import { type mysqlView, mysqlViewWithSchema } from './view';

export class MySqlSchema<TName extends string = string> {
	constructor(
		public readonly schemaName: TName,
	) {}

	table: MySqlTableFn<TName> = (name, columns, extraConfig) => {
		return mysqlTableWithSchema(name, columns, extraConfig, this.schemaName);
	};

	view = ((name, columns) => {
		return mysqlViewWithSchema(name, columns, this.schemaName);
	}) as typeof mysqlView;
}

/** @deprecated - use `instanceof MySqlSchema` */
export function isMySqlSchema(obj: unknown): obj is MySqlSchema {
	return obj instanceof MySqlSchema;
}

/**
 * Create a MySQL schema.
 * https://dev.mysql.com/doc/refman/8.0/en/create-database.html
 *
 * @param name mysql use schema name
 * @returns MySQL schema
 */
export function mysqlDatabase<TName extends string>(name: TName) {
	return new MySqlSchema(name);
}

/**
 * @see mysqlDatabase
 */
export const mysqlSchema = mysqlDatabase;
