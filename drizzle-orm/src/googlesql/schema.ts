import { entityKind, is } from '~/entity.ts';
import { type GoogleSqlTableFn, googlesqlTableWithSchema } from './table.ts';
import { type googlesqlView, googlesqlViewWithSchema } from './view.ts';

export class GoogleSqlSchema<TName extends string = string> {
	static readonly [entityKind]: string = 'GoogleSqlSchema';

	constructor(
		public readonly schemaName: TName,
	) {}

	table: GoogleSqlTableFn<TName> = (name, columns, extraConfig) => {
		return googlesqlTableWithSchema(name, columns, extraConfig, this.schemaName);
	};

	view = ((name, columns) => {
		return googlesqlViewWithSchema(name, columns, this.schemaName);
	}) as typeof googlesqlView;
}

/** @deprecated - use `instanceof GoogleSqlSchema` */
export function isGoogleSqlSchema(obj: unknown): obj is GoogleSqlSchema {
	return is(obj, GoogleSqlSchema);
}

/**
 * Create a MySQL schema.
 * https://dev.mysql.com/doc/refman/8.0/en/create-database.html
 *
 * @param name googlesql use schema name
 * @returns MySQL schema
 */
export function googlesqlDatabase<TName extends string>(name: TName) {
	return new GoogleSqlSchema(name);
}

/**
 * @see googlesqlDatabase
 */
export const googlesqlSchema = googlesqlDatabase;
