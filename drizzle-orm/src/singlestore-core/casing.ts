import { type SingleStoreSchema, singlestoreSchema } from './schema.ts';
import { singlestoreTableWithCasing } from './table.ts';

export const snakeCase = {
	table: singlestoreTableWithCasing('snake_case'),
	schema: <T extends string>(name: T): SingleStoreSchema<T> => {
		return singlestoreSchema(name, 'snake_case');
	},
};

export const camelCase = {
	table: singlestoreTableWithCasing('camelCase'),
	schema: <T extends string>(name: T): SingleStoreSchema<T> => {
		return singlestoreSchema(name, 'camelCase');
	},
};
