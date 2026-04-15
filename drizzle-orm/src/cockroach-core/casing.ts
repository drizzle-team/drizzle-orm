import { type CockroachSchema, cockroachSchema } from './schema.ts';
import { cockroachTableWithCasing } from './table.ts';
import { cockroachMaterializedViewWithCasing, cockroachViewWithCasing } from './view.ts';

export const snakeCase = {
	table: cockroachTableWithCasing('snake_case'),
	view: cockroachViewWithCasing('snake_case'),
	materializedView: cockroachMaterializedViewWithCasing('snake_case'),
	schema: <T extends string>(name: T): CockroachSchema<T> => {
		return cockroachSchema(name, 'snake_case');
	},
};

export const camelCase = {
	table: cockroachTableWithCasing('camelCase'),
	view: cockroachViewWithCasing('camelCase'),
	materializedView: cockroachMaterializedViewWithCasing('camelCase'),
	schema: <T extends string>(name: T): CockroachSchema<T> => {
		return cockroachSchema(name, 'camelCase');
	},
};
