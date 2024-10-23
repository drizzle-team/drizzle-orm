import { is } from 'drizzle-orm';
import { AnyMySqlTable, MySqlTable, MySqlView } from 'drizzle-orm/mysql-core';
import { safeRegister } from '../cli/commands/utils';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnyMySqlTable[] = [];
	const views: MySqlView[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, MySqlTable)) {
			tables.push(t);
		}

		if (is(t, MySqlView)) {
			views.push(t);
		}
	});

	return { tables, views };
};

export const prepareFromMySqlImports = async (imports: string[]) => {
	const tables: AnyMySqlTable[] = [];
	const views: MySqlView[] = [];

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
