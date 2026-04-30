import { is } from 'drizzle-orm';
import type { AnyFirebirdTable } from 'drizzle-orm/firebird-core';
import { FirebirdTable, FirebirdView } from 'drizzle-orm/firebird-core';
import { safeRegister } from '../cli/commands/utils';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnyFirebirdTable[] = [];
	const views: FirebirdView[] = [];
	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, FirebirdTable)) tables.push(t);
		if (is(t, FirebirdView)) views.push(t);
	});
	return { tables, views };
};

export const prepareFromFirebirdImports = async (imports: string[]) => {
	const tables: AnyFirebirdTable[] = [];
	const views: FirebirdView[] = [];
	await safeRegister(async () => {
		for (let i = 0; i < imports.length; i++) {
			const it = imports[i];
			const i0: Record<string, unknown> = require(`${it}`);
			const prepared = prepareFromExports(i0);
			tables.push(...prepared.tables);
			views.push(...prepared.views);
		}
	});
	return { tables: Array.from(new Set(tables)), views };
};
