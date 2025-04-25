import { is } from 'drizzle-orm';
import { AnyMsSqlTable, MsSqlTable, MsSqlView } from 'drizzle-orm/mssql-core';
import { safeRegister } from '../cli/commands/utils';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnyMsSqlTable[] = [];
	const views: MsSqlView[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, MsSqlTable)) {
			tables.push(t);
		}

		if (is(t, MsSqlView)) {
			views.push(t);
		}
	});

	return { tables, views };
};

export const prepareFromMsSqlImports = async (imports: string[]) => {
	const tables: AnyMsSqlTable[] = [];
	const views: MsSqlView[] = [];

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];
		const i0: Record<string, unknown> = require(`${it}`);
		const prepared = prepareFromExports(i0);

		tables.push(...prepared.tables);
		views.push(...prepared.views);
	}
	unregister();
	return { tables: Array.from(new Set(tables)), views };
};
