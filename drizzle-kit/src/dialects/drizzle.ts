import type { SQL } from 'drizzle-orm';
import { CasingCache, toCamelCase, toSnakeCase } from 'drizzle-orm/casing';
import type { CasingType } from '../cli/validations/common';

export const getColumnCasing = (
	column: { keyAsName: boolean; name: string | undefined },
	casing: CasingType | undefined,
) => {
	if (!column.name) return '';
	return !column.keyAsName || casing === undefined
		? column.name
		: casing === 'camelCase'
		? toCamelCase(column.name)
		: toSnakeCase(column.name);
};

export const sqlToStr = (sql: SQL, casing: CasingType | undefined) => {
	return sql.toQuery({
		escapeName: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		escapeParam: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		escapeString: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		casing: new CasingCache(casing),
	}).sql;
};
