import { sqliteTableWithCasing } from './table.ts';
import { sqliteViewWithCasing } from './view.ts';

export const snakeCase = {
	table: sqliteTableWithCasing('snake_case'),
	view: sqliteViewWithCasing('snake_case'),
};

export const camelCase = {
	table: sqliteTableWithCasing('camelCase'),
	view: sqliteViewWithCasing('camelCase'),
};
