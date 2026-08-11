import { is } from 'drizzle-orm';
import type { AnyClickHouseTable } from 'drizzle-orm/clickhouse-core';
import { ClickHouseTable } from 'drizzle-orm/clickhouse-core';
import { safeRegister } from '../cli/commands/utils';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnyClickHouseTable[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, ClickHouseTable)) {
			tables.push(t);
		}
	});

	return { tables };
};

export const prepareFromClickHouseImports = async (imports: string[]) => {
	const tables: AnyClickHouseTable[] = [];

	await safeRegister(async () => {
		for (let i = 0; i < imports.length; i++) {
			const it = imports[i];
			const i0: Record<string, unknown> = require(`${it}`);
			const prepared = prepareFromExports(i0);

			tables.push(...prepared.tables);
		}
	});

	return { tables: Array.from(new Set(tables)) };
};
