import type { Casing } from '~/casing.ts';
import { entityKind, is } from '~/entity.ts';
import { type MySqlTableFn, mysqlTableWithSchema } from './table.ts';
import { type mysqlView, mysqlViewWithSchema } from './view.ts';

export class MySqlSchema<TName extends string = string> {
	static readonly [entityKind]: string = 'MySqlSchema';

	constructor(
		public readonly schemaName: TName,
		protected casing: Casing | undefined,
	) {}

	table: MySqlTableFn<TName> = (name, columns, extraConfig) => {
		return mysqlTableWithSchema(name, columns, extraConfig, this.schemaName, this.casing);
	};

	view = ((name, columns) => {
		return mysqlViewWithSchema(name, columns, this.schemaName, this.casing);
	}) as typeof mysqlView;
}

/** @deprecated - use `instanceof MySqlSchema` */
export function isMySqlSchema(obj: unknown): obj is MySqlSchema {
	return is(obj, MySqlSchema);
}

/**
 * Create a MySQL schema.
 * https://dev.mysql.com/doc/refman/8.0/en/create-database.html
 *
 * @param name mysql use schema name
 * @returns MySQL schema
 */
export function mysqlDatabase<TName extends string>(name: TName): MySqlSchema<TName>;
/** @internal */
export function mysqlDatabase<TName extends string>(name: TName, casing: Casing | undefined): MySqlSchema<TName>;
/** @internal */
export function mysqlDatabase<TName extends string>(name: TName, casing?: Casing): MySqlSchema<TName> {
	return new MySqlSchema(name, casing);
}

/**
 * @see mysqlDatabase
 */
export const mysqlSchema = mysqlDatabase;
