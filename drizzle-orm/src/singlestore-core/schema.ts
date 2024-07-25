import { entityKind, is } from '~/entity.ts';
import { type SingleStoreTableFn, singlestoreTableWithSchema } from './table.ts';
import { type singlestoreView, singlestoreViewWithSchema } from './view.ts';

export class SingleStoreSchema<TName extends string = string> {
	static readonly [entityKind]: string = 'SingleStoreSchema';

	constructor(
		public readonly schemaName: TName,
	) {}

	table: SingleStoreTableFn<'columnstore', TName> = (name, columns, extraConfig) => {
		return singlestoreTableWithSchema('columnstore', name, columns, extraConfig, this.schemaName);
	};

	view = ((name, columns) => {
		return singlestoreViewWithSchema(name, columns, this.schemaName);
	}) as typeof singlestoreView;
}

/** @deprecated - use `instanceof SingleStoreSchema` */
export function isSingleStoreSchema(obj: unknown): obj is SingleStoreSchema {
	return is(obj, SingleStoreSchema);
}

/**
 * Create a SingleStore schema.
 * https://dev.mysql.com/doc/refman/8.0/en/create-database.html
 * TODO(singlestore)
 *
 * @param name singlestore use schema name
 * @returns SingleStore schema
 */
export function singlestoreDatabase<TName extends string>(name: TName) {
	return new SingleStoreSchema(name);
}

/**
 * @see singlestoreDatabase
 */
export const singlestoreSchema = singlestoreDatabase;
