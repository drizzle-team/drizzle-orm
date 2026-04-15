import { type GelSchema, gelSchema } from './schema.ts';
import { gelTableWithCasing } from './table.ts';

export const snakeCase = {
	table: gelTableWithCasing('snake_case'),
	schema: <T extends string>(name: T): GelSchema<T> => {
		return gelSchema(name, 'snake_case');
	},
};

export const camelCase = {
	table: gelTableWithCasing('camelCase'),
	schema: <T extends string>(name: T): GelSchema<T> => {
		return gelSchema(name, 'camelCase');
	},
};
