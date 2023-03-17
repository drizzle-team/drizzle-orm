import { type mysqlTable, mysqlTableWithSchema } from './table';
import { type mysqlView, mysqlViewWithSchema } from './view';

export class MySqlSchema {
	constructor(
		public readonly schemaName: string,
	) {}

	table: typeof mysqlTable = (name, columns, extraConfig) => {
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
export function mysqlDatabase(name: string) {
	return new MySqlSchema(name);
}

/**
 * @see mysqlDatabase
 */
export const mysqlSchema = mysqlDatabase;
