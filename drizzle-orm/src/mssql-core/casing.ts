import { type MsSqlSchema, mssqlSchema } from './schema.ts';
import { mssqlTableWithCasing } from './table.ts';
import { mssqlViewWithCasing } from './view.ts';

export const snakeCase = {
	table: mssqlTableWithCasing('snake_case'),
	view: mssqlViewWithCasing('snake_case'),
	schema: <T extends string>(name: T): MsSqlSchema<T> => {
		return mssqlSchema(name, 'snake_case');
	},
};

export const camelCase = {
	table: mssqlTableWithCasing('camelCase'),
	view: mssqlViewWithCasing('camelCase'),
	schema: <T extends string>(name: T): MsSqlSchema<T> => {
		return mssqlSchema(name, 'camelCase');
	},
};
