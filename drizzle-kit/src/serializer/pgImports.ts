import { is } from 'drizzle-orm';
import { AnyPgTable, isPgEnum, isPgSequence, PgEnum, PgSchema, PgSequence, PgTable } from 'drizzle-orm/pg-core';
import { safeRegister } from '../cli/commands/utils';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnyPgTable[] = [];
	const enums: PgEnum<any>[] = [];
	const schemas: PgSchema[] = [];
	const sequences: PgSequence[] = [];

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
	});

	return { tables, enums, schemas, sequences };
};

export const prepareFromPgImports = async (imports: string[]) => {
	let tables: AnyPgTable[] = [];
	let enums: PgEnum<any>[] = [];
	let schemas: PgSchema[] = [];
	let sequences: PgSequence[] = [];

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = await import(`${it}`);
		const prepared = prepareFromExports(i0);

		tables.push(...prepared.tables);
		enums.push(...prepared.enums);
		schemas.push(...prepared.schemas);
		sequences.push(...prepared.sequences);
	}
	unregister();

	return { tables: Array.from(new Set(tables)), enums, schemas, sequences };
};
