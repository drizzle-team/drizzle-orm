import { type PgSchema, pgSchema } from './schema.ts';
import { pgTableWithCasing } from './table.ts';
import { pgMaterializedViewWithCasing, pgViewWithCasing } from './view.ts';

export const snakeCase = {
	table: pgTableWithCasing('snake_case'),
	view: pgViewWithCasing('snake_case'),
	materializedView: pgMaterializedViewWithCasing('snake_case'),
	schema: <T extends string>(name: T): PgSchema<T> => {
		return pgSchema(name, 'snake_case');
	},
};

export const camelCase = {
	table: pgTableWithCasing('camelCase'),
	view: pgViewWithCasing('camelCase'),
	materializedView: pgMaterializedViewWithCasing('camelCase'),
	schema: <T extends string>(name: T): PgSchema<T> => {
		return pgSchema(name, 'camelCase');
	},
};
