import type { Casing } from '~/casing.ts';
import { entityKind, is } from '~/entity.ts';
import { type SingleStoreTableFn, singlestoreTableWithSchema } from './table.ts';
/* import { type singlestoreView, singlestoreViewWithSchema } from './view.ts'; */

export class SingleStoreSchema<TName extends string = string> {
	static readonly [entityKind]: string = 'SingleStoreSchema';

	constructor(
		public readonly schemaName: TName,
		protected casing: Casing | undefined,
	) {}

	table: SingleStoreTableFn<TName> = (name, columns, extraConfig) => {
		return singlestoreTableWithSchema(name, columns, extraConfig, this.schemaName, this.casing);
	};
	/*
	view = ((name, columns) => {
		return singlestoreViewWithSchema(name, columns, this.schemaName);
	}) as typeof singlestoreView; */
}

/** @deprecated - use `instanceof SingleStoreSchema` */
export function isSingleStoreSchema(obj: unknown): obj is SingleStoreSchema {
	return is(obj, SingleStoreSchema);
}

/**
 * Create a SingleStore schema.
 * https://docs.singlestore.com/cloud/create-a-database/
 *
 * @param name singlestore use schema name
 * @returns SingleStore schema
 */
export function singlestoreDatabase<TName extends string>(name: TName): SingleStoreSchema<TName>;
/** @internal */
export function singlestoreDatabase<TName extends string>(name: TName, casing?: Casing): SingleStoreSchema<TName>;
/** @internal */
export function singlestoreDatabase<TName extends string>(name: TName, casing?: Casing): SingleStoreSchema<TName> {
	return new SingleStoreSchema(name, casing);
}

/**
 * @see singlestoreDatabase
 */
export const singlestoreSchema = singlestoreDatabase;
