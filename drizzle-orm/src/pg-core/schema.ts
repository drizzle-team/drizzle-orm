import { entityKind, is } from '~/entity.ts';
import type { pgEnum } from './columns/enum.ts';
import { pgEnumWithSchema } from './columns/enum.ts';
import { type PgTableFn, pgTableWithSchema } from './table.ts';
import { type pgMaterializedView, pgMaterializedViewWithSchema, type pgView, pgViewWithSchema } from './view.ts';

export class PgSchema<TName extends string = string> {
	static readonly [entityKind]: string = 'PgSchema';
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

	enum: typeof pgEnum = ((name, values) => {
		return pgEnumWithSchema(name, values, this.schemaName);
	});
}

export function isPgSchema(obj: unknown): obj is PgSchema {
	return is(obj, PgSchema);
}

export function pgSchema<T extends string>(name: T) {
	if (name === 'public') {
		throw new Error(
			`You can't specify 'public' as schema name. Postgres is using public schema by default. If you want to use 'public' schema, just use pgTable() instead of creating a schema`,
		);
	}

	return new PgSchema(name);
}
