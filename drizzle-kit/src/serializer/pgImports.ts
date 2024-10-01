import { is } from 'drizzle-orm';
import { AnyPgTable, isPgEnum, isPgSequence, PgEnum, PgMaterializedView, PgSchema, PgSequence, PgTable, PgView } from 'drizzle-orm/pg-core';
import { safeRegister } from '../cli/commands/utils';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnyPgTable[] = [];
	const enums: PgEnum<any>[] = [];
	const schemas: PgSchema[] = [];
	const sequences: PgSequence[] = [];
	const views: PgView[] = [];
	const materializedViews: PgMaterializedView[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (isPgEnum(t)) {
			enums.push(t);
			return;
		}
		if (is(t, PgTable)) {
			tables.push(t);
		}

		if (is(t, PgSchema)) {
			schemas.push(t);
		}

		if (isPgSequence(t)) {
			sequences.push(t);
		}

		if (is(t, PgView)) {
			views.push(t);
		}

		if (is(t, PgMaterializedView)) {
			materializedViews.push(t);
		}
	});

	return { tables, enums, schemas, sequences, views, materializedViews };
};

export const prepareFromPgImports = async (imports: string[]) => {
	let tables: AnyPgTable[] = [];
	let enums: PgEnum<any>[] = [];
	let schemas: PgSchema[] = [];
	let sequences: PgSequence[] = [];

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = require(`${it}`);
		const prepared = prepareFromExports(i0);

		tables.push(...prepared.tables);
		enums.push(...prepared.enums);
		schemas.push(...prepared.schemas);
		sequences.push(...prepared.sequences);
	}
	unregister();

	return { tables: Array.from(new Set(tables)), enums, schemas, sequences };
};
