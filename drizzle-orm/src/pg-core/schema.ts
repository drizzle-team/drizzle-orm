import type { DrizzleTypeError } from '~/utils';
import { type pgTable, pgTableWithSchema } from './table';
import { type pgMaterializedView, pgMaterializedViewWithSchema, type pgView, pgViewWithSchema } from './view';

export class PgSchema {
	constructor(
		public readonly schemaName: string,
	) {}

	table = ((name, columns, extraConfig) => {
		return pgTableWithSchema(name, columns, extraConfig, this.schemaName);
	}) as typeof pgTable;

	view = ((name, columns) => {
		return pgViewWithSchema(name, columns, this.schemaName);
	}) as typeof pgView;

	materializedView = ((name, columns) => {
		return pgMaterializedViewWithSchema(name, columns, this.schemaName);
	}) as typeof pgMaterializedView;
}

/** @deprecated - use `instanceof PgSchema` */
export function isPgSchema(obj: unknown): obj is PgSchema {
	return obj instanceof PgSchema;
}

type NoPublicSchemaError = DrizzleTypeError<
	"You can't specify 'public' as schema name. Postgres is using public schema by default. If you want to use 'public' schema, just use pgTable() instead of creating a schema"
>;

export function pgSchema<T extends string>(name: T extends 'public' ? NoPublicSchemaError : T) {
	if (name === 'public') {
		throw Error(`You can't specify 'public' as schema name. Postgres is using public schema by default`);
	}

	return new PgSchema(name);
}
