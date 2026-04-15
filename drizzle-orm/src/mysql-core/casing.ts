import { type MySqlSchema, mysqlSchema } from './schema.ts';
import { mysqlTableWithCasing } from './table.ts';
import { mysqlViewWithCasing } from './view.ts';

export const snakeCase = {
	table: mysqlTableWithCasing('snake_case'),
	view: mysqlViewWithCasing('snake_case'),
	schema: <T extends string>(name: T): MySqlSchema<T> => {
		return mysqlSchema(name, 'snake_case');
	},
};

export const camelCase = {
	table: mysqlTableWithCasing('camelCase'),
	view: mysqlViewWithCasing('camelCase'),
	schema: <T extends string>(name: T): MySqlSchema<T> => {
		return mysqlSchema(name, 'camelCase');
	},
};
