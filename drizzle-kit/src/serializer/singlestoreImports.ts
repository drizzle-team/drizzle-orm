import { is } from 'drizzle-orm';
import { AnySingleStoreTable, SingleStoreTable } from 'drizzle-orm/singlestore-core';
import { safeRegister } from '../cli/commands/utils';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnySingleStoreTable[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, SingleStoreTable)) {
			tables.push(t);
		}
	});

	return { tables };
};

export const prepareFromSingleStoreImports = async (imports: string[]) => {
	const tables: AnySingleStoreTable[] = [];

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];
		const i0: Record<string, unknown> = require(`${it}`);
		const prepared = prepareFromExports(i0);

		tables.push(...prepared.tables);
	}
	unregister();
	return { tables: Array.from(new Set(tables)) };
};
