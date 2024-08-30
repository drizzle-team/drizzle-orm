import { is } from 'drizzle-orm';
import { AnyPgTable, isPgEnum, isPgSequence, PgEnum, PgRole, PgSchema, PgSequence, PgTable } from 'drizzle-orm/pg-core';
import { safeRegister } from '../cli/commands/utils';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnyPgTable[] = [];
	const enums: PgEnum<any>[] = [];
	const schemas: PgSchema[] = [];
	const sequences: PgSequence[] = [];
	const roles: PgRole[] = [];

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

		if (is(t, PgRole)) {
			roles.push(t);
		}
	});

	return { tables, enums, schemas, sequences, roles };
};

export const prepareFromPgImports = async (imports: string[]) => {
	let tables: AnyPgTable[] = [];
	let enums: PgEnum<any>[] = [];
	let schemas: PgSchema[] = [];
	let sequences: PgSequence[] = [];
	let roles: PgRole[] = [];

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = require(`${it}`);
		const prepared = prepareFromExports(i0);

		tables.push(...prepared.tables);
		enums.push(...prepared.enums);
		schemas.push(...prepared.schemas);
		sequences.push(...prepared.sequences);
		roles.push(...prepared.roles);
	}
	unregister();

	return { tables: Array.from(new Set(tables)), enums, schemas, sequences, roles };
};
