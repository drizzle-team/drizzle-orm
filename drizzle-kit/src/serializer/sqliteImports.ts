import { is } from 'drizzle-orm';
import { AnySQLiteTable, SQLiteTable, SQLiteView } from 'drizzle-orm/sqlite-core';
import { safeRegister } from '../cli/commands/utils';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnySQLiteTable[] = [];
	const views: SQLiteView[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, SQLiteTable)) {
			tables.push(t);
		}

		if (is(t, SQLiteView)) {
			views.push(t);
		}
	});

	return { tables, views };
};

export const prepareFromSqliteImports = async (imports: string[]) => {
	const tables: AnySQLiteTable[] = [];
	const views: SQLiteView[] = [];

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
