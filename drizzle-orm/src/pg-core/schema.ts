import { type PgTableFn, pgTableWithSchema } from './table';
import { type pgMaterializedView, pgMaterializedViewWithSchema, type pgView, pgViewWithSchema } from './view';

export class PgSchema<TName extends string = string> {
	constructor(
		public readonly schemaName: TName,
	) {}

	table: PgTableFn<TName> = ((name, columns, extraConfig) => {
		return pgTableWithSchema(name, columns, extraConfig, this.schemaName);
	});

	view = ((name, columns) => {
		return pgViewWithSchema(name, columns, this.schemaName);
	}) as typeof pgView;

	materializedView = ((name, columns) => {
		return pgMaterializedViewWithSchema(name, columns, this.schemaName);
	}) as typeof pgMaterializedView;
}

export function isPgSchema(obj: unknown): obj is PgSchema {
	return obj instanceof PgSchema;
}

export function pgSchema<T extends string>(name: T) {
	if (name === 'public') {
		throw new Error(
			`You can't specify 'public' as schema name. Postgres is using public schema by default. If you want to use 'public' schema, just use pgTable() instead of creating a schema`,
		);
	}

	return new PgSchema(name);
}
